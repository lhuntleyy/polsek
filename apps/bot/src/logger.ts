import pino from "pino";
import type { AppConfig } from "@sigap/config";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.SIGAP_LOG_LEVEL,
    ...(config.isDevelopment
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" }
          }
        }
      : {})
  });
}

export type BotLogger = ReturnType<typeof createLogger>;
