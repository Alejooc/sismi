export function matchesDeviceSettings(event, settings) {
  if (!settings.alertsEnabled || settings.doNotDisturb) return false;
  if (event.magnitude < settings.minimumMagnitude) return false;
  if (settings.source !== "Todas" && settings.source !== event.source) return false;
  if (settings.scope === "LOCATION") {
    if (!Number.isFinite(settings.latitude) || !Number.isFinite(settings.longitude)) return false;
    if (distanceKm(settings.latitude, settings.longitude, event.latitude, event.longitude) > settings.radiusKm) return false;
  }
  return true;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (value) => (value * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function isQuietNow(settings, now = Date.now()) {
  if (!settings.quietHours) return false;
  const start = parseClock(settings.quietHoursStart);
  const end = parseClock(settings.quietHoursEnd);
  if (start == null || end == null || start === end) return false;

  let hour;
  let minute;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.timeZone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    hour = Number(parts.find((part) => part.type === "hour")?.value);
    minute = Number(parts.find((part) => part.type === "minute")?.value);
  } catch {
    return false;
  }

  const current = hour * 60 + minute;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function isDuplicateEvent(left, right) {
  return Math.abs(left.timestamp - right.timestamp) <= 2 * 60_000
    && distanceKm(left.latitude, left.longitude, right.latitude, right.longitude) <= 35
    && Math.abs(left.magnitude - right.magnitude) <= 0.4;
}

function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}
