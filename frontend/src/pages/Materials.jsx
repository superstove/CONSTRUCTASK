import { useEffect, useState } from "react";
import { History, QrCode, ShieldCheck } from "lucide-react";
import { api } from "../api/client.js";
import StatusBadge from "../components/StatusBadge.jsx";
import SkeletonCards from "../components/SkeletonCards.jsx";

export default function Materials({ projectId }) {
  const [materials, setMaterials] = useState([]);
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);
  const [scans, setScans] = useState([]);
  const [evidenceCards, setEvidenceCards] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(null);
    setScans([]);
    setEvidenceCards([]);
    setScanLoading(false);
    setLoading(true);
    setError("");
    Promise.all([api.materials(projectId, status), api.materialEvidence(projectId)])
      .then(([items, evidence]) => {
        setMaterials(items);
        setEvidenceCards(evidence);
        if (items.length > 0) {
          selectMaterial(items[0]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId, status]);

  async function selectMaterial(material) {
    setSelected(material);
    setScans([]);
    setScanLoading(true);
    try {
      setScans(await api.materialScans(material.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setScanLoading(false);
    }
  }

  return (
    <section className="split-layout">
      <article className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Material records</p>
            <h2>Material Registry</h2>
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter material status">
            <option value="all">All status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {error ? <div className="empty-state">Backend not reachable: {error}</div> : null}

        {loading ? <SkeletonCards type="stat" count={4} /> : null}

        {!loading ? <div className="material-evidence-grid">
          {evidenceCards.map((card) => (
            <button
              className={`material-evidence-card ${card.release_status.toLowerCase()}`}
              type="button"
              key={card.material_id}
              onClick={() => {
                const material = materials.find((item) => item.id === card.material_id);
                if (material) selectMaterial(material);
              }}
            >
              <span className="evidence-card-icon"><ShieldCheck size={17} /></span>
              <strong>{card.material_name}</strong>
              <small>{card.batch_number} - {card.qr_code}</small>
              <div>
                <span>{card.release_status}</span>
                <span>{card.certificate_status}</span>
                <span>{card.approval_status}</span>
                <span>{card.delivery_status}</span>
              </div>
            </button>
          ))}
        </div> : null}

        {loading ? <SkeletonCards type="row" count={5} /> : <div className="material-table" role="table">
          <div className="table-row table-head" role="row">
            <span>Material</span>
            <span>Supplier</span>
            <span>Batch</span>
            <span>Status</span>
          </div>
          {materials.map((material) => (
            <button
              className={`table-row material-row ${selected?.id === material.id ? "selected" : ""}`}
              role="row"
              type="button"
              key={material.id}
              aria-pressed={selected?.id === material.id}
              onClick={() => selectMaterial(material)}
            >
              <span>
                <strong>{material.name}</strong>
                <small>{material.quantity} {material.unit}</small>
              </span>
              <span>{material.supplier}</span>
              <span>{material.batch_number}</span>
              <StatusBadge status={material.status} />
            </button>
          ))}
        </div>}
      </article>

      <article className="panel scan-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">QR scan history</p>
            <h2>{selected ? selected.name : "Select a material"}</h2>
          </div>
          <QrCode size={22} />
        </div>
        {selected ? (
          <div className="scan-list">
            <div className="scan-summary-card">
              <span>Selected batch</span>
              <strong>{selected.batch_number}</strong>
              <small>{selected.qr_code}</small>
            </div>
            {scanLoading ? <SkeletonCards type="row" count={2} /> : null}
            {scans.map((scan) => (
              <div className="scan-row" key={scan.id}>
                <History size={18} />
                <div>
                  <strong>{scan.location}</strong>
                  <span>{scan.scan_type} by {scan.scanned_by}</span>
                  <small>{new Date(scan.scan_time).toLocaleString()} - {scan.result}</small>
                </div>
              </div>
            ))}
            {!scanLoading && scans.length === 0 ? <div className="empty-state">No scans found for this material.</div> : null}
          </div>
        ) : (
          <div className="empty-state">Click any material row to inspect its QR scan trail.</div>
        )}
      </article>
    </section>
  );
}
