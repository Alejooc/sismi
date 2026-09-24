import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EarthquakeMonitor } from "../src/monitor.js";
import { JsonStore } from "../src/storage.js";

const settings = {
  alertsEnabled: true,
  alertSound: true,
  minimumMagnitude: 2,
  source: "Todas",
  scope: "GLOBAL",
  radiusKm: 250,
  latitude: null,
  longitude: null,
  maxAlertsPerUpdate: 3,
  doNotDisturb: false,
  quietHours: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  timeZone: "UTC",
};

async function withMonitor(run) {
  const directory = await mkdtemp(join(tmpdir(), "sismi-monitor-state-"));
  const store = new JsonStore(join(directory, "state.json"));
  await store.load();
  const deliveries = [];
  await store.update((state) => {
    state.devices.push({ id: "test-device-123", tokenHash: "hash", firebaseInstallationId: "fid-for-testing-123", settings });
  });
  const now = Date.now();
  const monitor = new EarthquakeMonitor({
    config: { eventMaxAgeMs: 10 * 60_000 },
    store,
    push: { async sendEarthquake(device, event) { deliveries.push({ device, event }); }, async sendTest() {} },
    now: () => now,
  });
  try { await run({ monitor, deliveries, now, store }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("silencia el catálogo inicial y envía solo una vez el mismo evento entre fuentes", async () => {
  await withMonitor(async ({ monitor, deliveries, now }) => {
    const first = { id: "sgc-old", source: "SGC", magnitude: 3, timestamp: now - 30_000, latitude: 4.7, longitude: -74, place: "Cali" };
    await monitor.ingest([first], { baseline: true });
    assert.equal(deliveries.length, 0);

    const current = { ...first, id: "sgc-new", timestamp: now - 5_000 };
    await monitor.ingest([current]);
    await monitor.ingest([{ ...current, id: "usgs-copy", source: "USGS", timestamp: now - 4_000, magnitude: 3.1 }]);
    assert.equal(deliveries.length, 1);
  });
});

test("limita los avisos de cada lote según la preferencia del teléfono", async () => {
  await withMonitor(async ({ monitor, deliveries, now, store }) => {
    await store.update((state) => { state.devices[0].settings = { ...settings, maxAlertsPerUpdate: 1 }; });
    await monitor.ingest([
      { id: "older", source: "USGS", magnitude: 3, timestamp: now - 8_000, latitude: 40, longitude: -3, place: "Madrid" },
      { id: "newer", source: "USGS", magnitude: 3, timestamp: now - 2_000, latitude: 41, longitude: -3, place: "Oviedo" },
    ]);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].event.id, "newer");
  });
});
