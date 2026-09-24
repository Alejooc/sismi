import test from "node:test";
import assert from "node:assert/strict";
import { fetchSgcEvents, fetchUsgsEvents, normalizeEmscMessage } from "../src/earthquakes.js";

test("normaliza sismos USGS y descarta coordenadas incompletas", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    features: [
      {
        id: "us-test-1",
        geometry: { coordinates: [-74.1, 4.6, 12] },
        properties: { mag: 3.4, time: 1_800_000_000_000, place: "Colombia", magType: "mb", net: "us" },
      },
      {
        id: "us-test-invalid",
        geometry: { coordinates: [null, 4.6, null] },
        properties: { mag: 3.1, time: 1_800_000_000_000 },
      },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const events = await fetchUsgsEvents(fetchImpl);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "us-test-1");
  assert.equal(events[0].latitude, 4.6);
  assert.equal(events[0].depthKm, 12);
});

test("normaliza mensajes nuevos de EMSC y omite mensajes de borrado", () => {
  const message = {
    action: "create",
    data: { properties: { unid: "em-test-1", lat: "4.6", lon: "-74.1", mag: "3.7", time: "2026-09-21T12:00:00Z", flynn_region: "Colombia", depth: "10" } },
  };
  const event = normalizeEmscMessage(message);
  assert.equal(event.source, "EMSC");
  assert.equal(event.magnitude, 3.7);
  assert.equal(normalizeEmscMessage({ ...message, action: "delete" }), null);
  assert.equal(normalizeEmscMessage({ ...message, data: { properties: { ...message.data.properties, lat: null } } }), null);
});

test("lee y normaliza el feed público usado por el visor del SGC", async () => {
  const fetchImpl = async (url, options = {}) => {
    assert.equal(url, "https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json");
    assert.equal(options.headers.Referer, "https://www.sgc.gov.co/sismos");
    return new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        id: "SGC2026test01",
        geometry: { coordinates: [4.45, -76.7, 45] },
        properties: {
          utcTime: "2026-09-19 05:01:47",
          updated: "2026-09-21 07:32:52",
          place: "Istmina - Chocó, Colombia",
          mag: 4,
          magType: "MLv",
          depth: 45,
          agency: "SGC",
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const events = await fetchSgcEvents({ fetchImpl, windowDays: 2, now: new Date("2026-09-20T19:00:00Z") });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "SGC2026test01");
  assert.equal(events[0].timestamp, Date.parse("2026-09-19T05:01:47Z"));
  assert.equal(events[0].magnitude, 4);
  assert.equal(events[0].depthKm, 45);
  assert.equal(events[0].latitude, 4.45);
  assert.equal(events[0].longitude, -76.7);
});

test("limita los resultados SGC al rango configurado", async () => {
  const feature = (id, utcTime) => ({
    id,
    geometry: { coordinates: [4.6, -74.1, 10] },
    properties: { utcTime, place: "Colombia", mag: 2.1, magType: "ML", agency: "SGC" },
  });
  const fetchImpl = async () => new Response(JSON.stringify({
    features: [
      feature("reciente", "2026-09-21 18:00:00"),
      feature("antiguo", "2026-09-18 18:00:00"),
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const events = await fetchSgcEvents({ fetchImpl, windowDays: 2, now: new Date("2026-09-21T19:00:00Z") });
  assert.deepEqual(events.map((event) => event.id), ["reciente"]);
});

test("autentica las consultas SGC enviadas mediante el relay", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://sgc-sismi.jaofy.com/feed");
    assert.equal(options.headers.Authorization, "Bearer token-secreto");
    return new Response(JSON.stringify({ features: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const events = await fetchSgcEvents({
    fetchImpl,
    feedUrl: "https://sgc-sismi.jaofy.com/feed",
    relayToken: "token-secreto",
  });
  assert.deepEqual(events, []);
});
