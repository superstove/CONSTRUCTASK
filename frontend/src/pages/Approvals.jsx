import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { api } from "../api/client.js";
import StatusBadge from "../components/StatusBadge.jsx";

function approvalTone(approval) {
  if (approval.status === "pending" && approval.overdue_days > 0) return "approval-overdue";
  if (approval.status === "approved") return "approval-clear";
  return "approval-watch";
}

function blockerText(approval) {
  if (approval.status === "approved") return "Released";
  if (approval.overdue_days > 0) return `${approval.overdue_days} days overdue`;
  return "Awaiting response";
}

export default function Approvals({ projectId }) {
  const [approvals, setApprovals] = useState([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api.approvals(projectId).then(setApprovals).catch((err) => setError(err.message));
  }, [projectId]);

  const visibleApprovals = approvals.filter((approval) => filter === "all" || approval.status === filter);
  const overdueCount = approvals.filter((approval) => approval.status === "pending" && approval.overdue_days > 0).length;

  if (error) {
    return <div className="empty-state">Backend not reachable: {error}</div>;
  }

  return (
    <section className="page-grid">
      <article className="hero-panel approvals-hero">
        <div>
          <p className="eyebrow">Approval control</p>
          <h2>{overdueCount > 0 ? `${overdueCount} Overdue Gates` : "All Gates Approved"}</h2>
          <p>
            Track ownership, material impact, aging days, and release status before site execution.
          </p>
        </div>
        <div className="risk-card">
          <span>Highest blocker</span>
          <strong>{overdueCount > 0 ? "High" : "Low"}</strong>
          <StatusBadge status={overdueCount > 0 ? "high" : "low"} />
        </div>
      </article>

      <article className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Approval register</p>
            <h2>Approval Register</h2>
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter approvals">
            <option value="all">All approvals</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="approvals-table" role="table">
          <div className="approval-row approval-head" role="row">
            <span>Approval</span>
            <span>Material</span>
            <span>Approver</span>
            <span>Status</span>
            <span>Blocker</span>
          </div>
          {visibleApprovals.map((approval) => (
            <div className={`approval-row ${approvalTone(approval)}`} role="row" key={approval.id}>
              <span>
                <strong>{approval.approval_type}</strong>
                <small>Requested {approval.requested_date}</small>
              </span>
              <span>{approval.material_name}</span>
              <span>{approval.approver}</span>
              <StatusBadge status={approval.status} />
              <span className="blocker-cell">
                {approval.status === "approved" ? <CheckCircle2 size={17} /> : approval.overdue_days > 0 ? <AlertTriangle size={17} /> : <Clock3 size={17} />}
                {blockerText(approval)}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
