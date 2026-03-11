export interface ClockState {
  durationMs: number;
  remainingMs: number;
  running: boolean;
  lastStartedAt: Date | null;
}

export function getEffectiveRemainingMs(state: ClockState, now: number = Date.now()): number {
  if (!state.running || !state.lastStartedAt) {
    return Math.max(0, state.remainingMs);
  }

  const elapsed = now - state.lastStartedAt.getTime();
  const remaining = state.remainingMs - elapsed;
  return Math.max(0, remaining);
}

export function startClock(state: ClockState, now: number = Date.now()): ClockState {
  if (state.running) {
    return state;
  }

  return {
    ...state,
    running: true,
    lastStartedAt: new Date(now),
  };
}

export function stopClock(state: ClockState, now: number = Date.now()): ClockState {
  if (!state.running || !state.lastStartedAt) {
    return state;
  }

  const remainingMs = getEffectiveRemainingMs(state, now);

  return {
    ...state,
    running: false,
    remainingMs,
    lastStartedAt: null,
  };
}

export function setClockRemaining(
  state: ClockState,
  remainingMs: number,
  now: number = Date.now()
): ClockState {
  const clamped = Math.max(0, remainingMs);

  return {
    ...state,
    remainingMs: clamped,
    lastStartedAt: state.running ? new Date(now) : state.lastStartedAt,
  };
}

