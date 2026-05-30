const labels = {
  verified: "Verified",
  pending: "Pending",
  failed: "Failed",
  approved: "Approved",
  rejected: "Rejected",
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  delayed: "Delayed",
  on_time: "On time",
  high: "High",
  medium: "Medium",
  low: "Low"
};

export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
