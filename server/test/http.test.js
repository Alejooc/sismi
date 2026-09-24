import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpHandler } from "../src/http.js";
import { JsonStore } from "../src/storage.js";

const pairingCode = "test-pairing-code-with-enough-random-looking-length-987654321";
const settings = {
  alertsEnabled: true,
  alertSound: true,
  minimumMagnitude: 3,
  source: "Todas",
  scope: "LOCATION",
  radiusKm: 250,
  latitude: 4.71,
  longitude: -74.07,
  maxAlertsPerUpdate: 3,
  doNotDisturb: false,
  quietHours: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  timeZone: "America/Bogota",
};

async function withService(run) {
  const directory = await mkdtemp(join(tmpdir(), "sismi-monitor-test-"));
  const store = new JsonStore(join(directory, "state.json"));
  await store.load();
  const testPush = { async sendTest() {}, async sendEarthquake() {} };
  const monitor = { health: () => ({ USGS: { status: "ok" } }), async testDevice(device) { await testPush.sendTest(device); } };
  const server = createServer(createHttpHandler({ pairingCode, store, monitor }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await run({ baseUrl, store }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("vincula dispositivos con código privado y actualiza filtros con sesión", async () => {
  await withService(async ({ baseUrl, store }) => {
    const registration = await fetch(`${baseUrl}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: "device-test-001", pairingCode, firebaseInstallationId: "firebase-installation-id-1234567890", settings }),
    });
    assert.equal(registration.status, 201);
    const { deviceToken } = await registration.json();
    assert.ok(deviceToken.length >= 32);
    assert.equal(store.snapshot().devices.length, 1);
    assert.ok(!JSON.stringify(store.snapshot()).includes(deviceToken));

    const update = await fetch(`${baseUrl}/api/devices/device-test-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ firebaseInstallationId: "firebase-installation-id-1234567890", settings: { ...settings, minimumMagnitude: 4.1 } }),
    });
    assert.equal(update.status, 200);
    assert.equal(store.snapshot().devices[0].settings.minimumMagnitude, 4.1);
  });
});

test("rechaza códigos de vinculación y sesiones incorrectos", async () => {
  await withService(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: "device-test-001", pairingCode: "incorrect", firebaseInstallationId: "firebase-installation-id-1234567890", settings }),
    });
    assert.equal(response.status, 401);

    const update = await fetch(`${baseUrl}/api/devices/device-test-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer invalid-device-token-12345678901234567890" },
      body: JSON.stringify({ firebaseInstallationId: "firebase-installation-id-1234567890", settings }),
    });
    assert.equal(update.status, 401);
  });
});

test("no guarda coordenadas si el teléfono elige alcance mundial", async () => {
  await withService(async ({ baseUrl, store }) => {
    const response = await fetch(`${baseUrl}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installationId: "device-global-001",
        pairingCode,
        firebaseInstallationId: "firebase-installation-id-1234567890",
        settings: { ...settings, scope: "GLOBAL", latitude: null, longitude: null },
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(store.snapshot().devices[0].settings.latitude, null);
    assert.equal(store.snapshot().devices[0].settings.longitude, null);
  });
});

test("exige coordenadas válidas si el teléfono elige Mi zona", async () => {
  await withService(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installationId: "device-invalid-location",
        pairingCode,
        firebaseInstallationId: "firebase-installation-id-1234567890",
        settings: { ...settings, latitude: null, longitude: null },
      }),
    });
    assert.equal(response.status, 400);
  });
});
