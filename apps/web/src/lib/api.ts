import type {
  AnalyticsSummary,
  AuditEntry,
  DigestResult,
  DuplicateTicket,
  HandoverPayload,
  HandoverSummary,
  ManualTicketPayload,
  Priority,
  PublicConfig,
  Region,
  ReporterRecord,
  SystemStatus,
  Ticket,
  TicketDetail,
  TicketStatus,
  UnitSettings,
  User,
  WaGateway,
  WaGroup
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) {
        throw new ApiError(
          response.status,
          "bad_gateway",
          `Server mengembalikan respons tidak valid (${response.status})`
        );
      }
      throw new ApiError(response.status, "invalid_json", "Respons server bukan JSON valid");
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? `Permintaan gagal (${response.status})`
    );
  }

  return data as T;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: Priority;
  regionId?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

function queryString(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const api = {
  publicConfig: () => request<PublicConfig>("/api/public/config"),

  login: (username: string, password: string, totp?: string) =>
    request<{ user: User; unit: PublicConfig["unit"]; expiresAt: string }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password, totp: totp || undefined })
      }
    ),

  me: () => request<{ user: User }>("/api/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    }),

  resetOfficerPassword: (id: string, newPassword: string) =>
    request<{ ok: boolean }>(`/api/officers/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword })
    }),

  resetOfficerTotp: (id: string) =>
    request<{ ok: boolean }>(`/api/officers/${encodeURIComponent(id)}/reset-totp`, {
      method: "POST",
      body: JSON.stringify({})
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  tickets: (filters: TicketFilters = {}) =>
    request<{ items: Ticket[]; nextCursor: string | null }>(
      `/api/tickets${queryString({
        status: filters.status,
        priority: filters.priority,
        regionId: filters.regionId,
        q: filters.q,
        limit: filters.limit ?? 50,
        cursor: filters.cursor
      })}`
    ),

  ticket: (id: string) => request<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),

  transition: (
    id: string,
    to: TicketStatus,
    options: { note?: string; reason?: string; assigneeId?: string } = {}
  ) =>
    request<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      body: JSON.stringify({
        to,
        note: options.note || undefined,
        reason: options.reason || undefined,
        assigneeId: options.assigneeId || undefined
      })
    }),

  note: (id: string, text: string) =>
    request<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ text })
    }),

  manualTicket: (payload: ManualTicketPayload) =>
    request<TicketDetail>("/api/tickets/manual", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  revealPhone: (id: string) =>
    request<{ phone: string }>(`/api/tickets/${encodeURIComponent(id)}/reveal-phone`, {
      method: "POST"
    }),

  duplicates: (id: string) =>
    request<{ items: DuplicateTicket[] }>(
      `/api/tickets/${encodeURIComponent(id)}/duplicates`
    ),

  mergeTicket: (id: string, sourceIds: string[], note?: string) =>
    request<TicketDetail & { merged: number }>(
      `/api/tickets/${encodeURIComponent(id)}/merge`,
      {
        method: "POST",
        body: JSON.stringify({ sourceIds, note })
      }
    ),

  handover: () => request<HandoverSummary>("/api/handover"),

  submitHandover: (payload: HandoverPayload) =>
    request<{ ok: boolean; id: string; summary: HandoverSummary }>("/api/handover", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  audit: (limit = 100) =>
    request<{ items: AuditEntry[] }>(`/api/audit?limit=${limit}`),

  triggerDigest: () =>
    request<DigestResult>("/api/system/digest", { method: "POST" }),

  pushPublicKey: () =>
    request<{ publicKey: string | null; configured: boolean }>("/api/push/public-key"),

  subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription)
    }),

  unsubscribePush: (endpoint: string) =>
    request<{ ok: boolean }>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint })
    }),

  testPush: () =>
    request<{ ok: boolean; sent: number; removed: number; failed: number }>("/api/push/test", {
      method: "POST"
    }),

  groups: () => request<{ items: WaGroup[] }>("/api/wa-groups"),

  createGroup: (payload: { name: string; jid: string; purpose: string; active: boolean }) =>
    request<{ id: string }>("/api/wa-groups", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateGroup: (id: string, patch: { name?: string; active?: boolean }) =>
    request<{ ok: boolean }>(`/api/wa-groups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),

  reporters: (q = "", limit = 100) =>
    request<{ items: ReporterRecord[] }>(
      `/api/reporters?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`
    ),

  blockReporter: (id: string, reason: string) =>
    request<{ ok: boolean }>(`/api/reporters/${encodeURIComponent(id)}/block`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),

  unblockReporter: (id: string) =>
    request<{ ok: boolean }>(`/api/reporters/${encodeURIComponent(id)}/unblock`, {
      method: "POST"
    }),

  createOfficer: (payload: {
    username: string;
    name: string;
    role: string;
    password: string;
    rank?: string;
    regionId?: string | null;
    waJid?: string;
  }) =>
    request<{ id: string }>("/api/officers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  totpSetup: () =>
    request<{ secret: string; uri: string }>("/api/auth/totp/setup", {
      method: "POST"
    }),

  totpEnable: (code: string) =>
    request<{ ok: boolean }>("/api/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ code })
    }),

  analytics: () => request<AnalyticsSummary>("/api/analytics/summary"),

  settings: () => request<{ settings: UnitSettings }>("/api/settings"),

  updateSettings: (patch: Record<string, unknown>) =>
    request<{ settings: UnitSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),

  systemStatus: () => request<SystemStatus>("/api/system/status"),

  gateway: () => request<{ gateway: WaGateway }>("/api/system/gateway"),

  gatewayConnect: () =>
    request<{ ok: boolean; gateway: WaGateway }>("/api/system/gateway/connect", {
      method: "POST"
    }),

  gatewayDisconnect: () =>
    request<{ ok: boolean; gateway: WaGateway }>("/api/system/gateway/disconnect", {
      method: "POST"
    }),

  gatewayLogout: () =>
    request<{ ok: boolean; gateway: WaGateway }>("/api/system/gateway/logout", {
      method: "POST"
    }),

  gatewayRestart: () =>
    request<{ ok: boolean; gateway: WaGateway }>("/api/system/gateway/restart", {
      method: "POST"
    }),

  regions: () => request<{ items: Region[] }>("/api/regions"),

  createRegion: (payload: { name: string; geojson: unknown }) =>
    request<{ id: string }>("/api/regions", {
      method: "POST",
      body: JSON.stringify({ ...payload, active: true, isDemo: false })
    }),

  updateRegion: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: boolean; version: number }>(`/api/regions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),

  deleteRegion: (id: string) =>
    request<{ ok: boolean; mode: "deleted" | "deactivated"; tickets?: number; officers?: number }>(
      `/api/regions/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    ),

  officers: () =>
    request<{ items: Array<{
      id: string;
      name: string;
      rank: string | null;
      role: string;
      regionId: string | null;
      waJid: string | null;
      active: boolean;
    }> }>("/api/officers"),

  updateOfficer: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/officers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),

  deleteOfficer: (id: string) =>
    request<{ ok: boolean; mode: "deleted" | "deactivated" }>(
      `/api/officers/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    )
};
