import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Role } from "@sigap/core";

const MAX_GLOBAL_CLIENTS = 200;
const MAX_CLIENTS_PER_OFFICER = 5;

export interface SseClient {
  id: string;
  response: ServerResponse;
  officerId: string;
  sessionId: string;
  role: Role;
  regionId: string | null;
}

export class EventBus {
  private readonly clients = new Map<string, SseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isSessionValid: ((sessionId: string) => boolean) | undefined;

  add(input: Omit<SseClient, "id">): string {
    const sameOfficer: SseClient[] = [];
    for (const client of this.clients.values()) {
      if (client.officerId === input.officerId) sameOfficer.push(client);
    }
    while (sameOfficer.length >= MAX_CLIENTS_PER_OFFICER) {
      const oldest = sameOfficer.shift();
      if (oldest) this.closeClient(oldest.id);
    }
    while (this.clients.size >= MAX_GLOBAL_CLIENTS) {
      const oldestId = this.clients.keys().next().value;
      if (!oldestId) break;
      this.closeClient(oldestId);
    }

    const id = randomUUID();
    this.clients.set(id, { id, ...input });
    return id;
  }

  private closeClient(id: string): void {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    try {
      if (!client.response.writableEnded && !client.response.destroyed) {
        client.response.end();
      }
    } catch {
      // ignore closed socket errors
    }
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  disconnectSession(sessionId: string): void {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId) {
        this.closeClient(client.id);
      }
    }
  }

  disconnectOfficer(officerId: string): void {
    for (const client of this.clients.values()) {
      if (client.officerId === officerId) {
        this.closeClient(client.id);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const hasRegionScope =
      Boolean(data) && typeof data === "object" && "regionId" in (data as Record<string, unknown>);
    const eventRegionId = hasRegionScope
      ? ((data as { regionId?: string | null }).regionId ?? null)
      : null;

    for (const [id, client] of this.clients) {
      if (client.response.destroyed || client.response.writableEnded) {
        this.clients.delete(id);
        continue;
      }
      if (hasRegionScope && client.role === "bhabin") {
        if (!client.regionId || !eventRegionId || client.regionId !== eventRegionId) {
          continue;
        }
      }
      try {
        client.response.write(payload);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  startHeartbeat(intervalMs = 15_000, isSessionValid?: (sessionId: string) => boolean): void {
    if (isSessionValid) this.isSessionValid = isSessionValid;
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (client.response.destroyed || client.response.writableEnded) {
          this.clients.delete(id);
          continue;
        }
        if (this.isSessionValid) {
          try {
            if (!this.isSessionValid(client.sessionId)) {
              this.closeClient(id);
              continue;
            }
          } catch {
            // Keep connection alive on transient DB error
          }
        }
        try {
          client.response.write(`: ping ${Date.now()}\n\n`);
        } catch {
          this.clients.delete(id);
        }
      }
    }, intervalMs);
    this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
