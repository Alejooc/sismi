import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const SOURCES = new Set(["Todas", "SGC", "USGS", "EMSC"]);
const SCOPES = new Set(["LOCATION", "GLOBAL"]);

export function createHttpHandler({ pairingCode, store, monitor }) {
  const autoRegistrationRate = new Map();
  return async function handle(request, response) {
    setSecurityHeaders(response);
    const url = new URL(request.url || "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { ok: true, service: "sismi-monitor", sources: monitor.health() });
      }
      if (request.method === "POST" && url.pathname === "/api/devices/register") {
        return await registerDevice(request, response, pairingCode, store);
      }
      if (request.method === "POST" && url.pathname === "/api/devices/auto-register") {
        return await autoRegisterDevice(request, response, store, autoRegistrationRate);
      }
      const route = /^\/api\/devices\/([a-zA-Z0-9_-]{8,128})(?:\/(test))?$/.exec(url.pathname);
      if (route) {
        const [, deviceId, action] = route;
        const device = await authenticateDevice(request, deviceId, store);
        if (!device) return sendJson(response, 401, { error: "Sesión del dispositivo inválida. Vuelve a vincular Sismi." });
        if (request.method === "PATCH" && !action) {
          const body = await readJson(request);
          const settings = normalizeSettings(body.settings);
          const firebaseInstallationId = normalizeFid(body.firebaseInstallationId ?? device.firebaseInstallationId);
          const firebaseMessagingToken = body.firebaseMessagingToken == null
            ? device.firebaseMessagingToken
            : normalizeMessagingToken(body.firebaseMessagingToken);
          await store.update((state) => {
            const stored = state.devices.find((item) => item.id === deviceId);
            stored.settings = settings;
            stored.firebaseInstallationId = firebaseInstallationId;
            stored.firebaseMessagingToken = firebaseMessagingToken;
            stored.updatedAt = Date.now();
          });
          return sendJson(response, 200, { ok: true });
        }
        if (request.method === "DELETE" && !action) {
          await store.update((state) => { state.devices = state.devices.filter((item) => item.id !== deviceId); });
          return sendJson(response, 200, { ok: true });
        }
        if (request.method === "POST" && action === "test") {
          await monitor.testDevice(device);
          return sendJson(response, 202, { ok: true, message: "Aviso enviado a Firebase." });
        }
      }
      return sendJson(response, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error(`[http] ${request.method} ${url.pathname}: ${error.message}`);
      return sendJson(response, status, { error: status >= 500 ? "No se pudo completar la solicitud." : error.message });
    }
  };
}

async function registerDevice(request, response, pairingCode, store) {
  const body = await readJson(request);
  if (!sameSecret(body.pairingCode, pairingCode)) return sendJson(response, 401, { error: "Código de vinculación incorrecto." });
  return await saveDeviceRegistration(response, store, body);
}

async function autoRegisterDevice(request, response, store, rateState) {
  const body = await readJson(request);
  const ip = clientAddress(request);
  enforceRateLimit(rateState, `ip:${ip}`, 20, 10 * 60_000);
  const id = normalizeInstallationId(body.installationId);
  enforceRateLimit(rateState, `installation:${id}`, 5, 60 * 60_000);
  return await saveDeviceRegistration(response, store, body);
}

async function saveDeviceRegistration(response, store, body) {
  const id = normalizeInstallationId(body.installationId);
  const firebaseInstallationId = normalizeFid(body.firebaseInstallationId);
  const firebaseMessagingToken = body.firebaseMessagingToken == null
    ? null
    : normalizeMessagingToken(body.firebaseMessagingToken);
  const settings = normalizeSettings(body.settings);
  const deviceToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const device = {
    id,
    tokenHash: hashSecret(deviceToken),
    firebaseInstallationId,
    firebaseMessagingToken,
    settings,
    createdAt: now,
    updatedAt: now,
  };
  await store.update((state) => {
    state.devices = state.devices.filter((current) => current.id !== id);
    state.devices.push(device);
  });
  return sendJson(response, 201, { ok: true, deviceToken });
}

