import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { createHttpHandler } from "./http.js";
import { EarthquakeMonitor } from "./monitor.js";
import { createFirebasePush } from "./push.js";
import { JsonStore } from "./storage.js";

const config = readConfig();
const store = new JsonStore(config.dataFile);
await store.load();
const push = createFirebasePush(config.projectId);
const monitor = new EarthquakeMonitor({ config, store, push });
const server = createServer(createHttpHandler({ pairingCode: config.pairingCode, store, monitor }));

server.listen(config.port, config.host, () => {
  console.log(`[sismi] Servicio disponible en ${config.host}:${config.port}`);
  void monitor.start().catch((error) => console.error(`[monitor] No se pudo iniciar: ${error.message}`));
});

function shutdown(signal) {
  console.log(`[sismi] Recibida señal ${signal}; cerrando servicio.`);
  monitor.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
