#pragma once

#include <cstdint>
#include <string>

namespace polodeck {

struct ClockSnapshot {
  uint32_t remainingMs = 0;
  bool running = false;
};

struct SyncSnapshot {
  std::string role = "UNASSIGNED";
  std::string gameId;
  std::string homeTeam;
  std::string awayTeam;
  int homeScore = 0;
  int awayScore = 0;
  int period = 1;
  ClockSnapshot gameClock;
  ClockSnapshot shotClock;
  std::string hornEventId;
};

struct DisplayFrame {
  std::string role;
  std::string gameId;
  std::string homeTeam;
  std::string awayTeam;
  int homeScore = 0;
  int awayScore = 0;
  int period = 1;
  uint32_t gameRemainingMs = 0;
  uint32_t shotRemainingMs = 0;
  bool gameRunning = false;
  bool shotRunning = false;
  bool gameTimeOnly = false;
  uint8_t brightness = 96;

  bool assigned() const { return role != "UNASSIGNED"; }
  bool hasGame() const { return !gameId.empty(); }
};

class ShotClockCore {
 public:
  void applySync(const SyncSnapshot &snapshot, uint32_t nowMs, uint32_t snapshotAgeMs = 0);
  void update(uint32_t nowMs);
  DisplayFrame frame(uint32_t nowMs) const;

  bool takeHornTrigger();
  void brighten();
  void darken();
  uint8_t brightness() const { return brightness_; }

 private:
  static uint32_t effectiveRemaining(const ClockSnapshot &clock, uint32_t receivedAtMs,
                                     uint32_t nowMs);

  SyncSnapshot state_;
  std::string lastHornEventId_;
  uint32_t receivedAtMs_ = 0;
  uint8_t brightness_ = 96;
  bool initialized_ = false;
  bool gameClockWasAboveZero_ = false;
  bool shotWasAboveZero_ = false;
  bool hornPending_ = false;
};

}  // namespace polodeck