function normalizeInstallationId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw clientError("Identificador de instalación inválido.");
  return id;
}

function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const candidate = typeof forwarded === "string" ? forwarded.split(",", 1)[0].trim() : "";
  return (candidate || request.socket?.remoteAddress || "unknown").slice(0, 128);
}

function enforceRateLimit(rateState, key, maximum, windowMs) {
  const now = Date.now();
  const current = rateState.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateState.set(key, { startedAt: now, count: 1 });
    if (rateState.size > 10_000) {
      for (const [storedKey, entry] of rateState) {
        if (now - entry.startedAt >= windowMs) rateState.delete(storedKey);
      }
    }
    return;
  }
  current.count += 1;
  if (current.count > maximum) throw clientError("Demasiadas solicitudes. Inténtalo de nuevo más tarde.", 429);
}

async function authenticateDevice(request, deviceId, store) {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || "")?.[1];
  if (!bearer || bearer.length < 32) return null;
  const device = store.snapshot().devices.find((item) => item.id === deviceId);
  if (!device || !sameSecret(hashSecret(bearer), device.tokenHash)) return null;
  return device;
}

function normalizeSettings(input) {
  if (!input || typeof input !== "object") throw clientError("Faltan las preferencias de alertas.");
  const source = String(input.source ?? "Todas");
  const scope = String(input.scope ?? "LOCATION");
  const magnitude = Number(input.minimumMagnitude);
  const radius = Number(input.radiusKm);
  const maxAlerts = Number(input.maxAlertsPerUpdate);
  if (!SOURCES.has(source) || !SCOPES.has(scope)) throw clientError("El filtro seleccionado no es válido.");
  if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > 10) throw clientError("La magnitud mínima no es válida.");
  if (!Number.isInteger(radius) || radius < 1 || radius > 20_000) throw clientError("El radio seleccionado no es válido.");
  if (!Number.isInteger(maxAlerts) || maxAlerts < 1 || maxAlerts > 10) throw clientError("El máximo de avisos no es válido.");
  const latitude = scope === "LOCATION" ? finiteInput(input.latitude) : null;
  const longitude = scope === "LOCATION" ? finiteInput(input.longitude) : null;
  if (scope === "LOCATION" && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    throw clientError("Hace falta una ubicación válida para vigilar tu zona.");
  }
  const timeZone = String(input.timeZone || "UTC").slice(0, 80);
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw clientError("La zona horaria no es válida."); }
  return {
    alertsEnabled: input.alertsEnabled === true,
    alertSound: input.alertSound !== false,
    minimumMagnitude: magnitude,
    source,
    scope,
    radiusKm: radius,
    latitude,
    longitude,
    maxAlertsPerUpdate: maxAlerts,
    doNotDisturb: input.doNotDisturb === true,
    quietHours: input.quietHours === true,
    quietHoursStart: normalizeClock(input.quietHoursStart, "22:00"),
    quietHoursEnd: normalizeClock(input.quietHoursEnd, "07:00"),
    timeZone,
  };
}

function normalizeClock(value, fallback) {
  const text = String(value ?? fallback);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw clientError("El horario silencioso no es válido.");
  return text;
}

function normalizeFid(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 256 || /\s/.test(value)) {
    throw clientError("No se recibió el identificador Firebase de este teléfono.");
  }
  return value;
}

function normalizeMessagingToken(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 4096 || /\s/.test(value)) {
    throw clientError("No se recibió un token Firebase válido para este teléfono.");
  }
  return value;
}

function finiteInput(value) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 24_000) throw clientError("La solicitud es demasiado grande.", 413);
  }
  try { return JSON.parse(body || "{}"); } catch { throw clientError("El formato de la solicitud no es válido."); }
}

function sameSecret(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function clientError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function setSecurityHeaders(response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response, status, payload) {
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}
