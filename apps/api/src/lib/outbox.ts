import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";
import { outboundMessages } from "../db/schema.js";
import { DEFAULT_UNIT_ID } from "./constants.js";

export interface OutboxDraft {
  targetJid: string;
  kind?: "text" | "media" | "group_forward";
  payload: Record<string, unknown>;
}

export function enqueueOutbox(db: Db, draft: OutboxDraft): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(outboundMessages)
    .values({
      id,
      unitId: DEFAULT_UNIT_ID,
      targetJid: draft.targetJid,
      kind: draft.kind ?? "text",
      payloadJson: JSON.stringify(draft.payload),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      createdAt: now,
      sentAt: null
    })
    .run();
  return id;
}

export function enqueueMany(db: Db, drafts: OutboxDraft[]): void {
  for (const draft of drafts) enqueueOutbox(db, draft);
}
