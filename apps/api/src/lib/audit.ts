import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

export interface AuditInput {
  unitId: string;
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export function writeAudit(db: Db, input: AuditInput): void {
  db.insert(auditLogs)
    .values({
      id: randomUUID(),
      unitId: input.unitId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      metaJson: input.meta === undefined ? null : JSON.stringify(input.meta),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date().toISOString()
    })
    .run();
}
