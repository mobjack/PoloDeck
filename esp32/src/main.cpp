#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#if __has_include("polodeck_config.h")
#include "polodeck_config.h"
#endif

#ifndef POLODECK_WIFI_SSID
#define POLODECK_WIFI_SSID ""
#endif
#ifndef POLODECK_WIFI_PASSWORD
#define POLODECK_WIFI_PASSWORD ""
#endif
#ifndef POLODECK_SERVER_URL
#define POLODECK_SERVER_URL "http://127.0.0.1:8080"
#endif
#ifndef POLODECK_DEVICE_NAME
#define POLODECK_DEVICE_NAME "ESP32-S3 display"
#endif
#ifndef POLODECK_BRIGHTER_PIN
#define POLODECK_BRIGHTER_PIN 1
#endif
#ifndef POLODECK_DARKER_PIN
#define POLODECK_DARKER_PIN 2
#endif
#ifndef POLODECK_HORN_PIN
#define POLODECK_HORN_PIN 3
#endif

namespace {

constexpr char kFirmwareVersion[] = "0.1.0-dev";
constexpr uint32_t kWifiRetryMs = 5000;
constexpr uint32_t kButtonDebounceMs = 180;
constexpr uint32_t kHornDurationMs = 750;

struct ClockState {
  uint32_t remainingMs = 0;
  bool running = false;
};

struct DisplayState {
  String role = "UNASSIGNED";
  String gameId;
  String homeTeam;
  String awayTeam;
  int homeScore = 0;
  int awayScore = 0;
  int period = 1;
  ClockState gameClock;
  ClockState shotClock;
  String hornEventId;
  uint32_t receivedAtMs = 0;
};

DisplayState state;
String clientId;
String lastHornEventId;
uint32_t nextSyncAtMs = 0;
uint32_t nextWifiAttemptMs = 0;
uint32_t lastButtonAtMs = 0;
uint32_t hornOffAtMs = 0;
uint8_t brightness = 96;
bool receivedInitialState = false;
bool shotClockWasAboveZero = false;

uint32_t effectiveRemaining(const ClockState &clock) {
  if (!clock.running) return clock.remainingMs;
  const uint32_t elapsed = millis() - state.receivedAtMs;
  return elapsed >= clock.remainingMs ? 0 : clock.remainingMs - elapsed;
}

void triggerHorn() {
  digitalWrite(POLODECK_HORN_PIN, HIGH);
  hornOffAtMs = millis() + kHornDurationMs;
  Serial.println("horn: on");
}

void serviceHorn() {
  if (hornOffAtMs != 0 && static_cast<int32_t>(millis() - hornOffAtMs) >= 0) {
    digitalWrite(POLODECK_HORN_PIN, LOW);
    hornOffAtMs = 0;
    Serial.println("horn: off");
  }
}

void renderSerialPreview() {
  static uint32_t nextRenderAtMs = 0;
  if (static_cast<int32_t>(millis() - nextRenderAtMs) < 0) return;
  nextRenderAtMs = millis() + 250;

  if (state.role == "UNASSIGNED") {
    Serial.printf("display %s waiting for assignment (brightness %u)\n", clientId.c_str(), brightness);
    return;
  }
  if (state.gameId.isEmpty()) {
    Serial.printf("display role=%s waiting for active game\n", state.role.c_str());
    return;
  }

  Serial.printf(
      "%s %d - %d %s | period %d | game %lu | shot %lu | brightness %u\n",
      state.homeTeam.c_str(), state.homeScore, state.awayScore, state.awayTeam.c_str(), state.period,
      static_cast<unsigned long>(effectiveRemaining(state.gameClock)),
      static_cast<unsigned long>(effectiveRemaining(state.shotClock)), brightness);
}

void serviceBrightnessButtons() {
  if (millis() - lastButtonAtMs < kButtonDebounceMs) return;
  if (digitalRead(POLODECK_BRIGHTER_PIN) == LOW) {
    brightness = static_cast<uint8_t>(min(255, brightness + 16));
    lastButtonAtMs = millis();
  } else if (digitalRead(POLODECK_DARKER_PIN) == LOW) {
    brightness = static_cast<uint8_t>(max(16, brightness - 16));
    lastButtonAtMs = millis();
  }
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED || static_cast<int32_t>(millis() - nextWifiAttemptMs) < 0) return;
  nextWifiAttemptMs = millis() + kWifiRetryMs;
  if (strlen(POLODECK_WIFI_SSID) == 0) {
    Serial.println("wifi: configure esp32/include/polodeck_config.h");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(POLODECK_WIFI_SSID, POLODECK_WIFI_PASSWORD);
  Serial.printf("wifi: connecting to %s\n", POLODECK_WIFI_SSID);
}

void applySync(JsonDocument &doc) {
  state.role = doc["device"]["role"] | "UNASSIGNED";
  state.gameId = doc["device"]["gameId"] | "";
  const JsonVariant game = doc["state"];
  state.receivedAtMs = millis();
  if (game.isNull()) {
    state.homeTeam = "";
    state.awayTeam = "";
    state.gameClock = {};
    state.shotClock = {};
  } else {
    state.homeTeam = game["homeTeamName"] | "";
    state.awayTeam = game["awayTeamName"] | "";
    state.homeScore = game["homeScore"] | 0;
    state.awayScore = game["awayScore"] | 0;
    state.period = game["currentPeriod"] | 1;
    state.gameClock.remainingMs = game["gameClock"]["remainingMs"] | 0;
    state.gameClock.running = game["gameClock"]["running"] | false;
    state.shotClock.remainingMs = game["shotClock"]["remainingMs"] | 0;
    state.shotClock.running = game["shotClock"]["running"] | false;
    state.hornEventId = game["horn"]["eventId"] | "";

    if (receivedInitialState && !state.hornEventId.isEmpty() && state.hornEventId != lastHornEventId) {
      triggerHorn();
    }
    lastHornEventId = state.hornEventId;
    shotClockWasAboveZero = state.shotClock.remainingMs > 0;
  }
  receivedInitialState = true;
  nextSyncAtMs = millis() + static_cast<uint32_t>(doc["pollAfterMs"] | 1000);
}

void syncDisplay() {
  if (WiFi.status() != WL_CONNECTED || static_cast<int32_t>(millis() - nextSyncAtMs) < 0) return;
  nextSyncAtMs = millis() + 2000;

  HTTPClient http;
  const String url = String(POLODECK_SERVER_URL) + "/api/displays/" + clientId + "/sync";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  JsonDocument request;
  request["name"] = POLODECK_DEVICE_NAME;
  request["firmwareVersion"] = kFirmwareVersion;
  String body;
  serializeJson(request, body);

  const int status = http.POST(body);
  if (status != 200) {
    Serial.printf("sync: HTTP %d\n", status);
    http.end();
    return;
  }
  JsonDocument response;
  const DeserializationError error = deserializeJson(response, http.getStream());
  http.end();
  if (error) {
    Serial.printf("sync: invalid JSON: %s\n", error.c_str());
    return;
  }
  if ((response["protocolVersion"] | 0) != 1) {
    Serial.println("sync: unsupported protocol version");
    return;
  }
  applySync(response);
}

void serviceLocalShotClockHorn() {
  const uint32_t remaining = effectiveRemaining(state.shotClock);
  if (shotClockWasAboveZero && remaining == 0 && state.shotClock.running) {
    shotClockWasAboveZero = false;
    triggerHorn();
  } else if (remaining > 0) {
    shotClockWasAboveZero = true;
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(POLODECK_BRIGHTER_PIN, INPUT_PULLUP);
  pinMode(POLODECK_DARKER_PIN, INPUT_PULLUP);
  pinMode(POLODECK_HORN_PIN, OUTPUT);
  digitalWrite(POLODECK_HORN_PIN, LOW);

  const uint64_t chipId = ESP.getEfuseMac();
  char idBuffer[32];
  snprintf(idBuffer, sizeof(idBuffer), "esp32-%04x%08x", static_cast<uint16_t>(chipId >> 32),
           static_cast<uint32_t>(chipId));
  clientId = idBuffer;
  Serial.printf("PoloDeck ESP32-S3 %s (%s)\n", kFirmwareVersion, clientId.c_str());
  ensureWifi();
}

void loop() {
  ensureWifi();
  syncDisplay();
  serviceBrightnessButtons();
  serviceLocalShotClockHorn();
  serviceHorn();
  renderSerialPreview();
  delay(5);
}
