import { CheckCircle2, Clock3 } from "lucide-react";

interface PlaceholderProps {
  view: "map" | "data" | "handover" | "system";
  eyebrow: string;
  title: string;
  description: string;
  phase: string;
  items: string[];
}

export function Placeholder({ view, eyebrow, title, description, phase, items }: PlaceholderProps) {
  return (
    <section className="view is-active" data-view-panel={view} style={{ overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="page-actions">
          <span className="status-chip status-diterima">
            <Clock3 size={11} /> {phase}
          </span>
        </div>
      </div>

      <div className="panel config-card" style={{ maxWidth: 760 }}>
        <header className="card-head">
          <div>
            <div className="eyebrow">RENCANA</div>
            <h3>Yang sudah disiapkan</h3>
          </div>
        </header>
        <div className="config-list">
          {items.map((item) => (
            <div className="config-row" key={item}>
              <CheckCircle2 size={16} className="text-good" />
              <div>
                <b>{item}</b>
                <span>Akan diselesaikan pada fase yang ditentukan.</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
