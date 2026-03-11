import type { FastifyInstance } from "fastify";
import { TeamSide } from ".prisma/client";
import {
  addPlayerBodySchema,
  createExclusionBodySchema,
  createGameBodySchema,
  exclusionIdParamSchema,
  gameIdParamSchema,
  setClockBodySchema,
  triggerHornBodySchema,
} from "../schemas/game.schemas";
import { GameService } from "../services/game.service";

export async function registerGameRoutes(app: FastifyInstance) {
  const service = new GameService(app);

  app.post("/games", async (request, reply) => {
    const body = createGameBodySchema.parse(request.body);
    const aggregate = await service.createGame(body);
    reply.code(201);
    return aggregate;
  });

  app.get("/games", async () => {
    return service.listGames();
  });

  app.get("/games/:id", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.getGameAggregate(params.id);
  });

  // Score commands
  app.post("/games/:id/score/home/increment", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.adjustScore(params.id, TeamSide.HOME, 1);
  });

  app.post("/games/:id/score/home/decrement", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.adjustScore(params.id, TeamSide.HOME, -1 as const);
  });

  app.post("/games/:id/score/away/increment", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.adjustScore(params.id, TeamSide.AWAY, 1);
  });

  app.post("/games/:id/score/away/decrement", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.adjustScore(params.id, TeamSide.AWAY, -1 as const);
  });

  // Game clock
  app.post("/games/:id/game-clock/start", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.startGameClock(params.id);
  });

  app.post("/games/:id/game-clock/stop", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.stopGameClock(params.id);
  });

  app.post("/games/:id/game-clock/set", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = setClockBodySchema.parse(request.body);
    return service.setGameClock(params.id, body.remainingMs);
  });

  // Shot clock
  app.post("/games/:id/shot-clock/start", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.startShotClock(params.id);
  });

  app.post("/games/:id/shot-clock/stop", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.stopShotClock(params.id);
  });

  app.post("/games/:id/shot-clock/reset", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.resetShotClock(params.id);
  });

  app.post("/games/:id/shot-clock/set", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = setClockBodySchema.parse(request.body);
    return service.setShotClock(params.id, body.remainingMs);
  });

  // Period
  app.post("/games/:id/period/advance", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.advancePeriod(params.id);
  });

  // Roster
  app.post("/games/:id/roster/home/player", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = addPlayerBodySchema.parse(request.body);
    return service.addPlayer(params.id, TeamSide.HOME, body);
  });

  app.post("/games/:id/roster/away/player", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = addPlayerBodySchema.parse(request.body);
    return service.addPlayer(params.id, TeamSide.AWAY, body);
  });

  app.get("/games/:id/roster", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const game = await service.getGameAggregate(params.id);
    return game.players;
  });

  // Exclusions
  app.post("/games/:id/exclusions", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = createExclusionBodySchema.parse(request.body);
    return service.createExclusion(params.id, body);
  });

  app.get("/games/:id/exclusions/active", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.getActiveExclusions(params.id);
  });

  app.post("/games/:id/exclusions/:exclusionId/clear", async (request) => {
    const params = exclusionIdParamSchema.parse(request.params);
    return service.clearExclusion(params.id, params.exclusionId);
  });

  // Timeouts
  app.post("/games/:id/timeouts/home/full", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.useTimeout(params.id, TeamSide.HOME, "full");
  });

  app.post("/games/:id/timeouts/home/short", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.useTimeout(params.id, TeamSide.HOME, "short");
  });

  app.post("/games/:id/timeouts/away/full", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.useTimeout(params.id, TeamSide.AWAY, "full");
  });

  app.post("/games/:id/timeouts/away/short", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    return service.useTimeout(params.id, TeamSide.AWAY, "short");
  });

  app.get("/games/:id/timeouts", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const game = await service.getGameAggregate(params.id);
    return game.timeoutStates;
  });

  // Horn
  app.post("/games/:id/horn/trigger", async (request) => {
    const params = gameIdParamSchema.parse(request.params);
    const body = triggerHornBodySchema.parse(request.body ?? {});
    return service.triggerHorn(params.id, body.reason);
  });
}

