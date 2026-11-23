import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  createdAt: text("created_at").notNull()
});

export const settings = sqliteTable(
  "settings",
  {
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [primaryKey({ columns: [table.unitId, table.key] })]
);

export const regions = sqliteTable(
  "regions",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    level: text("level").notNull().default("kelurahan"),
    parentId: text("parent_id"),
    geojson: text("geojson").notNull(),
    centroidLat: real("centroid_lat"),
    centroidLng: real("centroid_lng"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_regions_unit").on(table.unitId, table.active)]
);

export const officers = sqliteTable(
  "officers",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    username: text("username").unique(),
    passwordHash: text("password_hash"),
    totpSecret: text("totp_secret"),
    totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
    totpLastStep: integer("totp_last_step"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: text("locked_until"),
    name: text("name").notNull(),
    rank: text("rank"),
    role: text("role").notNull(),
    phone: text("phone"),
    waJid: text("wa_jid"),
    regionId: text("region_id").references(() => regions.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [index("idx_officers_role").on(table.unitId, table.role, table.active)]
);

export const reporters = sqliteTable(
  "reporters",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    phoneHash: text("phone_hash").notNull().unique(),
    phoneEnc: text("phone_enc").notNull(),
    waJid: text("wa_jid"),
    name: text("name").notNull(),
    consentVersion: text("consent_version"),
    consentAt: text("consent_at"),
    reportCount: integer("report_count").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    falseCount: integer("false_count").notNull().default(0),
    blockedAt: text("blocked_at"),
    blockedReason: text("blocked_reason"),
    phoneVerified: integer("phone_verified", { mode: "boolean" }).notNull().default(true),
    lastNoticeAt: text("last_notice_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    index("idx_reporters_phone").on(table.phoneHash),
    index("idx_reporters_wa_jid").on(table.waJid)
  ]
);

export const ticketCounters = sqliteTable(
  "ticket_counters",
  {
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    dateCode: text("date_code").notNull(),
    lastSeq: integer("last_seq").notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.unitId, table.dateCode] })]
);

export const clusters = sqliteTable("clusters", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  regionId: text("region_id").references(() => regions.id),
  category: text("category").notNull(),
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  windowStart: text("window_start").notNull(),
  windowEnd: text("window_end").notNull(),
  ticketCount: integer("ticket_count").notNull().default(1),
  createdAt: text("created_at").notNull()
});

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    ticketNo: text("ticket_no").notNull(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => reporters.id),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    accuracyM: real("accuracy_m"),
    regionId: text("region_id").references(() => regions.id),
    locationStatus: text("location_status"),
    source: text("source").notNull(),
    clusterId: text("cluster_id").references(() => clusters.id),
    assignedTo: text("assigned_to").references(() => officers.id),
    acknowledgedBy: text("acknowledged_by").references(() => officers.id),
    ackAt: text("ack_at"),
    otwAt: text("otw_at"),
    arriveAt: text("arrive_at"),
    closedAt: text("closed_at"),
    closeNote: text("close_note"),
    rejectReason: text("reject_reason"),
    internalNote: text("internal_note"),
    escalatedPawasAt: text("escalated_pawas_at"),
    escalatedKapolsekAt: text("escalated_kapolsek_at"),
    duplicateOf: text("duplicate_of"),
    reopenedAt: text("reopened_at"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("uq_tickets_unit_no").on(table.unitId, table.ticketNo),
    index("idx_tickets_queue").on(table.unitId, table.status, table.priority, table.createdAt),
    index("idx_tickets_region").on(table.unitId, table.regionId, table.createdAt),
    index("idx_tickets_reporter").on(table.reporterId, table.createdAt)
  ]
);

export const ticketEvents = sqliteTable(
  "ticket_events",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_events_ticket").on(table.ticketId, table.createdAt)]
);

export const ticketMedia = sqliteTable(
  "ticket_media",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => reporters.id),
    waChatJid: text("wa_chat_jid"),
    kind: text("kind").notNull(),
    originalPath: text("original_path").notNull(),
    thumbPath: text("thumb_path"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationS: real("duration_s"),
    exifGps: text("exif_gps"),
    waMessageId: text("wa_message_id"),
    caption: text("caption"),
    status: text("status").notNull().default("ready"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_media_ticket").on(table.ticketId)]
);

export const waGroups = sqliteTable("wa_groups", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jid: text("jid").notNull().unique(),
  purpose: text("purpose").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull()
});

export const waGateway = sqliteTable("wa_gateway", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("disconnected"),
  qrDataUrl: text("qr_data_url"),
  qrExpiresAt: text("qr_expires_at"),
  phone: text("phone"),
  error: text("error"),
  pendingCommand: text("pending_command"),
  commandId: text("command_id"),
  commandRequestedAt: text("command_requested_at"),
  botSeenAt: text("bot_seen_at"),
  lastSeenAt: text("last_seen_at"),
  updatedAt: text("updated_at").notNull()
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  waJid: text("wa_jid").notNull().unique(),
  reporterId: text("reporter_id").references(() => reporters.id),
  state: text("state").notNull(),
  contextJson: text("context_json").notNull().default("{}"),
  expiresAt: text("expires_at"),
  updatedAt: text("updated_at").notNull()
});

export const messageLog = sqliteTable("message_log", {
  waMessageId: text("wa_message_id").primaryKey(),
  direction: text("direction").notNull(),
  waJid: text("wa_jid"),
  receivedAt: text("received_at").notNull()
});

export const outboundMessages = sqliteTable(
  "outbound_messages",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    targetJid: text("target_jid").notNull(),
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at")
  },
  (table) => [index("idx_outbox_status").on(table.status, table.nextAttemptAt)]
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    officerId: text("officer_id")
      .notNull()
      .references(() => officers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull()
  },
  (table) => [index("idx_push_officer").on(table.officerId)]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    metaJson: text("meta_json"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_audit_created").on(table.createdAt)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    officerId: text("officer_id")
      .notNull()
      .references(() => officers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull()
  },
  (table) => [index("idx_sessions_token").on(table.tokenHash)]
);

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id, { onDelete: "cascade" }),
  shift: text("shift").notNull(),
  officerId: text("officer_id").references(() => officers.id),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  notes: text("notes"),
  checklistJson: text("checklist_json"),
  signedByName: text("signed_by_name"),
  incomingName: text("incoming_name"),
  signedAt: text("signed_at")
});

export const schema = {
  units,
  settings,
  regions,
  officers,
  reporters,
  ticketCounters,
  clusters,
  tickets,
  ticketEvents,
  ticketMedia,
  waGroups,
  waGateway,
  conversations,
  messageLog,
  outboundMessages,
  pushSubscriptions,
  auditLogs,
  sessions,
  shifts
};
