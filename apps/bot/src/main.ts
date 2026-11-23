import { loadConfig } from "@sigap/config";
import { BotApi } from "./api-client.js";
import { createLogger } from "./logger.js";
import { startOutboxWorker } from "./outbox-worker.js";
import { WhatsAppClient } from "./wa-client.js";
import { loadEnv } from "./env.js";

loadEnv();
const config = loadConfig({}, { component: "bot" });
const logger = createLogger(config);

if (!config.SIGAP_WA_NUMBER) {
  logger.warn(
    "SIGAP_WA_NUMBER belum diisi. Bot tetap bisa pairing, tetapi nomor belum tercatat di Pengaturan."
  );
}

const api = new BotApi(config.SIGAP_API_URL, config.SIGAP_INTERNAL_TOKEN);
const client = new WhatsAppClient(config, api, logger);
const stopOutbox = startOutboxWorker(api, () => client.getReadySocket(), logger);

let controlWarned = false;
let controlBusy = false;
let lastHandledCommandId: string | null = null;
const pollControl = async () => {
  if (controlBusy) return;
  controlBusy = true;
  try {
    const { command } = await api.getControl();
    controlWarned = false;
    if (command) {
      if (command.id !== lastHandledCommandId) {
        logger.info({ command: command.command }, "Command WhatsApp dari dashboard");
        await client.handleCommand(command.command);
        lastHandledCommandId = command.id;
      }
      await api.ackControl(command.id);
    }
  } catch (error) {
    if (!controlWarned) {
      logger.warn({ err: error }, "Gagal memeriksa command WhatsApp dari dashboard");
      controlWarned = true;
    }
  } finally {
    controlBusy = false;
  }
};

let controlTimer: NodeJS.Timeout | null = null;

logger.info(
  {
    api: config.SIGAP_API_URL,
    authDir: config.botAuthDir,
    unit: config.SIGAP_UNIT_NAME
  },
  "SIGAP bot starting"
);

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Bot shutting down");
  if (controlTimer) clearInterval(controlTimer);
  stopOutbox();
  await client.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.start();

controlTimer = setInterval(() => void pollControl(), 2_500);
void pollControl();
