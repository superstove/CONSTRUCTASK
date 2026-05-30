import { useEffect, useState } from "react";
import { AlertTriangle, History, QrCode } from "lucide-react";
import { api } from "../api/client.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function ScanLog({ projectId }) {
  const [scans, setScans] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setWarnings([]);
    Promise.all([api.allScans(projectId), api.scanWarnings(projectId)])
      .then(([scanData, warningData]) => {
        setScans(scanData);
        setWarnings(warningData);
      })
      .catch((err) => setError(err.message));
  }, [projectId]);

  return (
    <section className="page-grid">
      <article className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Site scan log</p>
            <h2>QR Audit Trail</h2>
            <p className="panel-copy">Comprehensive log of release checks, inspections, and scan history.</p>
          </div>
          <History size={24} />
        </div>

        {error ? <div className="empty-state">Could not load scan log: {error}</div> : null}

        {warnings.length > 0 ? (
          <div className="scan-warning-grid">
            {warnings.map((warning) => (
              <article className={`scan-warning-card ${warning.severity.toLowerCase()}`} key={`${warning.warning_type}-${warning.material_id}`}>
                <AlertTriangle size={18} />
                <div>
                  <strong>{warning.warning_type}</strong>
                  <span>{warning.detail}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="scan-log-table">
          <div className="scan-log-row scan-log-head">
            <span>Material</span>
            <span>Scanned by</span>
            <span>Location</span>
            <span>Type</span>
            <span>Result</span>
            <span>Time</span>
          </div>
          {scans.map((scan) => (
            <div className="scan-log-row" key={scan.id}>
              <span>
                <strong>{scan.material_name}</strong>
                <small>Material #{scan.material_id}</small>
              </span>
              <span>{scan.scanned_by}</span>
              <span>{scan.location}</span>
              <span>
                <QrCode size={15} />
                {scan.scan_type.replaceAll("_", " ")}
              </span>
              <StatusBadge status={scan.result.includes("blocked") ? "failed" : scan.result.includes("hold") ? "pending" : "verified"} />
              <span>{new Date(scan.scan_time).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {scans.length === 0 && !error ? <div className="empty-state">No QR scans have been recorded for this project yet.</div> : null}
      </article>
    </section>
  );
}
