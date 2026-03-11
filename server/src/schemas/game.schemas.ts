import { z } from "zod";

export const createGameBodySchema = z.object({
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  totalPeriods: z.number().int().positive(),
  gameClockDurationMs: z.number().int().positive(),
  shotClockDurationMs: z.number().int().positive(),
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

export const addPlayerBodySchema = z.object({
  capNumber: z.number().int().nonnegative(),
  playerName: z.string().min(1),
});

export const createExclusionBodySchema = z.object({
  playerId: z.string().cuid(),
  durationMs: z.number().int().positive().optional(),
});

export const triggerHornBodySchema = z.object({
  reason: z.string().optional(),
});

export type CreateGameBody = z.infer<typeof createGameBodySchema>;
export type GameIdParams = z.infer<typeof gameIdParamSchema>;
export type ExclusionIdParams = z.infer<typeof exclusionIdParamSchema>;
export type SetClockBody = z.infer<typeof setClockBodySchema>;
export type AddPlayerBody = z.infer<typeof addPlayerBodySchema>;
export type CreateExclusionBody = z.infer<typeof createExclusionBodySchema>;
export type TriggerHornBody = z.infer<typeof triggerHornBodySchema>;

