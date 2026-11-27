import { EyeOff } from "lucide-react";
import type { MenuId, Role, UnitSettings } from "../lib/types";
import { MENU_ITEMS, visibleViews } from "./Shell";

const ROLE_ROWS: Array<{ role: Role; label: string }> = [
  { role: "piket", label: "Piket SPKT" },
  { role: "urc", label: "URC / Patroli" },
  { role: "bhabin", label: "Bhabinkamtibmas" },
  { role: "pawas", label: "Pawas" },
  { role: "kapolsek", label: "Kapolsek" },
  { role: "admin", label: "Admin" }
];

const SHORT_LABEL: Record<MenuId, string> = {
  live: "Live",
  reports: "Laporan",
  map: "Peta",
  analytics: "Analitik",
  data: "Data",
  handover: "Serah",
  system: "Sistem",
  guide: "Panduan"
};

type MenuHidden = UnitSettings["menuHidden"];

/** Masalah pada pengaturan menu, atau null bila valid. Sama dengan validasi API. */
export function menuHiddenProblem(hidden: MenuHidden): string | null {
  if (hidden.admin?.includes("system")) return "Menu Sistem tidak boleh disembunyikan dari Admin.";
  const empty = ROLE_ROWS.find(({ role }) => visibleViews(role, hidden[role] ?? []).length === 0);
  return empty ? `${empty.label} harus punya minimal satu menu yang tampil.` : null;
}

interface MenuVisibilityCardProps {
  value: MenuHidden;
  onChange: (next: MenuHidden) => void;
}

export function MenuVisibilityCard({ value, onChange }: MenuVisibilityCardProps) {
  function toggle(role: Role, menu: MenuId, visible: boolean) {
    const current = new Set(value[role] ?? []);
    if (visible) current.delete(menu);
    else current.add(menu);
    const next: MenuHidden = { ...value };
    const ordered = MENU_ITEMS.map((item) => item.id).filter((id) => current.has(id));
    if (ordered.length) next[role] = ordered;
    else delete next[role];
    onChange(next);
  }

  const problem = menuHiddenProblem(value);

  return (
    <section className="panel settings-card span-2">
      <header className="card-head">
        <div>
          <div className="eyebrow">AKSES MENU</div>
          <h3>Visibilitas menu per jenis user</h3>
        </div>
        <EyeOff size={18} className="muted" />
      </header>
      <p className="field-hint menu-visibility-hint">
        Hilangkan centang untuk menyembunyikan menu dari jenis user tersebut. Berlaku setelah
        <b> Simpan Pengaturan</b>. "—" berarti menu memang tidak tersedia untuk role itu. Ini hanya
        merapikan tampilan; hak akses data tetap diatur oleh role.
      </p>
      <div className="menu-visibility-wrap">
        <table className="menu-visibility">
          <thead>
            <tr>
              <th scope="col">Jenis user</th>
              {MENU_ITEMS.map((item) => (
                <th scope="col" key={item.id} title={item.title}>
                  {SHORT_LABEL[item.id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_ROWS.map(({ role, label }) => (
              <tr key={role}>
                <th scope="row">{label}</th>
                {MENU_ITEMS.map((item) => {
                  const available = !item.roles || item.roles.includes(role);
                  if (!available) {
                    return (
                      <td key={item.id} className="is-na" title="Tidak tersedia untuk role ini">
                        —
                      </td>
                    );
                  }
                  const locked = role === "admin" && item.id === "system";
                  const visible = !(value[role] ?? []).includes(item.id);
                  return (
                    <td key={item.id}>
                      <input
                        type="checkbox"
                        checked={visible}
                        disabled={locked}
                        onChange={(event) => toggle(role, item.id, event.target.checked)}
                        aria-label={`${SHORT_LABEL[item.id]} untuk ${label}`}
                        title={locked ? "Sistem selalu tampil untuk Admin" : undefined}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem ? <div className="login-error menu-visibility-error">{problem}</div> : null}
    </section>
  );
}
