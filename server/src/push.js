import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { distanceKm } from "./filters.js";

export function createFirebasePush(projectId) {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  const messaging = getMessaging(app);

  return {
    async sendEarthquake(device, event) {
      const settings = device.settings;
      const distance = settings.scope === "LOCATION"
        ? Math.round(distanceKm(settings.latitude, settings.longitude, event.latitude, event.longitude))
        : null;
      const depth = Number.isFinite(event.depthKm) ? `${Math.round(Math.abs(event.depthKm))} km de profundidad` : "Profundidad no disponible";
      const body = [event.source, depth, distance == null ? null : `${distance} km de tu zona`].filter(Boolean).join(" · ");
      return messaging.send({
        ...messagingTarget(device),
        notification: {
          title: `Sismo M ${event.magnitude.toFixed(1)} · ${event.place}`,
          body,
        },
        data: {
          type: "earthquake",
          eventId: String(event.id),
          source: String(event.source),
          place: String(event.place),
          magnitude: String(event.magnitude),
          magnitudeType: String(event.magnitudeType || "M"),
          latitude: String(event.latitude),
          longitude: String(event.longitude),
          depthKm: Number.isFinite(event.depthKm) ? String(event.depthKm) : "",
          timestamp: String(event.timestamp),
          agency: String(event.agency || event.source),
          eventUrl: String(event.eventUrl || ""),
          sound: String(settings.alertSound && !isQuietAtSendTime(settings)),
        },
        android: {
          priority: "high",
          ttl: 120_000,
          notification: {
            channelId: settings.alertSound && !isQuietAtSendTime(settings)
              ? "sismi_earthquake_alerts_sound_v1"
              : "sismi_earthquake_alerts_silent_v1",
            visibility: "public",
            tag: `sismi-${event.source}-${event.id}`.slice(0, 120),
          },
        },
      });
    },

    async sendTest(device) {
      const settings = device.settings;
      const sound = Boolean(settings.alertSound && !isQuietAtSendTime(settings));
      return messaging.send({
        ...messagingTarget(device),
        notification: {
          title: "Prueba de alerta remota",
          body: "Sismi puede avisarte aunque la aplicación esté cerrada.",
        },
        data: { type: "test", sound: String(sound) },
        android: {
          priority: "high",
          ttl: 60_000,
          notification: {
            channelId: sound ? "sismi_earthquake_alerts_sound_v1" : "sismi_earthquake_alerts_silent_v1",
            visibility: "public",
          },
        },
      });
    },
  };
}

function messagingTarget(device) {
  if (device.firebaseMessagingToken) return { token: device.firebaseMessagingToken };
  return { fid: device.firebaseInstallationId };
}

function isQuietAtSendTime(settings) {
  if (!settings.quietHours) return false;
  const now = new Date();
  let current;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.timeZone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    current = Number(parts.find((part) => part.type === "hour")?.value) * 60
      + Number(parts.find((part) => part.type === "minute")?.value);
  } catch {
    return false;
  }
  const clock = (value, fallback) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const start = clock(settings.quietHoursStart, 22 * 60);
  const end = clock(settings.quietHoursEnd, 7 * 60);
  return start === end ? false : start < end ? current >= start && current < end : current >= start || current < end;
}
