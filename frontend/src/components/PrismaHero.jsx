import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  FileWarning,
  PackageCheck,
  QrCode,
  ShieldAlert,
  Truck,
  Zap
} from "lucide-react";
import { AnimatedNumber } from "./PremiumEffects.jsx";

const HERO_VIDEO_RATE = 0.45;

function getEvidenceItems(dashboard, actionQueue = []) {
  if (!dashboard) return [];

  if (actionQueue.length > 0) {
    const countByCategory = (category) => actionQueue.filter((item) => item.category === category).length;
    const materialCount = countByCategory("Material");
    return [
      {
        label: "Certificates",
        count: countByCategory("Certificate"),
        detail: countByCategory("Certificate") > 0 ? "Need review" : "All valid",
        icon: ShieldAlert,
        tone: countByCategory("Certificate") > 0 ? "warning" : "ok"
      },
      {
        label: "Deliveries",
        count: countByCategory("Delivery"),
        detail: countByCategory("Delivery") > 0 ? "Running late" : "On track",
        icon: Truck,
        tone: countByCategory("Delivery") > 0 ? "danger" : "ok"
      },
      {
        label: "Approvals",
        count: countByCategory("Approval"),
        detail: countByCategory("Approval") > 0 ? "Waiting" : "No delay",
        icon: FileWarning,
        tone: countByCategory("Approval") > 0 ? "warning" : "ok"
      },
      {
        label: "Materials",
        count: materialCount,
        detail: materialCount > 0 ? "Verify batch" : "Ready",
        icon: PackageCheck,
        tone: materialCount > 0 ? "warning" : "ok"
      },
      {
        label: "QR Scans",
        count: countByCategory("QR Scan"),
        detail: countByCategory("QR Scan") > 0 ? "Review trail" : "Clear",
        icon: QrCode,
        tone: countByCategory("QR Scan") > 0 ? "warning" : "ok"
      }
    ];
  }

  return [
    {
      label: "Certificates",
      count: dashboard.expiring_certs,
      detail: dashboard.expiring_certs > 0 ? "Need review" : "All valid",
      icon: ShieldAlert,
      tone: dashboard.expiring_certs > 0 ? "warning" : "ok"
    },
    {
      label: "Deliveries",
      count: dashboard.delayed_deliveries,
      detail: dashboard.delayed_deliveries > 0 ? "Running late" : "On track",
      icon: Truck,
      tone: dashboard.delayed_deliveries > 0 ? "danger" : "ok"
    },
    {
      label: "Approvals",
      count: dashboard.pending_approvals,
      detail: dashboard.pending_approvals > 0 ? "Waiting" : "No delay",
      icon: FileWarning,
      tone: dashboard.pending_approvals > 0 ? "warning" : "ok"
    }
  ];
}

export const PrismaHero = ({ dashboard, actionQueue = [], onNavigate, projectName }) => {
  const evidenceItems = getEvidenceItems(dashboard, actionQueue);
  const openBlockers =
    actionQueue.length ||
    (dashboard?.pending_approvals || 0) +
      (dashboard?.expiring_certs || 0) +
      (dashboard?.delayed_deliveries || 0);
  const heroSummary = [
    { label: "Records checked", value: dashboard?.total_materials || 0, detail: "materials" },
    { label: "Priority actions", value: openBlockers, detail: "today" },
    { label: "Project risk", value: dashboard?.project?.risk_score || "Medium", detail: "current" }
  ];

  return (
    <section className="prisma-hero">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="prisma-hero-video"
        src="/assets/constructask-site-weather-clean.webm"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = HERO_VIDEO_RATE;
        }}
      />
      <div className="prisma-hero-gradient" />

      <motion.div
        className="prisma-hero-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="hero-system-rail" aria-hidden="true">
          <span>GS1 QR</span>
          <span>Evidence Lock</span>
          <span>Site Release AI</span>
        </div>
        <div className="hero-main">
          <div className="hero-badge-row">
            <p className="hero-kicker">{projectName || "Active project intelligence"}</p>
            <span className="hero-live-badge">
              <Activity size={14} />
              Data updated
            </span>
          </div>
          <h2 className="hero-title">
            <Zap className="hero-inline-icon" size={24} aria-hidden="true" />
            <span>Site risks today.</span>
          </h2>
          <p className="hero-copy">
            ConstructAsk turns materials, approvals, certificates, deliveries, and QR scans into one clear action view.
          </p>
          <div className="hero-actions-row">
            <button className="hero-button" type="button" onClick={() => onNavigate("chat")}>
              Ask a question
              <span className="hero-button-icon">
                <ArrowRight size={20} />
              </span>
            </button>
            <button className="hero-ghost-button" type="button" onClick={() => onNavigate("verify")}>
              <QrCode size={17} />
              Verify material
            </button>
          </div>

          <div className="hero-summary-strip" aria-label="Project summary">
            {heroSummary.map((metric) => (
              <div className="hero-summary-item" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{typeof metric.value === "number" ? <AnimatedNumber value={metric.value} /> : metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <aside className="hero-evidence-panel" aria-label="Live project evidence brief">
          <div className="evidence-panel-top">
            <span>Needs attention</span>
            <strong>{openBlockers} open</strong>
          </div>
          <p className="evidence-panel-note">Clear these before site work moves forward.</p>
          <div className="hero-evidence-list">
            {evidenceItems.map((item) => {
              const Icon = item.icon;
              return (
                <div className={`hero-evidence-item ${item.tone}`} key={item.label}>
                  <span className="evidence-icon">
                    <Icon size={17} />
                  </span>
                  <strong className="issue-count"><AnimatedNumber value={item.count} /></strong>
                  <div>
                    <span>{item.label}</span>
                    <small>{item.detail}</small>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hero-sync-row">
            <PackageCheck size={16} />
            <span>{openBlockers} priority actions from project evidence</span>
          </div>
        </aside>
      </motion.div>
    </section>
  );
};
