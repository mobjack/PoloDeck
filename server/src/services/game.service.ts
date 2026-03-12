import type { FastifyInstance } from "fastify";
import { GameEventType, TeamSide, type Prisma } from ".prisma/client";
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

  async checkInDevice(input: {
    clientId: string;
    type: "SCOREBOARD" | "SHOT_CLOCK" | "OTHER";
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
    label?: string;
    totalPeriods?: number;
    gameClockDurationMs?: number;
    shotClockDurationMs?: number;
  }) {
    let totalPeriods = input.totalPeriods ?? 4;
    let gameClockDurationMs = input.gameClockDurationMs;
    let shotClockDurationMs = input.shotClockDurationMs;

    if (input.gameDayId) {
      const gameDay = await this.prisma.gameDay.findUnique({
        where: { id: input.gameDayId },
      });
      if (gameDay) {
        if (gameClockDurationMs == null) gameClockDurationMs = gameDay.defaultQuarterDurationMs;
        if (shotClockDurationMs == null) shotClockDurationMs = 30 * 1000; // default 30s shot clock
      }
    }
    if (gameClockDurationMs == null) gameClockDurationMs = 8 * 60 * 1000; // 8 min default
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
        label: input.label ?? null,
        orderInDay: input.gameDayId ? maxOrder : null,
        totalPeriods,
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
      label?: string | null;
      orderInDay?: number | null;
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
      label?: string | null;
      orderInDay?: number | null;
    } = {};
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.homeTeamName != null) data.homeTeamName = input.homeTeamName;
    if (input.awayTeamName != null) data.awayTeamName = input.awayTeamName;
    if (input.level !== undefined) data.level = input.level;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.gameType !== undefined) data.gameType = input.gameType;
    if (input.label !== undefined) data.label = input.label;
    if (input.orderInDay !== undefined) data.orderInDay = input.orderInDay;
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
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!game) {
      throw this.notFound("Game not found");
    }

    return game;
  }

  async adjustScore(gameId: string, side: TeamSide, delta: 1 | -1) {
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

    await this.createEvent(
      gameId,
      eventType,
      { side, delta },
      "operator"
    );

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

  async setGameClock(gameId: string, remainingMs: number) {
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

    await this.createEvent(
      gameId,
      GameEventType.GAME_CLOCK_SET,
      { remainingMs: newState.remainingMs },
      "operator"
    );
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
    });
    if (!game) {
      throw this.notFound("Game not found");
    }

    const nextPeriod = Math.min(game.totalPeriods, game.currentPeriod + 1);

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        currentPeriod: nextPeriod,
      },
    });

    await this.createEvent(
      gameId,
      GameEventType.PERIOD_ADVANCED,
      { from: game.currentPeriod, to: nextPeriod },
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

  async createExclusion(gameId: string, body: { playerId: string; durationMs?: number }) {
    const player = await this.prisma.player.findUnique({
      where: { id: body.playerId },
    });
    if (!player || player.gameId !== gameId) {
      throw this.notFound("Player not found for game");
    }

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

    await this.createEvent(
      gameId,
      GameEventType.EXCLUSION_STARTED,
      {
        exclusionId: exclusion.id,
        playerId: player.id,
        teamSide: player.teamSide,
        durationMs,
      },
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

  async useTimeout(gameId: string, teamSide: TeamSide, type: "full" | "short") {
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

    await this.createEvent(
      gameId,
      GameEventType.TIMEOUT_USED,
      { teamSide, type },
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

  async listGames() {
    return this.prisma.game.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
}

