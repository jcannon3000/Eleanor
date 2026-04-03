import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { attachWebSocketServer } from "./lib/ws";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

migrate()
  .then(() => {
    const server = createServer(app);
    attachWebSocketServer(server);

    server.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run migrations");
    process.exit(1);
  });
