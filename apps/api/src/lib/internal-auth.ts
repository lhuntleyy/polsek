import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

function tokenFromHeader(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) return header[0] ?? null;
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return header;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function registerInternalAuth(app: FastifyInstance): void {
  app.decorate("requireInternal", async function (request, reply) {
    const token =
      tokenFromHeader(request.headers["x-sigap-internal-token"]) ??
      tokenFromHeader(request.headers.authorization);
    if (!token || !safeEqual(token, app.config.SIGAP_INTERNAL_TOKEN)) {
      reply.code(401).send({
        error: { code: "internal_unauthorized", message: "Token internal tidak valid" }
      });
    }
  });
}
