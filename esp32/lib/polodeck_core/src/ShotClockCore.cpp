#include "polodeck/ShotClockCore.h"

#include <algorithm>

namespace polodeck {

uint32_t ShotClockCore::effectiveRemaining(const ClockSnapshot &clock, uint32_t receivedAtMs,
                                           uint32_t nowMs) {
  if (!clock.running) return clock.remainingMs;
  const uint32_t elapsed = nowMs - receivedAtMs;
  return elapsed >= clock.remainingMs ? 0 : clock.remainingMs - elapsed;
}

void ShotClockCore::applySync(const SyncSnapshot &snapshot, uint32_t nowMs, uint32_t snapshotAgeMs) {
  state_ = snapshot;
  receivedAtMs_ = nowMs - snapshotAgeMs;

  if (initialized_ && !snapshot.hornEventId.empty() && snapshot.hornEventId != lastHornEventId_) {
    hornPending_ = true;
  }
  lastHornEventId_ = snapshot.hornEventId;
  gameClockWasAboveZero_ = snapshot.gameClock.remainingMs > 0;
  shotWasAboveZero_ = snapshot.shotClock.remainingMs > 0;
  initialized_ = true;
}

void ShotClockCore::update(uint32_t nowMs) {
  const uint32_t gameRemaining = effectiveRemaining(state_.gameClock, receivedAtMs_, nowMs);
  const uint32_t shotRemaining = effectiveRemaining(state_.shotClock, receivedAtMs_, nowMs);
  const bool gameReachedZero =
      gameClockWasAboveZero_ && gameRemaining == 0 && state_.gameClock.running;
  const bool shotReachedZero =
      shotWasAboveZero_ && shotRemaining == 0 && state_.shotClock.running;

  if (gameReachedZero) {
    gameClockWasAboveZero_ = false;
  } else if (gameRemaining > 0) {
    gameClockWasAboveZero_ = true;
  }

  if (shotReachedZero) {
    shotWasAboveZero_ = false;
  } else if (shotRemaining > 0) {
    shotWasAboveZero_ = true;
  }

  // A single horn pulse covers the common case where both clocks expire on the
  // same loop iteration.
  if (gameReachedZero || shotReachedZero) hornPending_ = true;
}

DisplayFrame ShotClockCore::frame(uint32_t nowMs) const {
  DisplayFrame result;
  result.role = state_.role;
  result.gameId = state_.gameId;
  result.homeTeam = state_.homeTeam;
  result.awayTeam = state_.awayTeam;
  result.homeScore = state_.homeScore;
  result.awayScore = state_.awayScore;
  result.period = state_.period;
  result.gameRemainingMs = effectiveRemaining(state_.gameClock, receivedAtMs_, nowMs);
  result.shotRemainingMs = effectiveRemaining(state_.shotClock, receivedAtMs_, nowMs);
  result.gameRunning = state_.gameClock.running;
  result.shotRunning = state_.shotClock.running;
  result.gameTimeOnly = result.hasGame() && result.gameRemainingMs <= 30000;
  result.brightness = brightness_;
  return result;
}

bool ShotClockCore::takeHornTrigger() {
  const bool pending = hornPending_;
  hornPending_ = false;
  return pending;
}

void ShotClockCore::brighten() {
  brightness_ = static_cast<uint8_t>(std::min(255, static_cast<int>(brightness_) + 16));
}

void ShotClockCore::darken() {
  brightness_ = static_cast<uint8_t>(std::max(16, static_cast<int>(brightness_) - 16));
}

}  // namespace polodeck
