import { AlertTriangle, ArrowRight, FileWarning, PackageCheck, ShieldAlert, Truck, X } from "lucide-react";

const CATEGORY_META = {
  certificates: { label: "Certificates", icon: ShieldAlert, page: "compliance" },
  deliveries: { label: "Deliveries", icon: Truck, page: "materials" },
  approvals: { label: "Approvals", icon: FileWarning, page: "approvals" }
};

export default function EvidenceDrawer({ evidence, activeCategory, loading, error, onCategoryChange, onClose, onAsk, onOpenPage }) {
  const records = evidence?.[activeCategory] || [];
  const activeMeta = CATEGORY_META[activeCategory] || CATEGORY_META.certificates;

  return (
    <div className="evidence-drawer-layer" role="presentation" onClick={onClose}>
      <aside className="evidence-drawer" aria-label="Evidence detail drawer" onClick={(event) => event.stopPropagation()}>
        <div className="evidence-drawer-head">
          <div>
            <p className="eyebrow">Evidence chain</p>
            <h2>{activeMeta.label}</h2>
          </div>
          <button className="icon-ghost-button" type="button" onClick={onClose} aria-label="Close evidence drawer">
            <X size={18} />
          </button>
        </div>

        {evidence ? (
          <div className="evidence-summary-card">
            <div>
              <span>Open items</span>
              <strong>{evidence.summary.open_items}</strong>
            </div>
            <p>{evidence.summary.recommendation}</p>
          </div>
        ) : null}

        <div className="evidence-tabs" aria-label="Evidence categories">
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const count = evidence?.[key]?.length || 0;
            return (
              <button
                className={key === activeCategory ? "active" : ""}
                key={key}
                type="button"
                onClick={() => onCategoryChange(key)}
              >
                <Icon size={15} />
                {meta.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? <div className="empty-state compact">Loading evidence chain...</div> : null}
        {error ? <div className="empty-state compact">{error}</div> : null}

        {!loading && !error ? (
          <div className="evidence-record-list">
            {records.length === 0 ? (
              <div className="evidence-clear-card">
                <PackageCheck size={20} />
                <strong>No open {activeMeta.label.toLowerCase()} issues</strong>
                <span>This area is clear for the selected project.</span>
              </div>
            ) : (
              records.map((record) => (
                <article className={`evidence-record ${record.tone}`} key={`${record.category}-${record.id}`}>
                  <div className="record-topline">
                    <span>{record.status}</span>
                    <strong>{record.title}</strong>
                  </div>
                  <p>{record.material_name}</p>
                  <div className="record-detail">
                    <AlertTriangle size={15} />
                    {record.detail}
                  </div>
                  <div className="record-action">{record.action}</div>
                  <button
                    className="mini-action-button ghost"
                    type="button"
                    onClick={() => onAsk(`What should we do about ${record.title} for ${record.material_name}?`)}
                  >
                    Ask AI about this
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))
            )}
          </div>
        ) : null}

        <button className="primary-button drawer-page-button" type="button" onClick={() => onOpenPage(activeMeta.page)}>
          Open {activeMeta.label.toLowerCase()} page
        </button>
      </aside>
    </div>
  );
}
