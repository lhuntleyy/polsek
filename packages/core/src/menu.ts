import { ROLES, type Role } from "./types.js";

/** Menu navigasi dashboard (urutan = urutan tampil). */
export const MENU_IDS = ["live", "reports", "map", "analytics", "data", "handover", "system", "guide"] as const;
export type MenuId = (typeof MENU_IDS)[number];

export const MENU_LABELS: Record<MenuId, string> = {
  live: "Live",
  reports: "Laporan",
  map: "Peta",
  analytics: "Analitik",
  data: "Data",
  handover: "Serah Terima",
  system: "Sistem",
  guide: "Panduan"
};

/** Menu yang memang dibatasi role (RBAC bawaan), terlepas dari pengaturan admin. */
export const MENU_ROLE_LIMITS: Partial<Record<MenuId, readonly Role[]>> = {
  data: ["admin", "pawas"],
  handover: ["admin", "kapolsek", "pawas", "piket", "urc"]
};

export type MenuHidden = Partial<Record<Role, MenuId[]>>;

/**
 * Rapikan pengaturan menu tersembunyi dari database/input:
 * buang role/menu tak dikenal, hapus duplikat, dan jangan pernah
 * menyembunyikan Sistem dari admin (supaya admin tidak terkunci keluar).
 */
export function sanitizeMenuHidden(input: unknown): MenuHidden {
  const result: MenuHidden = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const role of ROLES) {
    const value = (input as Record<string, unknown>)[role];
    if (!Array.isArray(value)) continue;
    const menus = MENU_IDS.filter(
      (menu) => value.includes(menu) && !(role === "admin" && menu === "system")
    );
    if (menus.length) result[role] = menus;
  }
  return result;
}

/** Menu yang boleh dilihat role ini: lolos RBAC bawaan dan tidak disembunyikan admin. */
export function visibleMenusFor(role: Role, hidden: MenuHidden): MenuId[] {
  const hiddenSet = new Set(hidden[role] ?? []);
  return MENU_IDS.filter((menu) => {
    const limit = MENU_ROLE_LIMITS[menu];
    if (limit && !limit.includes(role)) return false;
    return !hiddenSet.has(menu);
  });
}
