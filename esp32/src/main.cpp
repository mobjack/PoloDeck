#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <polodeck/ShotClockCore.h>

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

polodeck::ShotClockCore shotClockCore;
String clientId;
uint32_t nextSyncAtMs = 0;
uint32_t nextWifiAttemptMs = 0;
uint32_t lastButtonAtMs = 0;
uint32_t hornOffAtMs = 0;

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

  const polodeck::DisplayFrame frame = shotClockCore.frame(millis());
  if (!frame.assigned()) {
    Serial.printf("display %s waiting for assignment (brightness %u)\n", clientId.c_str(), frame.brightness);
    return;
  }
  if (!frame.hasGame()) {
    Serial.printf("display role=%s waiting for active game\n", frame.role.c_str());
    return;
  }

  Serial.printf(
      "%s %d - %d %s | period %d | game %lu | shot %lu | brightness %u\n",
      frame.homeTeam.c_str(), frame.homeScore, frame.awayScore, frame.awayTeam.c_str(), frame.period,
      static_cast<unsigned long>(frame.gameRemainingMs),
      static_cast<unsigned long>(frame.shotRemainingMs), frame.brightness);
}

void serviceBrightnessButtons() {
  if (millis() - lastButtonAtMs < kButtonDebounceMs) return;
  if (digitalRead(POLODECK_BRIGHTER_PIN) == LOW) {
    shotClockCore.brighten();
    lastButtonAtMs = millis();
  } else if (digitalRead(POLODECK_DARKER_PIN) == LOW) {
    shotClockCore.darken();
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

void applySync(JsonDocument &doc, uint32_t snapshotAgeMs) {
  polodeck::SyncSnapshot snapshot;
  snapshot.role = doc["device"]["role"] | "UNASSIGNED";
  snapshot.gameId = doc["device"]["gameId"] | "";
  const JsonVariant game = doc["state"];
  if (!game.isNull()) {
    snapshot.homeTeam = game["homeTeamName"] | "";
    snapshot.awayTeam = game["awayTeamName"] | "";
    snapshot.homeScore = game["homeScore"] | 0;
    snapshot.awayScore = game["awayScore"] | 0;
    snapshot.period = game["currentPeriod"] | 1;
    snapshot.gameClock.remainingMs = game["gameClock"]["remainingMs"] | 0;
    snapshot.gameClock.running = game["gameClock"]["running"] | false;
    snapshot.shotClock.remainingMs = game["shotClock"]["remainingMs"] | 0;
    snapshot.shotClock.running = game["shotClock"]["running"] | false;
    snapshot.hornEventId = game["horn"]["eventId"] | "";
  }
  shotClockCore.applySync(snapshot, millis(), snapshotAgeMs);
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

  const uint32_t requestStartedAtMs = millis();
  const int status = http.POST(body);
  const uint32_t roundTripMs = millis() - requestStartedAtMs;
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
  applySync(response, roundTripMs / 2);
}

void serviceLocalClockHorns() {
  shotClockCore.update(millis());
  if (shotClockCore.takeHornTrigger()) triggerHorn();
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
  serviceLocalClockHorns();
  serviceHorn();
  renderSerialPreview();
  delay(5);
}
