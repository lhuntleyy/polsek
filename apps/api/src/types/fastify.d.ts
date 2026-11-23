import type { AppConfig } from "@sigap/config";
import type { Role } from "@sigap/core";
import type Database from "better-sqlite3";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db/client.js";
import type { AuthUser } from "../lib/auth-types.js";
import type { EventBus } from "../lib/sse.js";
import type { GatewayState } from "../lib/gateway-state.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Db;
    sqlite: Database.Database;
    bus: EventBus;
    gateway: GatewayState;
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireInternal(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireRole(
      ...roles: Role[]
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user: AuthUser | null;
  }
}
