#include "polodeck/ShotClockCore.h"

#include <cstdlib>
#include <iostream>

namespace {

int failures = 0;

void expect(bool condition, const char *message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    failures += 1;
  }
}

polodeck::SyncSnapshot runningSnapshot(uint32_t gameMs = 125000, uint32_t shotMs = 30000) {
  polodeck::SyncSnapshot snapshot;
  snapshot.role = "SHOT_CLOCK";
  snapshot.gameId = "game-1";
  snapshot.gameClock = {gameMs, true};
  snapshot.shotClock = {shotMs, true};
  return snapshot;
}

void testInterpolationAndStop() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(), 1000);
  auto frame = core.frame(3500);
  expect(frame.gameRemainingMs == 122500, "game clock interpolates from the sync anchor");
  expect(frame.shotRemainingMs == 27500, "shot clock interpolates from the sync anchor");

  auto stopped = runningSnapshot(122500, 27500);
  stopped.gameClock.running = false;
  stopped.shotClock.running = false;
  core.applySync(stopped, 3500);
  frame = core.frame(9000);
  expect(frame.gameRemainingMs == 122500, "stopped game clock remains fixed");
  expect(frame.shotRemainingMs == 27500, "stopped shot clock remains fixed");
}

void testCountdownClampsAndHornsOnce() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(5000, 1000), 100);
  core.update(1099);
  expect(!core.takeHornTrigger(), "horn does not fire before zero");
  core.update(1100);
  expect(core.frame(1100).shotRemainingMs == 0, "shot clock clamps at zero");
  expect(core.takeHornTrigger(), "horn fires when the local shot clock reaches zero");
  core.update(2000);
  expect(!core.takeHornTrigger(), "local zero horn fires only once");
}

void testGameClockHornsAtZeroOnce() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(1000, 5000), 100);
  core.update(1099);
  expect(!core.takeHornTrigger(), "quarter horn does not fire before game-clock zero");
  core.update(1100);
  expect(core.frame(1100).gameRemainingMs == 0, "game clock clamps at zero");
  expect(core.takeHornTrigger(), "quarter horn fires when the local game clock reaches zero");
  core.update(2000);
  expect(!core.takeHornTrigger(), "quarter horn fires only once");
}

void testSimultaneousClockExpiryProducesOneHorn() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(1000, 1000), 0);
  core.update(1000);
  expect(core.takeHornTrigger(), "simultaneous clock expiry fires the horn");
  expect(!core.takeHornTrigger(), "simultaneous clock expiry queues only one horn pulse");
}

void testInitialExpiredSnapshotDoesNotHorn() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(0, 0), 0);
  core.update(0);
  expect(!core.takeHornTrigger(), "an initially expired snapshot does not replay the horn");
}

void testServerHornEdge() {
  polodeck::ShotClockCore core;
  auto snapshot = runningSnapshot();
  snapshot.hornEventId = "old-event";
  core.applySync(snapshot, 0);
  expect(!core.takeHornTrigger(), "existing horn event is ignored on first sync");
  core.applySync(snapshot, 500);
  expect(!core.takeHornTrigger(), "repeated horn event is ignored");
  snapshot.hornEventId = "new-event";
  core.applySync(snapshot, 1000);
  expect(core.takeHornTrigger(), "a new server horn event fires once");
  expect(!core.takeHornTrigger(), "server horn latch is consumed once");
}

void testMillisWraparound() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(2000, 2000), 0xfffffff0u);
  const auto frame = core.frame(0x00000054u);
  expect(frame.shotRemainingMs == 1900, "clock interpolation survives uint32 millis rollover");
}

void testSnapshotTransportAge() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(5000, 5000), 1000, 125);
  expect(core.frame(1000).gameRemainingMs == 4875, "sync compensates for snapshot transport age");
}

void testBrightnessBounds() {
  polodeck::ShotClockCore core;
  for (int i = 0; i < 20; ++i) core.brighten();
  expect(core.brightness() == 255, "brightness clamps at 255");
  for (int i = 0; i < 20; ++i) core.darken();
  expect(core.brightness() == 16, "brightness clamps at the safe minimum");
}

void testFinalThirtySecondsGameTimeOnly() {
  polodeck::ShotClockCore core;
  core.applySync(runningSnapshot(30001, 12000), 0);
  expect(!core.frame(0).gameTimeOnly, "shot clock remains visible above 30 seconds");
  expect(core.frame(1).gameTimeOnly, "display switches to game-time-only at exactly 30 seconds");
}

}  // namespace

int main() {
  testInterpolationAndStop();
  testCountdownClampsAndHornsOnce();
  testGameClockHornsAtZeroOnce();
  testSimultaneousClockExpiryProducesOneHorn();
  testInitialExpiredSnapshotDoesNotHorn();
  testServerHornEdge();
  testMillisWraparound();
  testSnapshotTransportAge();
  testBrightnessBounds();
  testFinalThirtySecondsGameTimeOnly();
  if (failures == 0) std::cout << "All shot-clock core tests passed.\n";
  return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
