import type { FastifyInstance } from "fastify";

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get("/api/stream", { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      reply.code(401).send({ error: { code: "unauthorized", message: "Sesi tidak valid" } });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(
      `event: hello\ndata: ${JSON.stringify({ officerId: user.id, at: new Date().toISOString() })}\n\n`
    );

    const clientId = app.bus.add({
      response: reply.raw,
      officerId: user.id,
      sessionId: user.sessionId,
      role: user.role,
      regionId: user.regionId
    });
    const cleanup = () => app.bus.remove(clientId);
    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });
}
