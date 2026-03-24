import type { FastifyInstance } from "fastify";
import { DeviceType, GameEventType, GameStatus, TeamSide, type Prisma } from ".prisma/client";
import { startClock, stopClock, setClockRemaining } from "../lib/clock";
import {
  buildDeviceCapabilities,
  type DeviceCapabilities,
  type DeviceSummary,
} from "./deviceCapabilities";
import { env } from "../config/env";

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

  private async createEvent(
    gameId: string,
    eventType: GameEventType,
    payload: Prisma.InputJsonValue,
    source: string
  ) {
    await this.prisma.gameEvent.create({
      data: {
        gameId,
        eventType,
        payload,
        source,
      },
    });
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

  async checkInDevice(input: {
    clientId: string;
    type: DeviceType;
    name?: string;
  }) {
    const now = new Date();

    const existing = await this.prisma.device.findUnique({
      where: { clientId: input.clientId },
    });

    if (existing) {
      const updated = await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          type: input.type,
          name: input.name,
          lastCheckInAt: now,
        },
      });
      return updated;
    }

    const created = await this.prisma.device.create({
      data: {
        clientId: input.clientId,
        type: input.type,
        name: input.name,
        lastCheckInAt: now,
      },
    });

    return created;
  }

  async listAllDevices(): Promise<DeviceSummary[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: { createdAt: "asc" },
    });

    return devices.map((d: any) => ({
      id: d.id,
      clientId: d.clientId,
      type: d.type,
      name: d.name,
      lastCheckInAt: d.lastCheckInAt.toISOString(),
    }));
  }

  async getGlobalDeviceCapabilities(): Promise<DeviceCapabilities> {
    const devices = await this.listAllDevices();
    return buildDeviceCapabilities({
      now: new Date(),
      devices,
      staleAfterMs: env.DEVICE_STALE_AFTER_MS,
    });
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
    type GameDayWithGames = (typeof list)[0];
    type GameRow = GameDayWithGames["games"][0];
    return list.map((gd: GameDayWithGames) => ({
      ...gd,
      date: gd.date.toISOString().slice(0, 10),
      games: gd.games.map((g: GameRow) => ({
        ...g,
        scheduledAt: g.scheduledAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
    }));
  }

  async getGameDay(gameDayId: string) {
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
    type GameRow = (typeof gameDay.games)[number];
    return {
      ...gameDay,
      date: gameDay.date.toISOString().slice(0, 10),
      games: gameDay.games.map((g: GameRow) => ({
        ...g,
        scheduledAt: g.scheduledAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
    };
  }

  async updateGameDay(
    gameDayId: string,
    input: {
      date?: string;
      location?: string;
      defaultQuarterDurationMs?: number;
      defaultBreakBetweenQuartersMs?: number;
      defaultHalftimeDurationMs?: number;
    }
  ) {
    const existing = await this.prisma.gameDay.findUnique({ where: { id: gameDayId } });
    if (!existing) throw this.notFound("Game day not found");
    const data: { date?: Date; location?: string; defaultQuarterDurationMs?: number; defaultBreakBetweenQuartersMs?: number; defaultHalftimeDurationMs?: number } = {};
    if (input.date != null) data.date = new Date(input.date);
    if (input.location != null) data.location = input.location;
    if (input.defaultQuarterDurationMs != null) data.defaultQuarterDurationMs = input.defaultQuarterDurationMs;
    if (input.defaultBreakBetweenQuartersMs != null) data.defaultBreakBetweenQuartersMs = input.defaultBreakBetweenQuartersMs;
    if (input.defaultHalftimeDurationMs != null) data.defaultHalftimeDurationMs = input.defaultHalftimeDurationMs;
    const gameDay = await this.prisma.gameDay.update({
      where: { id: gameDayId },
      data,
    });
    return gameDay;
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
      status?: GameStatus;
    }
  ) {
    const existing = await this.prisma.game.findUnique({ where: { id: gameId } });
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
    await this.prisma.game.update({
      where: { id: gameId },
      data,
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
    const clock = await this.prisma.gameClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Game clock not found");
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

    await this.createEvent(gameId, GameEventType.GAME_CLOCK_STARTED, {}, "operator");
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
    return this.emitState(gameId);
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

  async startShotClock(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }

    const newState = startClock({
      durationMs: clock.durationMs,
      remainingMs: clock.remainingMs,
      running: clock.running,
      lastStartedAt: clock.lastStartedAt,
    });

    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        running: newState.running,
        lastStartedAt: newState.lastStartedAt,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_STARTED,
      {},
      "operator"
    );
    return this.emitState(gameId);
  }

  async stopShotClock(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
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
    return this.emitState(gameId);
  }

  async resetShotClock(gameId: string) {
    const clock = await this.prisma.shotClock.findUnique({
      where: { gameId },
    });
    if (!clock) {
      throw this.notFound("Shot clock not found");
    }

    await this.prisma.shotClock.update({
      where: { id: clock.id },
      data: {
        remainingMs: clock.durationMs,
        running: false,
        lastStartedAt: null,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.SHOT_CLOCK_RESET,
      { durationMs: clock.durationMs },
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

  async advancePeriod(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { score: true },
    });
    if (!game) {
      throw this.notFound("Game not found");
    }

    const nextPeriod = Math.min(game.totalPeriods, game.currentPeriod + 1);

    const data: { currentPeriod: number; status?: GameStatus } = { currentPeriod: nextPeriod };
    if (game.totalPeriods === 4 && nextPeriod === 4) {
      data.status = GameStatus.FINAL;
    }
    await this.prisma.game.update({
      where: { id: gameId },
      data,
    });

    const payload: Record<string, unknown> = {
      from: game.currentPeriod,
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
      data: { currentPeriod: 5, totalPeriods: 5 },
    });
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

  async applyScoreCommand(
    gameId: string,
    body: {
      type: "START_QUARTER" | "END_QUARTER" | "GOAL" | "EXCLUSION" | "PENALTY" | "TIMEOUT" | "TIMEOUT_30";
      timeSeconds?: number;
      side?: "HOME" | "AWAY";
      capNumber?: string;
      overtime?: boolean;
    }
  ) {
    const side = body.side != null ? (body.side as TeamSide) : undefined;

    switch (body.type) {
      case "START_QUARTER": {
        const game = await this.prisma.game.findUnique({
          where: { id: gameId },
          include: { gameClock: true },
        });
        if (!game?.gameClock) throw this.notFound("Game not found");
        if (game.currentPeriod === 1 && game.scheduledAt == null) {
          await this.prisma.game.update({
            where: { id: gameId },
            data: { scheduledAt: new Date() },
          });
        }
        const quarterMs = game.quarterDurationMs ?? game.gameClock.durationMs;
        await this.setGameClock(gameId, quarterMs, { skipEvent: true });
        return this.startGameClock(gameId);
      }
      case "END_QUARTER": {
        await this.stopGameClock(gameId);
        if (body.overtime === true) {
          return this.startOvertime(gameId);
        }
        return this.advancePeriod(gameId);
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
        if (body.timeSeconds != null) {
          await this.setGameClock(gameId, body.timeSeconds * 1000, { skipEvent: true });
        }
        return this.adjustScore(gameId, side, 1, body.capNumber, body.timeSeconds);
      }
      case "EXCLUSION":
      case "PENALTY": {
        if (side == null || body.capNumber == null) {
          throw this.badRequest("Exclusion/penalty requires side and capNumber");
        }
        if (body.timeSeconds != null) {
          await this.setGameClock(gameId, body.timeSeconds * 1000, { skipEvent: true });
        }
        const player = await this.prisma.player.findFirst({
          where: { gameId, teamSide: side, capNumber: body.capNumber },
        });
        if (!player) throw this.notFound("Player not found for this game and cap number");
        await this.assertPlayerNotRolled(gameId, side, body.capNumber);
        const isPenalty = body.type === "PENALTY";
        return this.createExclusion(gameId, {
          playerId: player.id,
          timeSeconds: body.timeSeconds,
          isPenalty,
        });
      }
      case "TIMEOUT": {
        if (side == null) throw this.badRequest("TIMEOUT requires side");
        return this.useTimeout(gameId, side, "full", body.timeSeconds);
      }
      case "TIMEOUT_30": {
        if (side == null) throw this.badRequest("TIMEOUT_30 requires side");
        return this.useTimeout(gameId, side, "short", body.timeSeconds);
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
}

