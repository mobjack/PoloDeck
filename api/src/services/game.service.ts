import type { FastifyInstance } from "fastify";
import {
  BreakPhase,
  DeviceType,
  GameEventType,
  GameStatus,
  TeamSide,
  type Prisma,
} from "../lib/prisma";
import {
  startClock,
  stopClock,
  setClockRemaining,
  getEffectiveRemainingMs,
} from "../lib/clock";
import {
  buildDeviceCapabilities,
  type DeviceCapabilities,
  type DeviceSummary,
} from "./deviceCapabilities";
import { env } from "../config/env";
import {
  rerunGameEventLog,
  sortEventsForRerun,
  type RebuildEventInput,
} from "./gameEventRerun";

export class GameService {
  constructor(private app: FastifyInstance) {}

  private get prisma() {
    return this.app.prisma;
  }

  private get io() {
    return this.app.io;
  }

  private notFound(message: string) {
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 404;
    return err;
  }

  private badRequest(message: string) {
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 400;
    return err;
  }

  private async emitState(gameId: string) {
    const aggregate = await this.getGameAggregate(gameId);
    this.io.to(`game:${gameId}`).emit("game:stateUpdated", { gameId, aggregate });
    return aggregate;
  }

  /** True if this period already has a GAME_CLOCK_STARTED (clock resume should not add another). */
  private async quarterStartAlreadyLogged(gameId: string): Promise<boolean> {
    const lastPeriodAdvance = await this.prisma.gameEvent.findFirst({
      where: { gameId, eventType: GameEventType.PERIOD_ADVANCED },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true, id: true },
    });

    const afterPeriod: Prisma.GameEventWhereInput = lastPeriodAdvance
      ? {
          OR: [
            { createdAt: { gt: lastPeriodAdvance.createdAt } },
            {
              createdAt: lastPeriodAdvance.createdAt,
              id: { gt: lastPeriodAdvance.id },
            },
          ],
        }
      : {};

