import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, isDuplicateEvent, isQuietNow, matchesDeviceSettings } from "../src/filters.js";

const event = { source: "SGC", magnitude: 3.2, timestamp: Date.UTC(2026, 0, 1), latitude: 4.65, longitude: -74.05 };
const defaults = {
  alertsEnabled: true,
  doNotDisturb: false,
  minimumMagnitude: 2,
  source: "Todas",
  scope: "LOCATION",
  latitude: 4.711,
  longitude: -74.0721,
  radiusKm: 25,
  quietHours: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  timeZone: "America/Bogota",
};

test("calcula distancia y acepta eventos dentro del radio elegido", () => {
  assert.ok(distanceKm(0, 0, 0, 1) > 111 && distanceKm(0, 0, 0, 1) < 112);
  assert.equal(matchesDeviceSettings(event, defaults), true);
  assert.equal(matchesDeviceSettings(event, { ...defaults, radiusKm: 1 }), false);
});

test("respeta magnitud, fuente, alcance mundial y no molestar", () => {
  assert.equal(matchesDeviceSettings(event, { ...defaults, minimumMagnitude: 4 }), false);
  assert.equal(matchesDeviceSettings(event, { ...defaults, source: "USGS" }), false);
  assert.equal(matchesDeviceSettings({ ...event, latitude: 40, longitude: -3 }, { ...defaults, scope: "GLOBAL" }), true);
  assert.equal(matchesDeviceSettings(event, { ...defaults, doNotDisturb: true }), false);
});

test("aplica horario silencioso incluyendo el cruce de medianoche", () => {
  const atThreeBogota = Date.parse("2026-01-01T08:00:00Z");
  assert.equal(isQuietNow({ quietHours: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timeZone: "America/Bogota" }, atThreeBogota), true);
  assert.equal(isQuietNow({ quietHours: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timeZone: "America/Bogota" }, Date.parse("2026-01-01T15:00:00Z")), false);
  assert.equal(matchesDeviceSettings(event, { ...defaults, quietHours: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" }), true);
});

test("identifica duplicados publicados por agencias diferentes", () => {
  assert.equal(isDuplicateEvent(event, { ...event, source: "USGS", id: "other", timestamp: event.timestamp + 60_000, latitude: 4.7, longitude: -74.0, magnitude: 3.4 }), true);
  assert.equal(isDuplicateEvent(event, { ...event, timestamp: event.timestamp + 5 * 60_000 }), false);
});
