const JAKARTA = "Asia/Jakarta";

const TZ_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT"
};

/** Label zona waktu Indonesia (WIB/WITA/WIT), atau nama IANA untuk zona lain. */
export function timeZoneLabel(timeZone = JAKARTA): string {
  return TZ_LABELS[timeZone] ?? timeZone;
}

/** "HH:MM WIB" sesuai zona waktu unit. */
export function formatLocalTime(value: Date | string | number, timeZone = JAKARTA): string {
  return `${formatWibTime(value, { timeZone })} ${timeZoneLabel(timeZone)}`;
}

export function formatWibTime(
  value: Date | string | number,
  options: { seconds?: boolean; timeZone?: string } = {}
): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: options.timeZone ?? JAKARTA,
    hour: "2-digit",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
    hour12: false
  }).format(date);
}

export function formatWibDate(
  value: Date | string | number,
  options: { withWeekday?: boolean; timeZone?: string } = {}
): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: options.timeZone ?? JAKARTA,
    weekday: options.withWeekday ? "short" : undefined,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function timeAgo(value: Date | string | number, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(value).getTime());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 20) return "baru saja";
  if (seconds < 60) return `${seconds} dtk lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hr lalu`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const total = Math.round(totalSeconds);
  if (total < 60) return `${total} dtk`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}j ${rest}m` : `${hours}j`;
}
