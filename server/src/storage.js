import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_STATE = { version: 1, bootstrapped: false, devices: [], seenEvents: {}, recentAlerts: [] };

export class JsonStore {
  #state = structuredClone(EMPTY_STATE);
  #writeQueue = Promise.resolve();

  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.#state = {
        ...structuredClone(EMPTY_STATE),
        ...parsed,
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        seenEvents: parsed.seenEvents && typeof parsed.seenEvents === "object" ? parsed.seenEvents : {},
        recentAlerts: Array.isArray(parsed.recentAlerts) ? parsed.recentAlerts : [],
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`No se pudo leer el almacenamiento local de Sismi: ${error.message}`);
      await this.flush();
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  update(mutator) {
    mutator(this.#state);
    return this.flush();
  }

  flush() {
    const snapshot = this.snapshot();
    this.#writeQueue = this.#writeQueue.then(async () => {
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, this.filePath);
    });
    return this.#writeQueue;
  }
}
