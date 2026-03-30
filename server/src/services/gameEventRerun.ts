import {
  GameEventType,
  GameStatus,
  TeamSide,
  ExclusionStatus,
} from ".prisma/client";
import type { Prisma } from "@prisma/client";
import { startClock, stopClock, setClockRemaining } from "../lib/clock";

export type RebuildEventInput = {
  id?: string;
  eventType: GameEventType;
  payload?: unknown;
  createdAt: string;
  source?: string;
};

export function sortEventsForRerun(events: { createdAt: string; id: string }[]) {
  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function asPayload(p: unknown): Record<string, unknown> {
  return p != null && typeof p === "object" && !Array.isArray(p)
    ? (p as Record<string, unknown>)
    : {};
}

/** Rebuilds derived game state from an ordered event log and rewrites GameEvent rows. */
export async function rerunGameEventLog(
  tx: Prisma.TransactionClient,
  gameId: string,
  sortedEvents: RebuildEventInput[]
): Promise<void> {
  if (sortedEvents.length === 0) {
    throw new Error("Event log cannot be empty");
  }

  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      score: true,
      gameClock: true,
      shotClock: true,
      timeoutStates: true,
    },
  });
  if (!game || !game.score || !game.gameClock || !game.shotClock) {
    throw new Error("Game not found or missing score/clocks");
  }

  const first = sortedEvents[0];
  if (first.eventType !== GameEventType.GAME_CREATED) {
    throw new Error("First event must be GAME_CREATED");
  }

  const createdPayload = asPayload(first.payload);
  const initialTotalPeriods =
    typeof createdPayload.totalPeriods === "number"
      ? createdPayload.totalPeriods
      : game.totalPeriods;

  await tx.score.update({
    where: { id: game.score.id },
    data: { homeScore: 0, awayScore: 0 },
  });

  await tx.gameClock.update({
    where: { id: game.gameClock.id },
    data: {
      remainingMs: game.gameClock.durationMs,
      running: false,
      lastStartedAt: null,
    },
  });

  await tx.shotClock.update({
    where: { id: game.shotClock.id },
    data: {
      remainingMs: game.shotClock.durationMs,
      running: false,
      lastStartedAt: null,
    },
  });

  for (const ts of game.timeoutStates) {
    await tx.teamTimeoutState.update({
      where: { id: ts.id },
      data: { fullTimeoutsRemaining: 2, shortTimeoutsRemaining: 1 },
    });
  }

  await tx.playerExclusion.deleteMany({ where: { gameId } });

  await tx.game.update({
    where: { id: gameId },
    data: {
      currentPeriod: 1,
      status: GameStatus.PENDING,
      totalPeriods: initialTotalPeriods,
      scheduledAt: null,
    },
  });

  const exclusionIdMap = new Map<string, string>();
  const foulStartsByCap = new Map<string, number>();
  const capKey = (side: TeamSide, cap: string) => `${side}:${cap}`;

  const outRows: {
    id?: string;
    eventType: GameEventType;
    payload: Prisma.InputJsonValue;
    createdAt: Date;
    source: string;
  }[] = [];

  for (const ev of sortedEvents) {
    const createdAt = new Date(ev.createdAt);
    const source = ev.source ?? "operator";
    let payloadOut: Prisma.InputJsonValue = (ev.payload ?? {}) as Prisma.InputJsonValue;

    switch (ev.eventType) {
      case GameEventType.GAME_CREATED:
        break;

      case GameEventType.GOAL_HOME:
      case GameEventType.GOAL_AWAY: {
        const p = asPayload(ev.payload);
        const side =
          ev.eventType === GameEventType.GOAL_HOME ? TeamSide.HOME : TeamSide.AWAY;
        const cap = p.capNumber != null ? String(p.capNumber) : "";
        if (cap) {
          const player = await tx.player.findFirst({
            where: { gameId, teamSide: side, capNumber: cap },
          });
          if (!player) {
            throw new Error(
              `GOAL: no player with cap ${cap} on ${side === TeamSide.HOME ? "HOME" : "AWAY"}`
            );
          }
          const n = foulStartsByCap.get(capKey(side, cap)) ?? 0;
          if (n >= 3) {
            throw new Error(
              `Player ${cap} has been rolled; cannot record another goal for them`
            );
          }
        }
        const delta = typeof p.delta === "number" ? p.delta : 1;
        const scoreRow = await tx.score.findUnique({ where: { gameId } });
        if (!scoreRow) throw new Error("Score row missing");
        let nextHome = scoreRow.homeScore;
        let nextAway = scoreRow.awayScore;
        if (side === TeamSide.HOME) {
          nextHome = Math.max(0, scoreRow.homeScore + delta);
        } else {
          nextAway = Math.max(0, scoreRow.awayScore + delta);
        }
        await tx.score.update({
          where: { id: scoreRow.id },
          data: { homeScore: nextHome, awayScore: nextAway },
        });
        payloadOut = {
          ...p,
          side,
          delta,
          homeScore: nextHome,
          awayScore: nextAway,
        } as Prisma.InputJsonValue;
        break;
      }

      case GameEventType.GAME_CLOCK_STARTED: {
        const g = await tx.game.findUnique({
          where: { id: gameId },
          include: { gameClock: true },
        });
        if (!g?.gameClock) throw new Error("Game clock missing");
        if (g.currentPeriod === 1 && g.scheduledAt == null) {
          await tx.game.update({
            where: { id: gameId },
            data: { scheduledAt: new Date(), status: GameStatus.IN_PROGRESS },
          });
        } else if (g.status === GameStatus.PENDING) {
          await tx.game.update({
            where: { id: gameId },
            data: { status: GameStatus.IN_PROGRESS },
          });
        }
        const clock = g.gameClock;
        const newState = startClock({
          durationMs: clock.durationMs,
          remainingMs: clock.remainingMs,
          running: clock.running,
          lastStartedAt: clock.lastStartedAt,
        });
        await tx.gameClock.update({
          where: { id: clock.id },
          data: {
            running: newState.running,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.GAME_CLOCK_STOPPED: {
        const clock = await tx.gameClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Game clock missing");
        const newState = stopClock({
          durationMs: clock.durationMs,
          remainingMs: clock.remainingMs,
          running: clock.running,
          lastStartedAt: clock.lastStartedAt,
        });
        await tx.gameClock.update({
          where: { id: clock.id },
          data: {
            running: newState.running,
            remainingMs: newState.remainingMs,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.GAME_CLOCK_SET: {
        const p = asPayload(ev.payload);
        const remainingMs =
          typeof p.remainingMs === "number" ? p.remainingMs : 0;
        const clock = await tx.gameClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Game clock missing");
        const newState = setClockRemaining(
          {
            durationMs: clock.durationMs,
            remainingMs: clock.remainingMs,
            running: clock.running,
            lastStartedAt: clock.lastStartedAt,
          },
          remainingMs
        );
        await tx.gameClock.update({
          where: { id: clock.id },
          data: {
            remainingMs: newState.remainingMs,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.SHOT_CLOCK_STARTED: {
        const clock = await tx.shotClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Shot clock missing");
        const newState = startClock({
          durationMs: clock.durationMs,
          remainingMs: clock.remainingMs,
          running: clock.running,
          lastStartedAt: clock.lastStartedAt,
        });
        await tx.shotClock.update({
          where: { id: clock.id },
          data: {
            running: newState.running,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.SHOT_CLOCK_STOPPED: {
        const clock = await tx.shotClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Shot clock missing");
        const newState = stopClock({
          durationMs: clock.durationMs,
          remainingMs: clock.remainingMs,
          running: clock.running,
          lastStartedAt: clock.lastStartedAt,
        });
        await tx.shotClock.update({
          where: { id: clock.id },
          data: {
            running: newState.running,
            remainingMs: newState.remainingMs,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.SHOT_CLOCK_RESET: {
        const clock = await tx.shotClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Shot clock missing");
        await tx.shotClock.update({
          where: { id: clock.id },
          data: {
            remainingMs: clock.durationMs,
            running: false,
            lastStartedAt: null,
          },
        });
        payloadOut = { durationMs: clock.durationMs } as Prisma.InputJsonValue;
        break;
      }

      case GameEventType.SHOT_CLOCK_SET: {
        const p = asPayload(ev.payload);
        const remainingMs =
          typeof p.remainingMs === "number" ? p.remainingMs : 0;
        const clock = await tx.shotClock.findUnique({ where: { gameId } });
        if (!clock) throw new Error("Shot clock missing");
        const newState = setClockRemaining(
          {
            durationMs: clock.durationMs,
            remainingMs: clock.remainingMs,
            running: clock.running,
            lastStartedAt: clock.lastStartedAt,
          },
          remainingMs
        );
        await tx.shotClock.update({
          where: { id: clock.id },
          data: {
            remainingMs: newState.remainingMs,
            lastStartedAt: newState.lastStartedAt,
          },
        });
        break;
      }

      case GameEventType.PERIOD_ADVANCED: {
        const p = asPayload(ev.payload);
        const from = typeof p.from === "number" ? p.from : 1;
        const to = typeof p.to === "number" ? p.to : from + 1;
        const g = await tx.game.findUnique({ where: { id: gameId } });
        if (!g) throw new Error("Game missing");

        if (from === 4 && to === 5) {
          await tx.game.update({
            where: { id: gameId },
            data: { currentPeriod: 5, totalPeriods: 5 },
          });
        } else {
          const data: { currentPeriod: number; status?: GameStatus } = {
            currentPeriod: to,
          };
          if (g.totalPeriods === 4 && to === 4) {
            data.status = GameStatus.FINAL;
          }
          await tx.game.update({
            where: { id: gameId },
            data,
          });
        }
        const scoreRow = await tx.score.findUnique({ where: { gameId } });
        payloadOut = {
          ...p,
          from,
          to,
          ...(scoreRow
            ? { homeScore: scoreRow.homeScore, awayScore: scoreRow.awayScore }
            : {}),
        } as Prisma.InputJsonValue;
        break;
      }

      case GameEventType.EXCLUSION_STARTED: {
        const p = asPayload(ev.payload);
        const playerId = typeof p.playerId === "string" ? p.playerId : "";
        const player = await tx.player.findFirst({
          where: playerId
            ? { id: playerId, gameId }
            : {
                gameId,
                teamSide: (p.teamSide as TeamSide) ?? TeamSide.HOME,
                capNumber: String(p.capNumber ?? ""),
              },
        });
        if (!player) {
          throw new Error("EXCLUSION_STARTED: player not found");
        }
        const g = await tx.game.findUnique({
          where: { id: gameId },
          select: { currentPeriod: true },
        });
        const currentPeriod = g?.currentPeriod ?? 1;
        const durationMs =
          typeof p.durationMs === "number" && p.durationMs > 0
            ? p.durationMs
            : 20_000;

        const exclusion = await tx.playerExclusion.create({
          data: {
            gameId,
            playerId: player.id,
            teamSide: player.teamSide,
            durationMs,
            remainingMs: durationMs,
            running: true,
            status: ExclusionStatus.ACTIVE,
          },
        });

        const oldExId =
          typeof p.exclusionId === "string" ? p.exclusionId : undefined;
        if (oldExId) exclusionIdMap.set(oldExId, exclusion.id);

        const key = capKey(player.teamSide, player.capNumber);
        foulStartsByCap.set(key, (foulStartsByCap.get(key) ?? 0) + 1);

        payloadOut = {
          ...p,
          exclusionId: exclusion.id,
          playerId: player.id,
          teamSide: player.teamSide,
          capNumber: player.capNumber,
          durationMs,
          period: currentPeriod,
          isPenalty: p.isPenalty === true,
          ...(typeof p.timeSeconds === "number"
            ? { timeSeconds: p.timeSeconds }
            : {}),
        } as Prisma.InputJsonValue;
        break;
      }

      case GameEventType.EXCLUSION_CLEARED: {
        const p = asPayload(ev.payload);
        if (p.exclusionId != null) {
          const rawId = String(p.exclusionId);
          const mapped = exclusionIdMap.get(rawId) ?? rawId;
          const exclusion = await tx.playerExclusion.findFirst({
            where: { id: mapped, gameId },
          });
          if (exclusion) {
            await tx.playerExclusion.update({
              where: { id: exclusion.id },
              data: {
                remainingMs: 0,
                running: false,
                status: ExclusionStatus.ROLLED,
                endedAt: new Date(),
              },
            });
          }
          payloadOut = { exclusionId: mapped } as Prisma.InputJsonValue;
        } else {
          payloadOut = (ev.payload ?? {}) as Prisma.InputJsonValue;
        }
        break;
      }

      case GameEventType.TIMEOUT_USED: {
        const p = asPayload(ev.payload);
        const teamSide = (p.teamSide ?? p.side) as TeamSide | undefined;
        if (!teamSide || (teamSide !== TeamSide.HOME && teamSide !== TeamSide.AWAY)) {
          throw new Error("TIMEOUT_USED: missing teamSide");
        }
        const type = p.type === "short" ? "short" : "full";
        const timeoutState = await tx.teamTimeoutState.findUnique({
          where: {
            gameId_teamSide: { gameId, teamSide },
          },
        });
        if (!timeoutState) throw new Error("Timeout state missing");
        const field =
          type === "full" ? "fullTimeoutsRemaining" : "shortTimeoutsRemaining";
        const remaining = timeoutState[field];
        if (remaining <= 0) {
          throw new Error("No timeouts remaining for team during rerun");
        }
        await tx.teamTimeoutState.update({
          where: { id: timeoutState.id },
          data: { [field]: remaining - 1 },
        });
        payloadOut = {
          teamSide,
          type,
          ...(typeof p.timeSeconds === "number"
            ? { timeSeconds: p.timeSeconds }
            : {}),
        } as Prisma.InputJsonValue;
        break;
      }

      case GameEventType.HORN_TRIGGERED:
        break;

      default:
        throw new Error(`Unsupported event type for rerun: ${ev.eventType}`);
    }

    outRows.push({
      id: ev.id,
      eventType: ev.eventType,
      payload: payloadOut,
      createdAt,
      source,
    });
  }

  await tx.gameEvent.deleteMany({ where: { gameId } });

  for (const row of outRows) {
    await tx.gameEvent.create({
      data: {
        ...(row.id ? { id: row.id } : {}),
        gameId,
        eventType: row.eventType,
        payload: row.payload,
        source: row.source,
        createdAt: row.createdAt,
      },
    });
  }
}
