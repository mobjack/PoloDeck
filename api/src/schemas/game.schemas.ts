import { GameEventType } from ".prisma/client";
import { z } from "zod";

// Game day
export const createGameDayBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().min(1),
  defaultQuarterDurationMs: z.number().int().positive(),
  defaultBreakBetweenQuartersMs: z.number().int().nonnegative(),
  defaultHalftimeDurationMs: z.number().int().nonnegative(),
});

export const updateGameDayBodySchema = createGameDayBodySchema.partial();

export const gameDayIdParamSchema = z.object({
  gameDayId: z.string().cuid(),
});

export const createGameBodySchema = z.object({
  gameDayId: z.string().cuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  level: z.string().optional(),
  gender: z.string().optional(),
  gameType: z.string().optional(),
  totalPeriods: z.number().int().positive().optional(),
  gameClockDurationMs: z.number().int().positive().optional(),
  shotClockDurationMs: z.number().int().positive().optional(),
  quarterDurationMs: z.number().int().positive().optional(),
  breakBetweenQuartersDurationMs: z.number().int().nonnegative().optional(),
  halftimeDurationMs: z.number().int().nonnegative().optional(),
});

export const updateGameBodySchema = z.object({
  scheduledAt: z.string().datetime().optional().nullable(),
  homeTeamName: z.string().min(1).optional(),
  awayTeamName: z.string().min(1).optional(),
  level: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  gameType: z.string().optional().nullable(),
  orderInDay: z.number().int().optional().nullable(),
  quarterDurationMs: z.number().int().positive().optional(),
  breakBetweenQuartersDurationMs: z.number().int().nonnegative().optional(),
  halftimeDurationMs: z.number().int().nonnegative().optional(),
  shotClockDurationMs: z.number().int().positive().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "FINAL"]).optional(),
});

export const gameIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const exclusionIdParamSchema = gameIdParamSchema.extend({
  exclusionId: z.string().cuid(),
});

export const setClockBodySchema = z.object({
  remainingMs: z.number().int().nonnegative(),
});

export const setGamePeriodBodySchema = z.object({
  period: z.number().int().min(1),
});

export const addPlayerBodySchema = z.object({
  capNumber: z.string().min(1), // e.g. "1", "A", "1A"
  playerName: z.string().min(1),
});

export const replaceRosterBodySchema = z.object({
  home: z.array(addPlayerBodySchema).optional(),
  away: z.array(addPlayerBodySchema).optional(),
});

export const createExclusionBodySchema = z.object({
  playerId: z.string().cuid(),
  durationMs: z.number().int().positive().optional(),
});

export const triggerHornBodySchema = z.object({
  reason: z.string().optional(),
});

export const scoreCommandBodySchema = z.object({
  type: z.enum([
    "START_QUARTER",
    "END_QUARTER",
    "GOAL",
    "EXCLUSION",
    "PENALTY",
    "TIMEOUT",
    "TIMEOUT_30",
  ]),
  timeSeconds: z.number().int().nonnegative().optional(),
  side: z.enum(["HOME", "AWAY"]).optional(),
  capNumber: z.string().min(1).optional(),
  overtime: z.boolean().optional(),
});

export const eventLogRebuildRowSchema = z.object({
  id: z.string().cuid().optional(),
  eventType: z.nativeEnum(GameEventType),
  payload: z.unknown().optional(),
  createdAt: z.string(),
  source: z.string().optional(),
});

export const eventLogRebuildBodySchema = z.object({
  events: z.array(eventLogRebuildRowSchema).min(1),
});

export type CreateGameDayBody = z.infer<typeof createGameDayBodySchema>;
export type UpdateGameDayBody = z.infer<typeof updateGameDayBodySchema>;
export type GameDayIdParams = z.infer<typeof gameDayIdParamSchema>;
export type CreateGameBody = z.infer<typeof createGameBodySchema>;
export type UpdateGameBody = z.infer<typeof updateGameBodySchema>;
export type GameIdParams = z.infer<typeof gameIdParamSchema>;
export type ExclusionIdParams = z.infer<typeof exclusionIdParamSchema>;
export type SetClockBody = z.infer<typeof setClockBodySchema>;
export type AddPlayerBody = z.infer<typeof addPlayerBodySchema>;
export type CreateExclusionBody = z.infer<typeof createExclusionBodySchema>;
export type TriggerHornBody = z.infer<typeof triggerHornBodySchema>;
export type ReplaceRosterBody = z.infer<typeof replaceRosterBodySchema>;
export type ScoreCommandBody = z.infer<typeof scoreCommandBodySchema>;
export type EventLogRebuildBody = z.infer<typeof eventLogRebuildBodySchema>;

