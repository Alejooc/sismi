const positiveInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

export function readConfig(env = process.env) {
  const pairingCode = String(env.PAIRING_CODE ?? "").trim();
  if (pairingCode.length < 24 || pairingCode.startsWith("replace-")) {
    throw new Error("Configura PAIRING_CODE con al menos 24 caracteres aleatorios.");
  }

  const projectId = String(env.FIREBASE_PROJECT_ID ?? "").trim();
  if (!projectId || projectId.startsWith("replace-")) {
    throw new Error("Configura FIREBASE_PROJECT_ID con el ID de tu proyecto Firebase.");
  }

  return {
    host: env.HOST || "127.0.0.1",
    port: positiveInteger(env.PORT, 8787, 1, 65535),
    dataFile: env.DATA_FILE || "./data/state.json",
    projectId,
    pairingCode,
    usgsPollMs: positiveInteger(env.USGS_POLL_MS, 45_000, 15_000, 300_000),
    sgcPollMs: positiveInteger(env.SGC_POLL_MS, 90_000, 30_000, 900_000),
    sgcWindowDays: positiveInteger(env.SGC_WINDOW_DAYS, 2, 1, 14),
    sgcFeedUrl: String(env.SGC_FEED_URL || "").trim() || undefined,
    sgcRelayToken: String(env.SGC_RELAY_TOKEN || "").trim(),
    eventMaxAgeMs: positiveInteger(env.EVENT_MAX_AGE_MINUTES, 30, 1, 60) * 60_000,
  };
}
