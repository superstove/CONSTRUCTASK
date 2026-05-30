import { useEffect, useState } from "react";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { api } from "../api/client.js";
import StatusBadge from "../components/StatusBadge.jsx";

function expiryTone(days) {
  if (days < 7) return "danger";
  if (days <= 30) return "warning";
  return "safe";
}

function expiryText(days) {
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} days`;
}

export default function Compliance({ projectId }) {
  const [certificates, setCertificates] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setCertificates([]);
    setError("");
    api.compliance(projectId).then(setCertificates).catch((err) => setError(err.message));
  }, [projectId]);

  if (error) {
    return <div className="empty-state">Backend not reachable: {error}</div>;
  }

  return (
    <section className="compliance-grid">
      {certificates.map((certificate) => (
        <article className={`certificate-card ${expiryTone(certificate.days_until_expiry)}`} key={certificate.id}>
          <div className="card-icon">
            {certificate.days_until_expiry < 7 ? <ShieldAlert size={22} /> : <CalendarClock size={22} />}
          </div>
          <div>
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">{certificate.material_name}</p>
                <h2>{certificate.certificate_name}</h2>
              </div>
              <StatusBadge status={certificate.status} />
            </div>
            <p>{certificate.issuing_body}</p>
            <strong className="expiry-text">{expiryText(certificate.days_until_expiry)}</strong>
          </div>
        </article>
      ))}
      {certificates.length === 0 ? <div className="empty-state">Loading compliance certificates...</div> : null}
    </section>
  );
}