    const existing = await this.prisma.gameEvent.findFirst({
      where: {
        gameId,
        eventType: GameEventType.GAME_CLOCK_STARTED,
        ...afterPeriod,
      },
      select: { id: true },
    });
    return existing != null;
  }

  private async createEvent(
    gameId: string,
    eventType: GameEventType,
    payload: Prisma.InputJsonValue,
    source: string
  ): Promise<string> {
    const created = await this.prisma.gameEvent.create({
      data: {
        gameId,
        eventType,
        payload,
        source,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async assertPlayerNotRolled(
    gameId: string,
    teamSide: TeamSide,
    capNumber: string
  ): Promise<void> {
    const events = await this.prisma.gameEvent.findMany({
      where: { gameId, eventType: GameEventType.EXCLUSION_STARTED },
      select: { payload: true },
    });
    const count = events.filter((ev) => {
      const p = ev.payload as Record<string, unknown> | null;
      return p?.teamSide === teamSide && String(p?.capNumber) === String(capNumber);
    }).length;
    if (count >= 3) {
      const teamName = teamSide === TeamSide.HOME ? "Dark" : "Light";
      throw this.badRequest(
        `Player ${capNumber} (${teamName}) has been rolled from the game, no updates possible.`
      );
    }
  }

  private mapDeviceToSummary(d: {
    id: string;
    clientId: string;
    type: DeviceType;
    name: string | null;
    gameId: string | null;
    lastCheckInAt: Date;
    updatedAt: Date;
    game?: { homeTeamName: string; awayTeamName: string } | null;
  }): DeviceSummary {
    return {
      id: d.id,
      clientId: d.clientId,
      type: d.type,
      name: d.name,
      gameId: d.gameId,
      homeTeamName: d.game?.homeTeamName ?? null,
      awayTeamName: d.game?.awayTeamName ?? null,
      lastCheckInAt: d.lastCheckInAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  async resolveActiveGameId(): Promise<string | null> {
    const gameDay = await this.prisma.gameDay.findFirst({
      where: { activeGameId: { not: null } },
      select: { activeGameId: true },
    });
    return gameDay?.activeGameId ?? null;
  }

  /** The single globally-active game (server-authoritative selection), or null. */
  async getActiveGameSummary(): Promise<{
    gameId: string;
    homeTeamName: string;
    awayTeamName: string;
  } | null> {
    const activeGameId = await this.resolveActiveGameId();
    if (!activeGameId) return null;
    const game = await this.prisma.game.findUnique({
      where: { id: activeGameId },
      select: { id: true, homeTeamName: true, awayTeamName: true },
    });
    if (!game) return null;
    return {
      gameId: game.id,
      homeTeamName: game.homeTeamName,
      awayTeamName: game.awayTeamName,
    };
  }

  /** Broadcast the current active game to all clients so timer controllers can follow it. */
  private async emitActiveGameChanged(): Promise<void> {
    const activeGame = await this.getActiveGameSummary();
    this.io.emit("active-game:changed", { activeGame });
  }

  private emitDeviceUpdated(device: DeviceSummary): void {
    this.io.to(`device:${device.clientId}`).emit("device:updated", { device });
  }

  private async notifyAssignedDevicesUpdated(): Promise<void> {
    const devices = await this.prisma.device.findMany({
      where: { type: { not: DeviceType.UNASSIGNED } },
      include: { game: { select: { homeTeamName: true, awayTeamName: true } } },
    });
    for (const d of devices) {
      this.emitDeviceUpdated(this.mapDeviceToSummary(d));
    }
  }

  private async syncAssignedDevicesToActiveGame(gameId: string | null): Promise<void> {
    await this.prisma.device.updateMany({
      where: { type: { not: DeviceType.UNASSIGNED } },
      data: { gameId },
    });
    await this.notifyAssignedDevicesUpdated();
  }

  async setActiveGame(gameDayId: string, gameId: string) {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, gameDayId },
    });
    if (!game) {
      throw this.badRequest("Game does not belong to this game day");
    }

    await this.prisma.$transaction([
      this.prisma.gameDay.updateMany({
        where: { id: { not: gameDayId }, activeGameId: { not: null } },
        data: { activeGameId: null },
      }),
      this.prisma.gameDay.update({
        where: { id: gameDayId },
        data: { activeGameId: gameId },
      }),
    ]);

    await this.syncAssignedDevicesToActiveGame(gameId);
    await this.emitActiveGameChanged();
    return this.getGameDay(gameDayId);
  }

  async checkInDevice(input: {
    clientId: string;
    name?: string;
    role?: "TIMER";
  }): Promise<DeviceSummary> {
    const now = new Date();
    const gameInclude = { select: { homeTeamName: true, awayTeamName: true } as const };

    const existing = await this.prisma.device.findUnique({
      where: { clientId: input.clientId },
    });

    const activeGameId = await this.resolveActiveGameId();

    // A browser controller can self-assign its role (e.g. the mobile timer operator page),
    // promoting a new or still-unassigned device so it counts toward capabilities.
    const selfAssignType =
      input.role === "TIMER" &&
      (!existing || existing.type === DeviceType.UNASSIGNED)
        ? DeviceType.TIMER
        : undefined;

    if (existing) {
      const nextType = selfAssignType ?? existing.type;
      const syncGameId =
        nextType !== DeviceType.UNASSIGNED && activeGameId && existing.gameId !== activeGameId
          ? activeGameId
          : undefined;

      const updated = await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(selfAssignType !== undefined ? { type: selfAssignType } : {}),
          lastCheckInAt: now,
          ...(syncGameId !== undefined ? { gameId: syncGameId } : {}),
        },
        include: { game: gameInclude },
      });
      const summary = this.mapDeviceToSummary(updated);
      this.emitDeviceUpdated(summary);
      return summary;
    }

    const created = await this.prisma.device.create({
      data: {
        clientId: input.clientId,
        type: selfAssignType ?? DeviceType.UNASSIGNED,
        name: input.name,
        lastCheckInAt: now,
        ...(selfAssignType !== undefined && activeGameId ? { gameId: activeGameId } : {}),
      },
      include: { game: gameInclude },
    });

    const summary = this.mapDeviceToSummary(created);
    if (selfAssignType !== undefined) this.emitDeviceUpdated(summary);
    return summary;
  }

  async patchDevice(
    deviceId: string,
    input: { type?: DeviceType; gameId?: string | null }
  ): Promise<DeviceSummary> {
    const existing = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!existing) {
      throw this.notFound("Device not found");
    }

    let nextType = input.type ?? existing.type;
    let nextGameId = existing.gameId;

    if (nextType === DeviceType.UNASSIGNED) {
      nextGameId = null;
    } else {
      const activeGameId = await this.resolveActiveGameId();
      if (!activeGameId) {
        throw this.badRequest("Set the live game on the game day page first");
      }
      nextGameId = activeGameId;
    }

    if (nextType !== DeviceType.UNASSIGNED) {
      const game = await this.prisma.game.findUnique({ where: { id: nextGameId! } });
      if (!game) {
        throw this.badRequest("Game not found");
      }
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: { type: nextType, gameId: nextGameId },
      include: { game: { select: { homeTeamName: true, awayTeamName: true } } },
    });

    const summary = this.mapDeviceToSummary(updated);
    this.emitDeviceUpdated(summary);
    return summary;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    const existing = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!existing) {
      throw this.notFound("Device not found");
    }
    await this.prisma.device.delete({ where: { id: deviceId } });
  }

  async deleteGame(gameId: string): Promise<void> {
    const existing = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!existing) {
      throw this.notFound("Game not found");
    }
    await this.prisma.game.delete({ where: { id: gameId } });
  }

  async listAllDevices(): Promise<DeviceSummary[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: { createdAt: "asc" },
      include: { game: { select: { homeTeamName: true, awayTeamName: true } } },
    });

    return devices.map((d) => this.mapDeviceToSummary(d));
  }

  async getGlobalDeviceCapabilities(): Promise<DeviceCapabilities> {
    const devices = await this.listAllDevices();
    const caps = buildDeviceCapabilities({
      now: new Date(),
      devices,
      staleAfterMs: env.DEVICE_STALE_AFTER_MS,
    });
    return caps;
  }

  private formatGameDayRow(gd: {
    id: string;
    date: Date;
    location: string;
    defaultQuarterDurationMs: number;
    defaultBreakBetweenQuartersMs: number;
    defaultHalftimeDurationMs: number;
    activeGameId: string | null;
    createdAt: Date;
    updatedAt: Date;
    games: Array<{
      scheduledAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      score: { homeScore: number; awayScore: number } | null;
      [key: string]: unknown;
    }>;
  }) {
    type GameRow = (typeof gd.games)[number];
    return {
      ...gd,
      date: gd.date.toISOString().slice(0, 10),
      activeGameId: gd.activeGameId,
      games: gd.games.map((g: GameRow) => ({
        ...g,
        scheduledAt: g.scheduledAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
    };
  }

  /** If exactly one game on the day and no live game set, default to that game. */
  private async ensureActiveGameDefault(gameDayId: string): Promise<void> {
    const gd = await this.prisma.gameDay.findUnique({
      where: { id: gameDayId },
      include: { games: { select: { id: true } } },
    });
    if (!gd || gd.activeGameId || gd.games.length !== 1) return;
    const gameId = gd.games[0]!.id;
    await this.prisma.gameDay.update({
      where: { id: gameDayId },
      data: { activeGameId: gameId },
    });
    await this.syncAssignedDevicesToActiveGame(gameId);
  }

  // --- Game day ---
  async createGameDay(input: {
    date: string;
    location: string;
    defaultQuarterDurationMs: number;
    defaultBreakBetweenQuartersMs: number;
    defaultHalftimeDurationMs: number;
  }) {
    const gameDay = await this.prisma.gameDay.create({
      data: {
        date: new Date(input.date),
        location: input.location,
        defaultQuarterDurationMs: input.defaultQuarterDurationMs,
        defaultBreakBetweenQuartersMs: input.defaultBreakBetweenQuartersMs,
        defaultHalftimeDurationMs: input.defaultHalftimeDurationMs,
      },
    });
    return gameDay;
  }

  async listGameDays() {
    const list = await this.prisma.gameDay.findMany({
      orderBy: { date: "desc" },
      include: {
        games: {
          orderBy: [{ orderInDay: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
          include: { score: true },
        },
      },
    });
    for (const gd of list) {
      if (!gd.activeGameId && gd.games.length === 1) {
        await this.ensureActiveGameDefault(gd.id);
      }
    }
    const refreshed = await this.prisma.gameDay.findMany({
      orderBy: { date: "desc" },
      include: {
        games: {
          orderBy: [{ orderInDay: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
          include: { score: true },
        },
      },
    });
    return refreshed.map((gd) => this.formatGameDayRow(gd));
  }

  async getGameDay(gameDayId: string) {
    await this.ensureActiveGameDefault(gameDayId);
    const gameDay = await this.prisma.gameDay.findUnique({
      where: { id: gameDayId },
      include: {
        games: {
          orderBy: [{ orderInDay: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
          include: { score: true },
        },
      },
    });
    if (!gameDay) throw this.notFound("Game day not found");
    return this.formatGameDayRow(gameDay);
  }

  async updateGameDay(
    gameDayId: string,
    input: {
      date?: string;
      location?: string;
      defaultQuarterDurationMs?: number;
      defaultBreakBetweenQuartersMs?: number;
      defaultHalftimeDurationMs?: number;
      activeGameId?: string | null;
    }
  ) {
    const existing = await this.prisma.gameDay.findUnique({ where: { id: gameDayId } });
    if (!existing) throw this.notFound("Game day not found");

    if (input.activeGameId !== undefined && input.activeGameId !== null) {
      return this.setActiveGame(gameDayId, input.activeGameId);
    }

    const data: {
      date?: Date;
      location?: string;
      defaultQuarterDurationMs?: number;
      defaultBreakBetweenQuartersMs?: number;
      defaultHalftimeDurationMs?: number;
      activeGameId?: string | null;
    } = {};
    if (input.date != null) data.date = new Date(input.date);
    if (input.location != null) data.location = input.location;
    if (input.defaultQuarterDurationMs != null) data.defaultQuarterDurationMs = input.defaultQuarterDurationMs;
    if (input.defaultBreakBetweenQuartersMs != null) data.defaultBreakBetweenQuartersMs = input.defaultBreakBetweenQuartersMs;
    if (input.defaultHalftimeDurationMs != null) data.defaultHalftimeDurationMs = input.defaultHalftimeDurationMs;
    if (input.activeGameId === null) {
      data.activeGameId = null;
      await this.prisma.gameDay.update({ where: { id: gameDayId }, data });
      await this.syncAssignedDevicesToActiveGame(null);
      await this.emitActiveGameChanged();
      return this.getGameDay(gameDayId);
    }

    await this.prisma.gameDay.update({
      where: { id: gameDayId },
      data,
    });
    return this.getGameDay(gameDayId);
  }

  async createGame(input: {
    gameDayId?: string;
    scheduledAt?: string;
    homeTeamName: string;
    awayTeamName: string;
    level?: string;
    gender?: string;
    gameType?: string;
    totalPeriods?: number;
    gameClockDurationMs?: number;
    shotClockDurationMs?: number;
    quarterDurationMs?: number;
    breakBetweenQuartersDurationMs?: number;
    halftimeDurationMs?: number;
  }) {
    let totalPeriods = input.totalPeriods ?? 4;
    let gameClockDurationMs = input.gameClockDurationMs ?? input.quarterDurationMs;
    let shotClockDurationMs = input.shotClockDurationMs;
    let quarterDurationMs = input.quarterDurationMs;
    let breakBetweenQuartersDurationMs = input.breakBetweenQuartersDurationMs;
    let halftimeDurationMs = input.halftimeDurationMs;

    if (input.gameDayId) {
      const gameDay = await this.prisma.gameDay.findUnique({
        where: { id: input.gameDayId },
      });
      if (gameDay) {
        if (gameClockDurationMs == null) gameClockDurationMs = gameDay.defaultQuarterDurationMs;
        if (quarterDurationMs == null) quarterDurationMs = gameDay.defaultQuarterDurationMs;
        if (breakBetweenQuartersDurationMs == null) breakBetweenQuartersDurationMs = gameDay.defaultBreakBetweenQuartersMs;
        if (halftimeDurationMs == null) halftimeDurationMs = gameDay.defaultHalftimeDurationMs;
        if (shotClockDurationMs == null) shotClockDurationMs = 30 * 1000;
      }
    }
    if (gameClockDurationMs == null) gameClockDurationMs = 8 * 60 * 1000;
    if (quarterDurationMs == null) quarterDurationMs = 8 * 60 * 1000;
    if (breakBetweenQuartersDurationMs == null) breakBetweenQuartersDurationMs = 2 * 60 * 1000;
    if (halftimeDurationMs == null) halftimeDurationMs = 5 * 60 * 1000;
    if (shotClockDurationMs == null) shotClockDurationMs = 30 * 1000;

    const maxOrder = input.gameDayId
      ? await this.prisma.game
          .aggregate({
            where: { gameDayId: input.gameDayId },
            _max: { orderInDay: true },
          })
          .then((r: { _max: { orderInDay: number | null } }) => (r._max.orderInDay ?? -1) + 1)
      : 0;

    const game = await this.prisma.game.create({
      data: {
        gameDayId: input.gameDayId ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        homeTeamName: input.homeTeamName,
        awayTeamName: input.awayTeamName,
        level: input.level ?? null,
        gender: input.gender ?? null,
        gameType: input.gameType ?? null,
        orderInDay: input.gameDayId ? maxOrder : null,
        totalPeriods,
        quarterDurationMs,
        breakBetweenQuartersDurationMs,
        halftimeDurationMs,
        shotClockDurationMs,
        score: { create: {} },
        gameClock: {
          create: {
            durationMs: gameClockDurationMs,
            remainingMs: gameClockDurationMs,
          },
        },
        shotClock: {
          create: {
            durationMs: shotClockDurationMs,
            remainingMs: shotClockDurationMs,
          },
        },
        timeoutStates: {
          create: [
            { teamSide: TeamSide.HOME, fullTimeoutsRemaining: 2, shortTimeoutsRemaining: 1 },
            { teamSide: TeamSide.AWAY, fullTimeoutsRemaining: 2, shortTimeoutsRemaining: 1 },
          ],
        },
      },
    });

    await this.createEvent(
      game.id,
      GameEventType.GAME_CREATED,
      {
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
        totalPeriods: game.totalPeriods,
      },
      "server"
    );

    if (input.gameDayId) {
      const gameCount = await this.prisma.game.count({ where: { gameDayId: input.gameDayId } });
      if (gameCount === 1) {
        await this.prisma.gameDay.update({
          where: { id: input.gameDayId },
          data: { activeGameId: game.id },
        });
        await this.syncAssignedDevicesToActiveGame(game.id);
      }
    }

    return this.emitState(game.id);
  }

  async updateGame(
    gameId: string,
    input: {
      scheduledAt?: string | null;
      homeTeamName?: string;
      awayTeamName?: string;
      level?: string | null;
      gender?: string | null;
      gameType?: string | null;
      orderInDay?: number | null;
      quarterDurationMs?: number;
      breakBetweenQuartersDurationMs?: number;
      halftimeDurationMs?: number;
      shotClockDurationMs?: number;
      status?: GameStatus;
    }
  ) {
    const existing = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    if (!existing) throw this.notFound("Game not found");
    const data: {
      scheduledAt?: Date | null;
      homeTeamName?: string;
      awayTeamName?: string;
      level?: string | null;
      gender?: string | null;
      gameType?: string | null;
      orderInDay?: number | null;
      quarterDurationMs?: number;
      breakBetweenQuartersDurationMs?: number;
      halftimeDurationMs?: number;
      status?: GameStatus;
    } = {};
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.homeTeamName != null) data.homeTeamName = input.homeTeamName;
    if (input.awayTeamName != null) data.awayTeamName = input.awayTeamName;
    if (input.level !== undefined) data.level = input.level;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.gameType !== undefined) data.gameType = input.gameType;
    if (input.orderInDay !== undefined) data.orderInDay = input.orderInDay;
    if (input.quarterDurationMs !== undefined) data.quarterDurationMs = input.quarterDurationMs;
    if (input.breakBetweenQuartersDurationMs !== undefined) data.breakBetweenQuartersDurationMs = input.breakBetweenQuartersDurationMs;
    if (input.halftimeDurationMs !== undefined) data.halftimeDurationMs = input.halftimeDurationMs;
    if (input.status !== undefined) data.status = input.status;
    const now = Date.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: gameId },
        data,
      });
      if (
        input.quarterDurationMs !== undefined &&
        existing.gameClock &&
        existing.breakPhase === BreakPhase.NONE
      ) {
        const g = existing.gameClock;
        const d = input.quarterDurationMs;
        const eff = getEffectiveRemainingMs(
          {
            durationMs: g.durationMs,
            remainingMs: g.remainingMs,
            running: g.running,
            lastStartedAt: g.lastStartedAt,
          },
          now
        );
        const newRem = g.running ? Math.min(eff, d) : d;
        await tx.gameClock.update({
          where: { id: g.id },
          data: {
            durationMs: d,
            remainingMs: newRem,
            lastStartedAt: g.running ? new Date(now) : null,
            running: g.running,
          },
        });
      }
      if (input.shotClockDurationMs !== undefined) {
        await tx.game.update({
          where: { id: gameId },
          data: { shotClockDurationMs: input.shotClockDurationMs },
        });
        if (existing.shotClock && existing.breakPhase === BreakPhase.NONE) {
          const s = existing.shotClock;
          const d = input.shotClockDurationMs;
          const eff = getEffectiveRemainingMs(
            {
              durationMs: s.durationMs,
              remainingMs: s.remainingMs,
              running: s.running,
              lastStartedAt: s.lastStartedAt,
            },
            now
          );
          const newRem = s.running ? Math.min(eff, d) : d;
          await tx.shotClock.update({
            where: { id: s.id },
            data: {
              durationMs: d,
              remainingMs: newRem,
              lastStartedAt: s.running ? new Date(now) : null,
              running: s.running,
            },
          });
        }
      }
    });
    return this.emitState(gameId);
  }

  async getGameAggregate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        score: true,
        gameClock: true,
        shotClock: true,
        timeoutStates: true,
        players: true,
        exclusions: {
          where: { status: "ACTIVE" },
        },
        // Full history required: roster/quarter breakdown replays PERIOD_ADVANCED + goals in order.
        // A cap (e.g. 50) misattributes goals to wrong periods once early events fall off the window.
        events: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!game) {
      throw this.notFound("Game not found");
    }

    return game;
  }

  async adjustScore(
    gameId: string,
    side: TeamSide,
    delta: 1 | -1,
    capNumber?: string,
    timeSeconds?: number
  ) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game || !game.score) {
      throw this.notFound("Game not found");
    }

    const field = side === TeamSide.HOME ? "homeScore" : "awayScore";
    const current = game.score[field];
    const next = Math.max(0, current + delta);

    await this.prisma.score.update({
      where: { id: game.score.id },
      data: {
        [field]: next,
      },
    });

    const eventType =
      side === TeamSide.HOME
        ? GameEventType.GOAL_HOME
        : GameEventType.GOAL_AWAY;

    const homeScore = side === TeamSide.HOME ? next : game.score.homeScore;
    const awayScore = side === TeamSide.AWAY ? next : game.score.awayScore;
    const payload: {
      side: TeamSide;
      delta: number;
      capNumber?: string;
      homeScore: number;
      awayScore: number;
      timeSeconds?: number;
    } = { side, delta, homeScore, awayScore };
    if (capNumber != null) payload.capNumber = capNumber;
    if (timeSeconds != null) payload.timeSeconds = timeSeconds;

    await this.createEvent(gameId, eventType, payload, "operator");

    return this.emitState(gameId);
  }

  async startGameClock(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { currentPeriod: true, breakPhase: true },
    });
    if (!game) {
      throw this.notFound("Game not found");
    }

    const clock = await this.prisma.gameClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Game clock not found");
    }

    if (clock.running) {
      return this.emitState(gameId);
    }

    const newState = startClock({
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    });

    await this.prisma.gameClock.update({
      where: { id: clock.id },
      data: {
        running: newState.running,
        lastStartedAt: newState.lastStartedAt,
      },
    });

    if (!(await this.quarterStartAlreadyLogged(gameId))) {
      await this.createEvent(
        gameId,
        GameEventType.GAME_CLOCK_STARTED,
        { period: game.currentPeriod },
        "operator"
      );
    }
    // During breaks the shot clock stays at 00 — do not resync with game start.
    if (game.breakPhase === BreakPhase.NONE) {
      await this.resyncShotClockWithGameStart(gameId);
    }
    return this.emitState(gameId);
  }

  async stopGameClock(gameId: string) {
    const clock = await this.prisma.gameClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Game clock not found");
    }

    const newState = stopClock({
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    });

    await this.prisma.gameClock.update({
      where: { id: clock.id },
      data: {
        running: newState.running,
        remainingMs: newState.remainingMs,
        lastStartedAt: newState.lastStartedAt,
      },
    });

    await this.createEvent(gameId, GameEventType.GAME_CLOCK_STOPPED, {}, "operator");
    await this.stopShotClockIfRunning(gameId);
    return this.emitState(gameId);
  }

  /**
   * When the game clock starts, the shot must run with a fresh anchor. We materialize
   * (stop), then start so we never no-op on `running: true` with a missing/invalid
   * `lastStartedAt`, or a stale "shot running" row left from before game/shot coupling.
   */
  private async resyncShotClockWithGameStart(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }
    const now = Date.now();
    const before = {
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    };
    const afterStop = stopClock(before, now);
    const afterStart = startClock(afterStop, now);
    if (before.running) {
      await this.createEvent(
        gameId,
        GameEventType.SHOT_CLOCK_STOPPED,
        {},
        "operator"
      );
    }
    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        running: afterStart.running,
        remainingMs: afterStart.remainingMs,
        lastStartedAt: afterStart.lastStartedAt,
      },
    });
    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_STARTED,
      {},
      "operator"
    );
  }

  /** Standalone "start shot" (admin): only start if not already in a good running state. */
  private async startShotClockIfStopped(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }
    if (clock.running && clock.lastStartedAt != null) {
      return;
    }
    await this.resyncShotClockWithGameStart(gameId);
  }

  /** When game clock stops, the shot clock must stop (idempotent if already stopped). */
  private async stopShotClockIfRunning(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }
    if (!clock.running) {
      return;
    }
    const newState = stopClock({
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    });
    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        running: newState.running,
        remainingMs: newState.remainingMs,
        lastStartedAt: newState.lastStartedAt,
      },
    });
    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_STOPPED,
      {},
      "operator"
    );
  }

  async setGameClock(gameId: string, remainingMs: number, options?: { skipEvent?: boolean }) {
    const clock = await this.prisma.gameClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Game clock not found");
    }

    const newState = setClockRemaining(
      {
        durationMs: clock.durationMs,
        remainingMs: clock.remainingMs,
        running: clock.running,
        lastStartedAt: clock.lastStartedAt,
      },
      remainingMs
    );

    await this.prisma.gameClock.update({
      where: { id: clock.id },
      data: {
        remainingMs: newState.remainingMs,
        lastStartedAt: newState.lastStartedAt,
      },
    });

    if (!options?.skipEvent) {
      await this.createEvent(
        gameId,
        GameEventType.GAME_CLOCK_SET,
        { remainingMs: newState.remainingMs },
        "operator"
      );
    }
    return this.emitState(gameId);
  }

  private assertClockCommandsAllowed(game: {
    breakAfterPeriod: number | null;
    breakPhase: BreakPhase;
  }) {
    if (game.breakAfterPeriod != null && game.breakPhase === BreakPhase.NONE) {
      throw this.badRequest("Start break with sb before using clock commands.");
    }
  }

  async startShotClock(gameId: string) {
    await this.startShotClockIfStopped(gameId);
    return this.emitState(gameId);
  }

  async stopShotClock(gameId: string) {
    await this.stopShotClockIfRunning(gameId);
    return this.emitState(gameId);
  }

  async resetShotClock(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    const clock = game?.shotClock;
    if (!game || !clock) {
      throw this.notFound("Game or shot clock not found");
    }

    const now = Date.now();
    // Frozen "time at this instant" for undo (not a live/background running process in the log).
    const priorRemainingMs = getEffectiveRemainingMs(
      {
        durationMs: clock.durationMs,
        remainingMs: clock.remainingMs,
        running: clock.running,
        lastStartedAt: clock.lastStartedAt,
      },
      now
    );
    const priorRunning = clock.running;

    const gameTimeRunning = game.gameClock?.running ?? false;
    const newData = gameTimeRunning
      ? {
          remainingMs: clock.durationMs,
          running: true,
          lastStartedAt: new Date(now),
        }
      : {
          remainingMs: clock.durationMs,
          running: false,
          lastStartedAt: null,
        };

    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: newData,
    });

    // priorRemainingMs = display time *at* reset. priorRunning = was the display actively
    // counting. We do not store priorLastStartedAt (avoids a "background" live clock in the
    // event; undo re-anchors with lastStartedAt = now if game + priorRunning warrant it).
    const resetPayload: Prisma.InputJsonValue = {
      durationMs: clock.durationMs,
      priorRemainingMs,
      priorRunning,
    };
    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_RESET,
      resetPayload,
      "operator"
    );
    return this.emitState(gameId);
  }

  async undoLastShotClockReset(gameId: string) {
    const [resets, undones] = await Promise.all([
      this.prisma.gameEvent.findMany({
        where: { gameId, eventType: GameEventType.SHOT_CLOCK_RESET },
        orderBy: { createdAt: "desc" },
        select: { id: true, payload: true },
      }),
      this.prisma.gameEvent.findMany({
        where: { gameId, eventType: GameEventType.SHOT_CLOCK_RESET_UNDONE },
        select: { payload: true },
      }),
    ]);

    const undoneResetIds = new Set(
      undones
        .map((e) => {
          const p = e.payload as Record<string, unknown> | null;
          return p != null && typeof p.resetEventId === "string" ? p.resetEventId : null;
        })
        .filter((x): x is string => x != null)
    );

    const reset = resets.find((r) => {
      if (undoneResetIds.has(r.id)) return false;
      const p = r.payload as Record<string, unknown> | null;
      return (
        p != null &&
        typeof p.priorRemainingMs === "number" &&
        typeof p.priorRunning === "boolean"
      );
    });
    if (!reset) {
      throw this.badRequest("No shot clock reset to undo");
    }

    const p = reset.payload as Record<string, unknown>;
    const priorMs = p.priorRemainingMs as number;
    const wasCounting = p.priorRunning as boolean;
    const hasLegacyLastStarted = Object.prototype.hasOwnProperty.call(
      p,
      "priorLastStartedAt"
    );

    const fullGame = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    const gClock = fullGame?.gameClock;
    const gameRunning = gClock?.running ?? false;

    const clock = fullGame?.shotClock;
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }

    const remaining = Math.max(0, priorMs);
    let running: boolean;
    let lastStartedAt: Date | null;

    if (hasLegacyLastStarted) {
      // Older events: exact row snapshot including prior lastStartedAt.
      running = wasCounting;
      const raw = p.priorLastStartedAt;
      if (raw != null && String(raw) !== "") {
        lastStartedAt = new Date(String(raw));
        if (Number.isNaN(lastStartedAt.getTime())) {
          lastStartedAt = null;
        }
      } else {
        lastStartedAt = null;
      }
    } else {
      // New events: a frozen "time at reset" + whether the display was elapsing; no live
      // process stashed. If undo should be a running shot, re-anchor to now.
      if (gameRunning && wasCounting) {
        running = true;
        lastStartedAt = new Date();
      } else {
        running = false;
        lastStartedAt = null;
      }
    }

    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        remainingMs: remaining,
        running,
        lastStartedAt,
      },
    });

    const undoPayload: Prisma.InputJsonValue = {
      resetEventId: reset.id,
      restoredRemainingMs: remaining,
      restoredRunning: running,
      restoredLastStartedAt: lastStartedAt?.toISOString() ?? null,
    };
    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_RESET_UNDONE,
      undoPayload,
      "operator"
    );
    return this.emitState(gameId);
  }

  async setShotClock(gameId: string, remainingMs: number) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }

    const newState = setClockRemaining(
      {
        durationMs: clock.durationMs,
        remainingMs: clock.remainingMs,
        running: clock.running,
        lastStartedAt: clock.lastStartedAt,
      },
      remainingMs
    );

    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        remainingMs: newState.remainingMs,
        lastStartedAt: newState.lastStartedAt,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_SET,
      { remainingMs: newState.remainingMs },
      "operator"
    );
    return this.emitState(gameId);
  }

  /** Regulation shot length while not in a break (break overwrites clock rows). */
  private getRegulationShotDurationMs(game: { shotClockDurationMs: number }): number {
    return game.shotClockDurationMs;
  }

  private getBreakConfig(
    game: {
      currentPeriod: number;
      totalPeriods: number;
      breakBetweenQuartersDurationMs: number;
      halftimeDurationMs: number;
    },
    afterPeriod: number
  ): { kind: BreakPhase; durationMs: number } | null {
    if (afterPeriod >= game.totalPeriods) return null;
    if (afterPeriod === 2) {
      if (game.halftimeDurationMs <= 0) return null;
      return { kind: BreakPhase.HALFTIME, durationMs: game.halftimeDurationMs };
    }
    if (game.breakBetweenQuartersDurationMs <= 0) return null;
    return {
      kind: BreakPhase.QUARTER_BREAK,
      durationMs: game.breakBetweenQuartersDurationMs,
    };
  }

  private async setClocksToBreakDuration(
    gameId: string,
    durationMs: number,
    running: boolean
  ): Promise<void> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    if (!game?.gameClock || !game.shotClock) {
      throw this.notFound("Game clocks not found");
    }
    await this.prisma.gameClock.update({
      where: { id: game.gameClock.id },
      data: {
        durationMs,
        remainingMs: durationMs,
        running,
        lastStartedAt: running ? new Date() : null,
      },
    });
    await this.prisma.shotClock.update({
      where: { id: game.shotClock.id },
      data: {
        durationMs: 0,
        remainingMs: 0,
        running: false,
        lastStartedAt: null,
      },
    });
  }

  /** After eq: mark break pending or finalize/skip when no break applies. */
  private async afterQuarterEnded(gameId: string, afterPeriod: number) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw this.notFound("Game not found");

    if (afterPeriod >= game.totalPeriods) {
      await this.prisma.game.update({
        where: { id: gameId },
        data: { status: GameStatus.FINAL, breakAfterPeriod: null },
      });
      return this.emitState(gameId);
    }

    const config = this.getBreakConfig(game, afterPeriod);
    if (!config) {
      return this.advancePeriod(gameId);
    }

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        breakAfterPeriod: afterPeriod,
        breakPhase: BreakPhase.NONE,
        status: GameStatus.IN_PROGRESS,
      },
    });
    await this.createEvent(
      gameId,
      GameEventType.QUARTER_ENDED,
      { afterPeriod } as Prisma.InputJsonValue,
      "operator"
    );
    return this.emitState(gameId);
  }

  /** sq while break pending: skip break and advance to next period. */
  private async skipPendingBreakAndAdvancePeriod(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game) throw this.notFound("Game not found");

    const from = game.currentPeriod;
    const nextPeriod = Math.min(game.totalPeriods, from + 1);

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        breakAfterPeriod: null,
        breakPhase: BreakPhase.NONE,
        currentPeriod: nextPeriod,
        status: GameStatus.IN_PROGRESS,
      },
    });

    const payload: Record<string, unknown> = {
      from,
      to: nextPeriod,
      skippedBreak: true,
    };
    if (game.score) {
      payload.homeScore = game.score.homeScore;
      payload.awayScore = game.score.awayScore;
    }
    await this.createEvent(
      gameId,
      GameEventType.PERIOD_ADVANCED,
      payload as Prisma.InputJsonValue,
      "operator"
    );
    await this.resetClocksForQuarterPlay(gameId);
    return this.emitState(gameId);
  }

  private async resetClocksForQuarterPlay(gameId: string): Promise<void> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    if (!game?.gameClock || !game.shotClock) {
      throw this.notFound("Game clocks not found");
    }
    const quarterMs = game.quarterDurationMs;
    const shotMs = this.getRegulationShotDurationMs(game);
    await this.prisma.gameClock.update({
      where: { id: game.gameClock.id },
      data: {
        durationMs: quarterMs,
        remainingMs: quarterMs,
        running: false,
        lastStartedAt: null,
      },
    });
    await this.prisma.shotClock.update({
      where: { id: game.shotClock.id },
      data: {
        durationMs: shotMs,
        remainingMs: shotMs,
        running: false,
        lastStartedAt: null,
      },
    });
  }

  async startBreak(gameId: string, afterPeriod: number) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { gameClock: true, shotClock: true },
    });
    if (!game) throw this.notFound("Game not found");

    if (game.breakPhase !== BreakPhase.NONE) {
      return this.emitState(gameId);
    }

    const config = this.getBreakConfig(game, afterPeriod);
    if (!config) {
      if (afterPeriod >= game.totalPeriods) {
        await this.prisma.game.update({
          where: { id: gameId },
          data: { status: GameStatus.FINAL },
        });
        return this.emitState(gameId);
      }
      return this.advancePeriod(gameId);
    }

    await this.setClocksToBreakDuration(gameId, config.durationMs, false);
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        breakPhase: config.kind,
        breakAfterPeriod: afterPeriod,
        status: GameStatus.IN_PROGRESS,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.BREAK_STARTED,
      {
        kind: config.kind,
        afterPeriod,
        durationMs: config.durationMs,
      } as Prisma.InputJsonValue,
      "operator"
    );
    return this.emitState(gameId);
  }

  async endBreakAndAdvancePeriod(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game) throw this.notFound("Game not found");

    if (game.breakPhase === BreakPhase.NONE) {
      return this.emitState(gameId);
    }

    const afterPeriod = game.breakAfterPeriod ?? game.currentPeriod;
    const from = game.currentPeriod;
    const nextPeriod = Math.min(game.totalPeriods, from + 1);

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        breakPhase: BreakPhase.NONE,
        breakAfterPeriod: null,
        currentPeriod: nextPeriod,
        status: GameStatus.IN_PROGRESS,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.BREAK_ENDED,
      { afterPeriod } as Prisma.InputJsonValue,
      "operator"
    );

    const payload: Record<string, unknown> = { from, to: nextPeriod, fromBreak: true };
    if (game.score) {
      payload.homeScore = game.score.homeScore;
      payload.awayScore = game.score.awayScore;
    }
    await this.createEvent(
      gameId,
      GameEventType.PERIOD_ADVANCED,
      payload as Prisma.InputJsonValue,
      "operator"
    );

    await this.resetClocksForQuarterPlay(gameId);
    return this.emitState(gameId);
  }

  async advancePeriod(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game) {
      throw this.notFound("Game not found");
    }

    const from = game.currentPeriod;
    const nextPeriod = Math.min(game.totalPeriods, from + 1);

    const data: { currentPeriod: number; status?: GameStatus } = { currentPeriod: nextPeriod };
    await this.prisma.game.update({
      where: { id: gameId },
      data,
    });

    const payload: Record<string, unknown> = {
      from,
      to: nextPeriod,
    };
    if (game.score) {
      payload.homeScore = game.score.homeScore;
      payload.awayScore = game.score.awayScore;
    }
    await this.createEvent(
      gameId,
      GameEventType.PERIOD_ADVANCED,
      payload as Prisma.InputJsonValue,
      "operator"
    );
    return this.emitState(gameId);
  }

  async setGamePeriod(
    gameId: string,
    targetPeriod: number,
    options?: { halftime?: boolean }
  ) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true, gameClock: true, shotClock: true },
    });
    if (!game) {
      throw this.notFound("Game not found");
    }

    if (options?.halftime === true) {
      if (game.gameClock?.running) {
        await this.stopGameClock(gameId);
      } else if (game.shotClock?.running) {
        await this.stopShotClock(gameId);
      }
      if (game.currentPeriod !== 2) {
        await this.prisma.game.update({
          where: { id: gameId },
          data: { currentPeriod: 2, status: GameStatus.IN_PROGRESS },
        });
      }
      return this.startBreak(gameId, 2);
    }

    const expandToOvertime = game.totalPeriods === 4 && targetPeriod === 5;
    if (targetPeriod < 1 || (targetPeriod > game.totalPeriods && !expandToOvertime)) {
      throw this.badRequest("Invalid period for this game");
    }

    if (game.gameClock?.running) {
      await this.stopGameClock(gameId);
    } else if (game.shotClock?.running) {
      // Game clock not running (e.g. old state) but shot still on — only stop once.
      await this.stopShotClock(gameId);
    }

    if (expandToOvertime) {
      const from = game.currentPeriod;
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          totalPeriods: 5,
          currentPeriod: 5,
          status: GameStatus.IN_PROGRESS,
        },
      });
      const payload: Record<string, unknown> = {
        from,
        to: 5,
        directSet: true,
      };
      if (game.score) {
        payload.homeScore = game.score.homeScore;
        payload.awayScore = game.score.awayScore;
      }
      await this.createEvent(
        gameId,
        GameEventType.PERIOD_ADVANCED,
        payload as Prisma.InputJsonValue,
        "operator"
      );
      return this.emitState(gameId);
    }

    const from = game.currentPeriod;
    const clearBreak = game.breakPhase !== BreakPhase.NONE;
    if (from !== targetPeriod || clearBreak) {
      const data: {
        currentPeriod: number;
        status: GameStatus;
        breakPhase?: BreakPhase;
        breakAfterPeriod?: number | null;
      } = {
        currentPeriod: targetPeriod,
        status: GameStatus.IN_PROGRESS,
      };
      if (clearBreak) {
        data.breakPhase = BreakPhase.NONE;
        data.breakAfterPeriod = null;
      }
      await this.prisma.game.update({
        where: { id: gameId },
        data,
      });

      if (clearBreak) {
        await this.createEvent(
          gameId,
          GameEventType.BREAK_ENDED,
          { afterPeriod: game.breakAfterPeriod ?? from, directSet: true } as Prisma.InputJsonValue,
          "operator"
        );
        await this.resetClocksForQuarterPlay(gameId);
      }

      if (from !== targetPeriod) {
        const payload: Record<string, unknown> = {
          from,
          to: targetPeriod,
          directSet: true,
        };
        if (game.score) {
          payload.homeScore = game.score.homeScore;
          payload.awayScore = game.score.awayScore;
        }
        await this.createEvent(
          gameId,
          GameEventType.PERIOD_ADVANCED,
          payload as Prisma.InputJsonValue,
          "operator"
        );
      }
    }

    return this.emitState(gameId);
  }

  async startOvertime(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game) throw this.notFound("Game not found");
    if (game.currentPeriod !== 4 || game.totalPeriods !== 4) {
      throw this.badRequest("Overtime can only be started from the end of the 4th quarter.");
    }
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        currentPeriod: 5,
        totalPeriods: 5,
        breakPhase: BreakPhase.NONE,
        breakAfterPeriod: null,
      },
    });
    await this.resetClocksForQuarterPlay(gameId);
    const payload: Record<string, unknown> = { from: 4, to: 5 };
    if (game.score) {
      payload.homeScore = game.score.homeScore;
      payload.awayScore = game.score.awayScore;
    }
    await this.createEvent(
      gameId,
      GameEventType.PERIOD_ADVANCED,
      payload as Prisma.InputJsonValue,
      "operator"
    );
    return this.emitState(gameId);
  }

  async addPlayer(gameId: string, teamSide: TeamSide, body: { capNumber: string; playerName: string }) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      throw this.notFound("Game not found");
    }

    const player = await this.prisma.player.create({
      data: {
        gameId,
        teamSide,
        capNumber: body.capNumber,
        playerName: body.playerName,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.EXCLUSION_CLEARED, // reusing type not ideal; in future add PLAYER_ADDED
      { playerId: player.id, teamSide, capNumber: player.capNumber, playerName: player.playerName },
      "operator"
    );

    return this.emitState(gameId);
  }

  async createExclusion(
    gameId: string,
    body: { playerId: string; durationMs?: number; timeSeconds?: number; isPenalty?: boolean }
  ) {
    const player = await this.prisma.player.findUnique({
      where: { id: body.playerId },
    });
    if (!player || player.gameId !== gameId) {
      throw this.notFound("Player not found for game");
    }

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { currentPeriod: true },
    });
    const currentPeriod = game?.currentPeriod ?? 1;

    const durationMs = body.durationMs ?? 20_000;

    const exclusion = await this.prisma.playerExclusion.create({
      data: {
        gameId,
        playerId: player.id,
        teamSide: player.teamSide,
        durationMs,
        remainingMs: durationMs,
        running: true,
      },
    });

    const exclusionPayload: Record<string, unknown> = {
      exclusionId: exclusion.id,
      playerId: player.id,
      teamSide: player.teamSide,
      capNumber: player.capNumber,
      durationMs,
      period: currentPeriod,
      isPenalty: body.isPenalty === true,
    };
    if (body.timeSeconds != null) exclusionPayload.timeSeconds = body.timeSeconds;
    await this.createEvent(
      gameId,
      GameEventType.EXCLUSION_STARTED,
      exclusionPayload as Prisma.InputJsonValue,
      "operator"
    );

    return this.emitState(gameId);
  }

  async getActiveExclusions(gameId: string) {
    const exclusions = await this.prisma.playerExclusion.findMany({
      where: { gameId, status: "ACTIVE" },
    });
    return exclusions;
  }

  async clearExclusion(gameId: string, exclusionId: string) {
    const exclusion = await this.prisma.playerExclusion.findUnique({
      where: { id: exclusionId },
    });
    if (!exclusion || exclusion.gameId !== gameId) {
      throw this.notFound("Exclusion not found for game");
    }

    await this.prisma.playerExclusion.update({
      where: { id: exclusionId },
      data: {
        remainingMs: 0,
        running: false,
        status: "ROLLED",
        endedAt: new Date(),
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.EXCLUSION_CLEARED,
      { exclusionId },
      "operator"
    );
    return this.emitState(gameId);
  }

  async useTimeout(gameId: string, teamSide: TeamSide, type: "full" | "short", timeSeconds?: number) {
    const timeoutState = await this.prisma.teamTimeoutState.findUnique({
      where: {
        gameId_teamSide: {
          gameId,
          teamSide,
        },
      },
    });

    if (!timeoutState) {
      throw this.notFound("Timeout state not found");
    }

    const field =
      type === "full" ? "fullTimeoutsRemaining" : "shortTimeoutsRemaining";
    const remaining = timeoutState[field];

    if (remaining <= 0) {
      throw this.badRequest("No timeouts remaining");
    }

    await this.prisma.teamTimeoutState.update({
      where: { id: timeoutState.id },
      data: {
        [field]: remaining - 1,
      },
    });

    const timeoutPayload: Record<string, unknown> = { teamSide, type };
    if (timeSeconds != null) timeoutPayload.timeSeconds = timeSeconds;
    await this.createEvent(
      gameId,
      GameEventType.TIMEOUT_USED,
      timeoutPayload as Prisma.InputJsonValue,
      "operator"
    );

    return this.emitState(gameId);
  }

  async triggerHorn(gameId: string, reason?: string) {
    await this.createEvent(
      gameId,
      GameEventType.HORN_TRIGGERED,
      { reason },
      "operator"
    );

    this.io.to(`game:${gameId}`).emit("game:hornTriggered", { gameId, reason });

    return this.emitState(gameId);
  }

  /** Game-clock remaining as integer seconds (for scoring when time is omitted). */
  private async resolveGameClockTimeSeconds(gameId: string): Promise<number> {
    const clock = await this.prisma.gameClock.findUnique({ where: { gameId } });
    if (!clock) {
      throw this.badRequest("Game clock is not available for this game.");
    }
    const remainingMs = getEffectiveRemainingMs({
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    });
    return Math.floor(remainingMs / 1000);
  }

  async applyScoreCommand(
    gameId: string,
    body: {
      type:
        | "START_QUARTER"
        | "END_QUARTER"
        | "START_BREAK"
        | "TOGGLE_GAME_CLOCK"
        | "RESET_SHOT_CLOCK"
        | "GOAL"
        | "EXCLUSION"
        | "PENALTY"
        | "TIMEOUT"
        | "TIMEOUT_30";
      timeSeconds?: number;
      side?: "HOME" | "AWAY";
      capNumber?: string;
      overtime?: boolean;
    }
  ) {
    const side = body.side != null ? (body.side as TeamSide) : undefined;
    const explicitTimeSeconds = body.timeSeconds;

    switch (body.type) {
      case "START_QUARTER": {
        const game = await this.prisma.game.findUnique({
          where: { id: gameId },
          include: { gameClock: true },
        });
        if (!game?.gameClock) throw this.notFound("Game not found");
        if (game.breakPhase !== BreakPhase.NONE) {
          return this.endBreakAndAdvancePeriod(gameId);
        }
        if (game.breakAfterPeriod != null) {
          await this.skipPendingBreakAndAdvancePeriod(gameId);
          const after = await this.prisma.game.findUnique({
            where: { id: gameId },
            select: { currentPeriod: true, scheduledAt: true },
          });
          if (after?.currentPeriod === 1 && after.scheduledAt == null) {
            await this.prisma.game.update({
              where: { id: gameId },
              data: { scheduledAt: new Date() },
            });
          }
          if (after && !(await this.quarterStartAlreadyLogged(gameId))) {
            await this.createEvent(
              gameId,
              GameEventType.GAME_CLOCK_STARTED,
              { period: after.currentPeriod },
              "operator"
            );
          }
          return this.emitState(gameId);
        }
        if (game.currentPeriod === 1 && game.scheduledAt == null) {
          await this.prisma.game.update({
            where: { id: gameId },
            data: { scheduledAt: new Date() },
          });
        }
        if (!(await this.quarterStartAlreadyLogged(gameId))) {
          await this.createEvent(
            gameId,
            GameEventType.GAME_CLOCK_STARTED,
            { period: game.currentPeriod },
            "operator"
          );
        }
        return this.emitState(gameId);
      }
      case "END_QUARTER": {
        await this.stopGameClock(gameId);
        if (body.overtime === true) {
          return this.startOvertime(gameId);
        }
        const gameAfterStop = await this.prisma.game.findUnique({ where: { id: gameId } });
        if (!gameAfterStop) throw this.notFound("Game not found");
        return this.afterQuarterEnded(gameId, gameAfterStop.currentPeriod);
      }
      case "START_BREAK": {
        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        if (!game) throw this.notFound("Game not found");
        const afterPeriod = game.breakAfterPeriod ?? game.currentPeriod;
        return this.startBreak(gameId, afterPeriod);
      }
      case "TOGGLE_GAME_CLOCK": {
        const game = await this.prisma.game.findUnique({
          where: { id: gameId },
          include: { gameClock: true },
        });
        if (!game?.gameClock) throw this.notFound("Game not found");
        this.assertClockCommandsAllowed(game);
        if (game.gameClock.running) {
          return this.stopGameClock(gameId);
        }
        return this.startGameClock(gameId);
      }
      case "RESET_SHOT_CLOCK": {
        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        if (!game) throw this.notFound("Game not found");
        this.assertClockCommandsAllowed(game);
        return this.resetShotClock(gameId);
      }
      case "GOAL": {
        if (side == null || body.capNumber == null) {
          throw this.badRequest("GOAL requires side and capNumber");
        }
        const goalPlayer = await this.prisma.player.findFirst({
          where: { gameId, teamSide: side, capNumber: body.capNumber },
        });
        if (!goalPlayer) {
          const teamName = side === TeamSide.HOME ? "Dark" : "Light";
          throw this.badRequest(
            `No player with cap number ${body.capNumber} on the ${teamName} team for this game.`
          );
        }
        await this.assertPlayerNotRolled(gameId, side, body.capNumber);
        const goalTimeSeconds =
          explicitTimeSeconds != null
            ? explicitTimeSeconds
            : await this.resolveGameClockTimeSeconds(gameId);
        return this.adjustScore(gameId, side, 1, body.capNumber, goalTimeSeconds);
      }
      case "EXCLUSION":
      case "PENALTY": {
        if (side == null || body.capNumber == null) {
          throw this.badRequest("Exclusion/penalty requires side and capNumber");
        }
        const exclusionTimeSeconds =
          explicitTimeSeconds != null
            ? explicitTimeSeconds
            : await this.resolveGameClockTimeSeconds(gameId);
        const player = await this.prisma.player.findFirst({
          where: { gameId, teamSide: side, capNumber: body.capNumber },
        });
        if (!player) throw this.notFound("Player not found for this game and cap number");
        await this.assertPlayerNotRolled(gameId, side, body.capNumber);
        const isPenalty = body.type === "PENALTY";
        return this.createExclusion(gameId, {
          playerId: player.id,
          timeSeconds: exclusionTimeSeconds,
          isPenalty,
        });
      }
      case "TIMEOUT": {
        if (side == null) throw this.badRequest("TIMEOUT requires side");
        const timeoutTimeSeconds =
          explicitTimeSeconds != null
            ? explicitTimeSeconds
            : await this.resolveGameClockTimeSeconds(gameId);
        return this.useTimeout(gameId, side, "full", timeoutTimeSeconds);
      }
      case "TIMEOUT_30": {
        if (side == null) throw this.badRequest("TIMEOUT_30 requires side");
        const timeout30TimeSeconds =
          explicitTimeSeconds != null
            ? explicitTimeSeconds
            : await this.resolveGameClockTimeSeconds(gameId);
        return this.useTimeout(gameId, side, "short", timeout30TimeSeconds);
      }
      default:
        throw this.badRequest(`Unknown score command type: ${(body as { type: string }).type}`);
    }
  }

  async replaceRoster(
    gameId: string,
    body: {
      home?: { capNumber: string; playerName: string }[];
      away?: { capNumber: string; playerName: string }[];
    }
  ) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      throw this.notFound("Game not found");
    }

    await this.prisma.player.deleteMany({
      where: { gameId },
    });

    const rows: Prisma.PlayerCreateManyInput[] = [];
    for (const player of body.home ?? []) {
      rows.push({
        gameId,
        teamSide: TeamSide.HOME,
        capNumber: player.capNumber,
        playerName: player.playerName,
      });
    }
    for (const player of body.away ?? []) {
      rows.push({
        gameId,
        teamSide: TeamSide.AWAY,
        capNumber: player.capNumber,
        playerName: player.playerName,
      });
    }

    if (rows.length > 0) {
      await this.prisma.player.createMany({ data: rows });
    }

    return this.emitState(gameId);
  }

  async listGames() {
    return this.prisma.game.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async rebuildGameFromEventLog(gameId: string, rows: RebuildEventInput[]) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw this.notFound("Game not found");

    const RERUN_TMP = "__rerun_tmp_";
    const forSort = rows.map((e, i) => ({
      ...e,
      id: e.id ?? `${RERUN_TMP}${i}`,
    }));

    sortEventsForRerun(forSort);

    const forRerun: RebuildEventInput[] = forSort.map((e) => ({
      ...e,
      id: e.id!.startsWith(RERUN_TMP) ? undefined : e.id,
    }));

    try {
      await this.prisma.$transaction((tx) => rerunGameEventLog(tx, gameId, forRerun));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw this.badRequest(msg);
    }

    return this.emitState(gameId);
  }
}

