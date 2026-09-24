import WebSocket from "ws";
import { fetchSgcEvents, fetchUsgsEvents, normalizeEmscMessage } from "./earthquakes.js";
import { isDuplicateEvent, matchesDeviceSettings } from "./filters.js";

const EMSC_URL = "wss://www.seismicportal.eu/standing_order/websocket";
const EVENT_RETENTION_MS = 48 * 60 * 60_000;
const DELIVERY_RETENTION_MS = 48 * 60 * 60_000;

export class EarthquakeMonitor {
  constructor({ config, store, push, fetchImpl = fetch, now = Date.now, onStatus = () => {} }) {
    this.config = config;
    this.store = store;
    this.push = push;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.onStatus = onStatus;
    this.status = {
      USGS: { status: "pending", count: 0, checkedAt: null, error: null },
      SGC: { status: "pending", count: 0, checkedAt: null, error: null },
      EMSC: { status: "pending", count: 0, checkedAt: null, error: null },
    };
    this.timers = [];
    this.socket = null;
    this.stopped = false;
    this.emscRetry = 0;
    this.emscRetryTimer = null;
    this.pollLocks = new Map();
  }

  async start() {
    this.stopped = false;
    const firstRun = !this.store.snapshot().bootstrapped;
    await Promise.all([
      this.pollSource("USGS", { baseline: firstRun }),
      this.pollSource("SGC", { baseline: firstRun }),
    ]);
    this.timers.push(setInterval(() => void this.pollSource("USGS"), this.config.usgsPollMs));
    this.timers.push(setInterval(() => void this.pollSource("SGC"), this.config.sgcPollMs));
    this.connectEmsc();
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    clearTimeout(this.emscRetryTimer);
    this.socket?.close();
    this.socket = null;
  }

  health() {
    return Object.fromEntries(Object.entries(this.status).map(([source, value]) => [source, { ...value }]));
  }

  async pollSource(source, { baseline = false } = {}) {
    if (this.stopped || this.pollLocks.get(source)) return;
    this.pollLocks.set(source, true);
    try {
      const events = source === "USGS"
        ? await fetchUsgsEvents(this.fetchImpl)
        : await fetchSgcEvents({
          fetchImpl: this.fetchImpl,
          windowDays: this.config.sgcWindowDays,
          now: new Date(this.now()),
          feedUrl: this.config.sgcFeedUrl,
          relayToken: this.config.sgcRelayToken,
        });
      await this.recordSource(source, { status: "ok", count: events.length, checkedAt: this.now(), error: null });
      await this.ingest(events, { baseline });
    } catch (error) {
      await this.recordSource(source, { status: "error", count: 0, checkedAt: this.now(), error: safeError(error) });
    } finally {
      this.pollLocks.set(source, false);
    }
  }

  async ingest(events, { baseline = false } = {}) {
    const time = this.now();
    const state = this.store.snapshot();
    const fresh = [];
    const seen = { ...state.seenEvents };
    for (const event of events) {
      if (!event || !Number.isFinite(event.timestamp)) continue;
      const key = eventKey(event);
      if (Object.hasOwn(seen, key)) continue;
      seen[key] = time;
      if (!baseline && time - event.timestamp <= this.config.eventMaxAgeMs && event.timestamp <= time + 60_000) fresh.push(event);
    }
    const cutoff = time - EVENT_RETENTION_MS;
    for (const [key, observedAt] of Object.entries(seen)) if (observedAt < cutoff) delete seen[key];
    await this.store.update((current) => {
      current.seenEvents = seen;
      current.bootstrapped = true;
      current.recentAlerts = current.recentAlerts.filter((item) => item.sentAt >= time - DELIVERY_RETENTION_MS);
    });
    await this.dispatchBatch(fresh.sort((left, right) => right.timestamp - left.timestamp));
  }

  async dispatchBatch(events) {
    if (events.length === 0) return;
    const snapshot = this.store.snapshot();
    for (const device of snapshot.devices) {
      const alreadySent = snapshot.recentAlerts
        .filter((entry) => entry.deviceId === device.id)
        .map((entry) => entry.event);
      const candidates = [];
      for (const event of events) {
        if (!matchesDeviceSettings(event, device.settings)) continue;
        if (alreadySent.some((recent) => isDuplicateEvent(recent, event))) continue;
        if (candidates.some((candidate) => isDuplicateEvent(candidate, event))) continue;
        candidates.push(event);
      }
      const eligible = candidates.slice(0, device.settings.maxAlertsPerUpdate);
      for (const event of eligible) {
        try {
          await this.push.sendEarthquake(device, event);
          await this.store.update((state) => {
            state.recentAlerts.push({ deviceId: device.id, event, sentAt: this.now() });
            state.recentAlerts = state.recentAlerts.slice(-2_000);
          });
        } catch (error) {
          console.error(`[push] Envío fallido (${event.source}, ${event.id}): ${safeError(error)}`);
          if (isInvalidTokenError(error)) {
            await this.store.update((state) => {
              state.devices = state.devices.filter((stored) => stored.id !== device.id);
            });
          }
        }
      }
    }
  }

  async testDevice(device) {
    return this.push.sendTest(device);
  }

  async recordSource(source, nextStatus) {
    this.status[source] = nextStatus;
    this.onStatus(this.health());
  }

  connectEmsc() {
    if (this.stopped) return;
    this.status.EMSC = { ...this.status.EMSC, status: "pending", error: null };
    this.onStatus(this.health());
    try {
      const socket = new WebSocket(EMSC_URL, { handshakeTimeout: 10_000 });
      this.socket = socket;
      socket.on("open", () => {
        this.emscRetry = 0;
        this.status.EMSC = { ...this.status.EMSC, status: "ok", error: null, checkedAt: this.now() };
        this.onStatus(this.health());
      });
      socket.on("message", (raw) => {
        try {
          const event = normalizeEmscMessage(JSON.parse(raw.toString()));
          if (!event) return;
          this.status.EMSC = { ...this.status.EMSC, status: "ok", count: this.status.EMSC.count + 1, checkedAt: this.now(), error: null };
          this.onStatus(this.health());
          void this.ingest([event]);
        } catch (error) {
          console.warn(`[emsc] Mensaje ignorado: ${safeError(error)}`);
        }
      });
      socket.on("error", (error) => {
        this.status.EMSC = { ...this.status.EMSC, status: "error", error: safeError(error), checkedAt: this.now() };
        this.onStatus(this.health());
      });
      socket.on("close", () => {
        if (this.socket === socket) this.socket = null;
        if (!this.stopped) {
          this.status.EMSC = { ...this.status.EMSC, status: "error", error: "Conexión cerrada", checkedAt: this.now() };
          this.onStatus(this.health());
          this.scheduleEmscReconnect();
        }
      });
    } catch (error) {
      this.status.EMSC = { ...this.status.EMSC, status: "error", error: safeError(error), checkedAt: this.now() };
      this.onStatus(this.health());
      this.scheduleEmscReconnect();
    }
  }

  scheduleEmscReconnect() {
    if (this.stopped || this.emscRetryTimer) return;
    const wait = Math.min(60_000, 3_000 * 2 ** this.emscRetry++);
    this.emscRetryTimer = setTimeout(() => {
      this.emscRetryTimer = null;
      this.connectEmsc();
    }, wait);
  }
}

export function eventKey(event) {
  return `${event.source}:${event.id}`;
}

function safeError(error) {
  return String(error?.message || error || "Error desconocido").slice(0, 300);
}

function isInvalidTokenError(error) {
  return ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(error?.code);
}
