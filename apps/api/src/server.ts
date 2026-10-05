import { buildApplication } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();
const runtime = buildApplication(config);
const server = runtime.app.listen(config.port, () => {
  logger.info(
    { port: config.port, providerMode: config.providerMode },
    "l5sly API is listening",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down l5sly API");
  server.close(() => {
    runtime.database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
