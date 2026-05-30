import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Clock,
  Download,
  FileWarning,
  Gauge,
  GitBranch,
  MessageSquareText,
  PackageCheck,
  RadioTower,
  ScrollText,
  ShieldCheck,
  Truck
} from "lucide-react";
import { api } from "../api/client.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { PrismaHero } from "../components/PrismaHero.jsx";
import EvidenceDrawer from "../components/EvidenceDrawer.jsx";
import SkeletonCards from "../components/SkeletonCards.jsx";
import { AnimatedNumber, ReadinessGauge, SeverityDot, StatusStamp } from "../components/PremiumEffects.jsx";
import { motion } from "framer-motion";

export default function Dashboard({ projectId, selectedProject, onNavigate }) {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [evidenceCategory, setEvidenceCategory] = useState(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [actionQueue, setActionQueue] = useState([]);
  const [expandedActionId, setExpandedActionId] = useState(null);

  useEffect(() => {
    setDashboard(null);
    setReadiness(null);
    setActionQueue([]);
    setError("");
    setEvidence(null);
    setEvidenceCategory(null);
    setEvidenceError("");
    Promise.all([api.dashboard(projectId), api.readiness(projectId), api.actionQueue(projectId)])
      .then(([dashboardData, readinessData, actionData]) => {
        setDashboard(dashboardData);
        setReadiness(readinessData);
        setActionQueue(actionData);
      })
      .catch((err) => setError(err.message));
  }, [projectId]);

  if (error) {
    return <div className="empty-state">Backend not reachable: {error}</div>;
  }

  if (!dashboard) {
    return (
      <section className="page-grid">
        <SkeletonCards type="panel" count={1} />
        <SkeletonCards type="stat" count={4} />
        <SkeletonCards type="row" count={5} />
      </section>
    );
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
  }

  const stats = [
    { label: "Material Evidence", value: dashboard.total_materials, detail: "records with QR trace", icon: PackageCheck, tone: "ok" },
    { label: "Approval Gates", value: dashboard.pending_approvals, detail: "pending release decisions", icon: Clock, tone: "warning" },
    { label: "Compliance Alerts", value: dashboard.expiring_certs, detail: "expired or expiring certs", icon: AlertTriangle, tone: "danger" },
    { label: "Delivery Pressure", value: dashboard.delayed_deliveries, detail: "delayed supply records", icon: Truck, tone: "warning" }
  ];
  const issueCount = actionQueue.length || dashboard.pending_approvals + dashboard.expiring_certs + dashboard.delayed_deliveries;
  const computedReadinessScore = Math.max(
    8,
    Math.min(96, 100 - issueCount * 5 - dashboard.pending_approvals * 3 - dashboard.expiring_certs * 3 - dashboard.delayed_deliveries * 3)
  );
  const readinessScore = readiness?.score ?? computedReadinessScore;
  const readinessLabel = readiness?.status ?? (readinessScore >= 75 ? "Ready to execute" : readinessScore >= 45 ? "Needs attention" : "At risk");
  const readinessMeaning =
    readinessScore === 0 && (readiness?.blockers || 0) > 0
      ? "0% means site release is blocked until the critical evidence is fixed."
      : readiness?.next_action || `${issueCount} active issue${issueCount === 1 ? "" : "s"} found across approvals, certificates, and deliveries.`;
  const actionPlan = [
    {
      title: "Fix certificate risk",
      detail:
        dashboard.expiring_certs > 0
          ? `${dashboard.expiring_certs} ${pluralize(dashboard.expiring_certs, "certificate item")} need review`
          : "Certificates are clear",
      priority: dashboard.expiring_certs > 0 ? "High" : "Clear",
      icon: FileWarning,
      page: "compliance",
      evidenceCategory: "certificates",
      question: "Which compliance certificates are expired or expiring, and what should we fix first?",
      tone: dashboard.expiring_certs > 0 ? "danger" : "ok"
    },
    {
      title: "Close overdue approvals",
      detail:
        dashboard.pending_approvals > 0
          ? `${dashboard.pending_approvals} ${pluralize(dashboard.pending_approvals, "approval gate")} still waiting`
          : "Approvals are clear",
      priority: dashboard.pending_approvals > 0 ? "High" : "Clear",
      icon: ClipboardCheck,
      page: "approvals",
      evidenceCategory: "approvals",
      question: "Which approvals are overdue and how do they affect execution?",
      tone: dashboard.pending_approvals > 0 ? "warning" : "ok"
    },
    {
      title: "Recover delayed delivery",
      detail: dashboard.delayed_deliveries > 0 ? `${dashboard.delayed_deliveries} delivery is late` : "Deliveries are on track",
      priority: dashboard.delayed_deliveries > 0 ? "Medium" : "Clear",
      icon: Truck,
      page: "materials",
      evidenceCategory: "deliveries",
      question: "Which deliveries are delayed and what project work could be affected?",
      tone: dashboard.delayed_deliveries > 0 ? "warning" : "ok"
    }
  ];

  function askAboutAction(question) {
    sessionStorage.setItem("constructask-quick-question", question);
    onNavigate("chat");
  }

  async function openEvidence(category) {
    setEvidenceCategory(category);
    setEvidenceError("");
    if (evidence) return;

    setEvidenceLoading(true);
    try {
      const response = await api.evidence(projectId);
      setEvidence(response);
    } catch (err) {
      setEvidenceError(`Could not load evidence: ${err.message}`);
    } finally {
      setEvidenceLoading(false);
    }
  }

  function getBriefText() {
    return [
      `${dashboard.project.name} - Manager Brief`,
      `Risk: ${dashboard.project.risk_score}`,
      "",
      ...dashboard.executive_brief.map((line, index) => `${index + 1}. ${line}`),
      "",
      `Evidence checked: ${dashboard.total_materials} material records, ${dashboard.pending_approvals} approvals, ${dashboard.expiring_certs} certificate alerts, ${dashboard.delayed_deliveries} delayed deliveries.`
    ].join("\n");
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(getBriefText());
  }

  function downloadBrief() {
    const project = dashboard.project;
    const dateStr = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const findings = dashboard.executive_brief;
    const readiness = readinessScore;
    const readinessText = readinessLabel;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${project.name} — Executive Summary</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 20mm 18mm 20mm 18mm; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.6; font-size: 11pt; background: #fff; }
  .page { max-width: 700px; margin: 0 auto; padding: 40px 0; }

  /* Header */
  .report-header { border-bottom: 3px solid #0a0a0a; padding-bottom: 20px; margin-bottom: 28px; }
  .report-header h1 { font-size: 22pt; font-weight: 800; letter-spacing: -0.02em; color: #0a0a0a; margin-bottom: 4px; }
  .report-header .subtitle { font-size: 10pt; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.08em; }
  .report-header .doc-meta { margin-top: 14px; display: flex; gap: 24px; font-size: 9pt; color: #888; }
  .report-header .doc-meta span { display: inline-flex; align-items: center; gap: 4px; }

  /* Classification */
  .classification { display: inline-block; background: #0a0a0a; color: #fff; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; padding: 4px 12px; border-radius: 3px; margin-bottom: 20px; }

  /* Project Info Table */
  .project-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 10pt; }
  .project-table th { text-align: left; background: #f5f5f5; padding: 8px 12px; font-weight: 700; color: #333; border: 1px solid #e0e0e0; width: 35%; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.06em; }
  .project-table td { padding: 8px 12px; border: 1px solid #e0e0e0; color: #1a1a1a; }

  /* Readiness */
  .readiness-section { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center; }
  .readiness-section .label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #666; }
  .readiness-section .score { font-size: 28pt; font-weight: 800; color: ${readiness >= 75 ? '#188d65' : readiness >= 45 ? '#b8832a' : '#d64d4d'}; }
  .readiness-section .status { font-size: 11pt; font-weight: 600; color: #333; }

  /* Section Titles */
  .section-title { font-size: 11pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #0a0a0a; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1.5px solid #e0e0e0; }

  /* Findings List */
  .findings-list { list-style: none; counter-reset: finding; margin-bottom: 28px; }
  .findings-list li { counter-increment: finding; padding: 12px 16px; margin-bottom: 8px; background: #fafafa; border-left: 3px solid #0a0a0a; font-size: 10.5pt; line-height: 1.65; color: #222; position: relative; padding-left: 44px; }
  .findings-list li::before { content: counter(finding, decimal-leading-zero); position: absolute; left: 12px; top: 12px; font-weight: 800; font-size: 11pt; color: #aaa; }

  /* Data Summary Table */
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 10pt; }
  .summary-table th { text-align: left; background: #0a0a0a; color: #fff; padding: 8px 12px; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
  .summary-table td { padding: 8px 12px; border-bottom: 1px solid #eee; }
  .summary-table tr:nth-child(even) td { background: #fafafa; }
  .summary-table .value { font-weight: 700; font-family: 'Courier New', monospace; }
  .summary-table .alert { color: #d64d4d; font-weight: 700; }
  .summary-table .ok { color: #188d65; font-weight: 700; }

  /* Footer */
  .report-footer { margin-top: 36px; padding-top: 16px; border-top: 1.5px solid #e0e0e0; font-size: 8.5pt; color: #999; display: flex; justify-content: space-between; }
  .report-footer .system { font-weight: 700; color: #666; }

  /* Disclaimer */
  .disclaimer { margin-top: 12px; padding: 10px 14px; background: #fff8f0; border: 1px solid #f0e0c8; border-radius: 4px; font-size: 8.5pt; color: #8a6d3b; line-height: 1.5; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="report-header">
    <div class="subtitle">ConstructAsk Intelligence Report</div>
    <h1>${project.name}</h1>
    <div class="doc-meta">
      <span>📅 ${dateStr}</span>
      <span>🕐 ${timeStr}</span>
      <span>📍 ${project.location || 'N/A'}</span>
      <span>📄 Document: Executive Summary</span>
    </div>
  </div>

  <div class="classification">Confidential — Project Internal</div>

  <table class="project-table">
    <tr><th>Project Name</th><td>${project.name}</td></tr>
    <tr><th>Location</th><td>${project.location || 'N/A'}</td></tr>
    <tr><th>Project Status</th><td>${project.status || 'Active'}</td></tr>
    <tr><th>Risk Assessment</th><td>${project.risk_score || 'Medium'}</td></tr>
    <tr><th>Report Generated</th><td>${dateStr} at ${timeStr}</td></tr>
    <tr><th>Generated By</th><td>ConstructAsk AI Engine</td></tr>
  </table>

  <div class="readiness-section">
    <div>
      <div class="label">Project Readiness Index</div>
      <div class="status">${readinessText}</div>
    </div>
    <div class="score">${readiness}%</div>
  </div>

  <div class="section-title">Key Findings & Recommendations</div>
  <ol class="findings-list">
    ${findings.map(f => `<li>${f}</li>`).join('\n    ')}
  </ol>

  <div class="section-title">Evidence Summary</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Category</th>
        <th>Count</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Material Records</td>
        <td class="value">${dashboard.total_materials}</td>
        <td class="ok">Tracked</td>
      </tr>
      <tr>
        <td>Pending Approvals</td>
        <td class="value">${dashboard.pending_approvals}</td>
        <td class="${dashboard.pending_approvals > 0 ? 'alert' : 'ok'}">${dashboard.pending_approvals > 0 ? 'Action Required' : 'Clear'}</td>
      </tr>
      <tr>
        <td>Compliance Alerts</td>
        <td class="value">${dashboard.expiring_certs}</td>
        <td class="${dashboard.expiring_certs > 0 ? 'alert' : 'ok'}">${dashboard.expiring_certs > 0 ? 'Critical' : 'Clear'}</td>
      </tr>
      <tr>
        <td>Delayed Deliveries</td>
        <td class="value">${dashboard.delayed_deliveries}</td>
        <td class="${dashboard.delayed_deliveries > 0 ? 'alert' : 'ok'}">${dashboard.delayed_deliveries > 0 ? 'Delayed' : 'On Track'}</td>
      </tr>
    </tbody>
  </table>

  <div class="disclaimer">
    ⚠️ This report is auto-generated by ConstructAsk AI Engine based on available project data at the time of generation. 
    All findings should be verified against source documents before executive action. This document is intended for internal project use only.
  </div>

  <div class="report-footer">
    <span class="system">ConstructAsk™ — Construction Intelligence Platform</span>
    <span>Page 1 of 1</span>
  </div>

</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => { printWindow.print(); }, 400);
      };
    }
  }

  const firstAction = actionPlan.find((action) => action.tone !== "ok") || actionPlan[0];
  const pulseSignals = [
    { label: "Release readiness", value: `${readinessScore}%`, icon: Gauge },
    { label: "Next focus", value: actionQueue[0]?.category || firstAction.title, icon: RadioTower },
    { label: "Data checked", value: `${dashboard.total_materials} records`, icon: ShieldCheck }
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <section className="page-grid">
      <div className="wide-panel">
        <PrismaHero dashboard={dashboard} actionQueue={actionQueue} projectName={dashboard.project.name} onNavigate={onNavigate} />
      </div>

      <section className="command-telemetry wide-panel" aria-label="Project command telemetry">
        <div className="telemetry-primary">
          <p className="eyebrow">Live command layer</p>
          <h2>{dashboard.project.name}</h2>
          <span>{dashboard.project.location} - evidence checked across materials, approvals, certificates, deliveries, and QR scans.</span>
        </div>
        <div className="telemetry-metrics">
          <div>
            <span>Open actions</span>
            <strong><AnimatedNumber value={actionQueue.length} /></strong>
          </div>
          <div>
            <span>Blockers</span>
            <strong><AnimatedNumber value={readiness?.blockers || 0} /></strong>
          </div>
          <div>
            <span>Warnings</span>
            <strong><AnimatedNumber value={readiness?.warnings || 0} /></strong>
          </div>
        </div>
        <div className="telemetry-scanlines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="stats-grid"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.article variants={item} className={`stat-card atelier-stat ${stat.tone}`} key={stat.label}>
              <Icon size={20} />
              <span>{stat.label}</span>
              <strong><AnimatedNumber value={stat.value} /></strong>
              <small>{stat.detail}</small>
              <i className="stat-sparkline" aria-hidden="true" />
            </motion.article>
          );
        })}
      </motion.div>

      <article className="wide-panel command-panel">
        <div className="command-score command-score-gauge" style={{ "--score": `${readinessScore}%` }}>
          <div>
            <p className="eyebrow">Site release readiness</p>
            <h2>{readinessLabel}</h2>
            <span>{readinessMeaning}</span>
          </div>
          <ReadinessGauge score={readinessScore} label="Release" />
        </div>
        <div className="pulse-grid">
          {pulseSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div className="pulse-chip" key={signal.label}>
                <Icon size={17} />
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </div>
            );
          })}
        </div>
      </article>

      <article className="panel wide-panel action-queue-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Site readiness engine</p>
            <h2>Action Queue</h2>
            <p className="panel-copy">Ranked work that must be cleared before materials are released on site.</p>
          </div>
          <Gauge size={22} />
        </div>
        <div className="action-queue-list">
          {actionQueue.map((action) => (
            <article className={`action-queue-row ${action.severity.toLowerCase()} ${expandedActionId === action.id ? "expanded" : ""}`} key={action.id}>
              <button className="queue-rank" type="button" onClick={() => setExpandedActionId((current) => current === action.id ? null : action.id)}>
                {action.rank}
              </button>
              <div className="queue-main">
                <strong><SeverityDot severity={action.severity} />{action.issue}</strong>
                <small>{action.material_name} - {action.category} - Owner: {action.owner}</small>
                {expandedActionId === action.id ? (
                  <p className="queue-detail">Resolve this evidence item before site release. ConstructAsk ranked it from current project certificates, approvals, deliveries, material status, and QR scan history.</p>
                ) : null}
              </div>
              <span className="queue-severity">{action.severity}</span>
              <button
                className="mini-action-button ghost"
                type="button"
                onClick={() => askAboutAction(`Explain why this action is important today: ${action.issue}`)}
              >
                Ask AI
                <MessageSquareText size={15} />
              </button>
            </article>
          ))}
          {actionQueue.length === 0 ? <div className="empty-state compact">No action items. Project evidence is clear.</div> : null}
        </div>
      </article>

      <article className="panel wide-panel action-plan-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Today&apos;s action plan</p>
            <h2>Required Actions</h2>
          </div>
          <ClipboardCheck size={22} />
        </div>
        <div className="action-plan-grid">
          {actionPlan.map((action) => {
            const Icon = action.icon;
            return (
              <article className={`action-card ${action.tone}`} key={action.title}>
                <div className="action-card-top">
                  <span className="action-icon">
                    <Icon size={18} />
                  </span>
                  <span className="action-priority">{action.priority}</span>
                </div>
                <h3>{action.title}</h3>
                <p>{action.detail}</p>
                <div className="action-card-buttons">
                  <button className="mini-action-button" type="button" onClick={() => openEvidence(action.evidenceCategory)}>
                    Evidence
                    <ArrowRight size={15} />
                  </button>
                  <button className="mini-action-button ghost" type="button" onClick={() => askAboutAction(action.question)}>
                    Ask AI
                    <MessageSquareText size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </article>

      <article className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Today's blockers</p>
            <h2>Critical Blockers</h2>
          </div>
          <CheckCircle2 size={22} />
        </div>
        <div className="alert-list">
          {dashboard.alerts.map((alert) => (
            <div className="alert-row" key={alert}>
              <AlertTriangle size={18} />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      </article>

      <section className="insight-grid wide-panel">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evidence sources</p>
              <h2>Evidence Sources</h2>
            </div>
            <ScrollText size={22} />
          </div>
          <div className="source-list">
            {dashboard.reasoning_sources.map((source) => (
              <div className="source-pill" key={source}>{source}</div>
            ))}
          </div>
          <div className="confidence-card">{dashboard.risk_confidence}</div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operational chain</p>
              <h2>Workflow Impact</h2>
            </div>
            <GitBranch size={22} />
          </div>
          <div className="dependency-list">
            {dashboard.workflow_dependencies.map((dependency) => (
              <div className="dependency-row" key={dependency}>{dependency}</div>
            ))}
          </div>
        </article>
      </section>

      <section className="insight-grid wide-panel">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Audit timeline</p>
              <h2>Audit Timeline</h2>
            </div>
            <Clock size={22} />
          </div>
          <div className="activity-timeline">
            {dashboard.activity_timeline?.map((event) => (
              <article className={`activity-item ${event.tone}`} key={event.id}>
                <span className="activity-dot" />
                <div>
                  <span className="activity-meta">{event.category} - {event.status} - {new Date(event.date).toLocaleDateString()}</span>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Supplier signal</p>
              <h2>Supplier Status</h2>
            </div>
            <Truck size={22} />
          </div>
          <div className="supplier-risk-list">
            {dashboard.supplier_risks.map((supplier) => (
              <div className="supplier-risk-row" key={supplier.supplier}>
                <div>
                  <strong>{supplier.supplier}</strong>
                  <span>{supplier.reason}</span>
                </div>
                <StatusBadge status={supplier.risk.toLowerCase()} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="insight-grid wide-panel">
        <article className="panel executive-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Executive brief mode</p>
            <h2>Executive Summary</h2>
          </div>
          <StatusStamp status={readinessLabel} />
          <Bot size={22} />
        </div>
          <ol className="brief-list">
            {dashboard.executive_brief.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="brief-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("chat")}>
              Ask for live brief
            </button>
            <button className="secondary-button" type="button" onClick={() => askAboutAction("Generate manager daily brief for today")}>
              Daily Brief
            </button>
            <button className="mini-action-button ghost" type="button" onClick={copyBrief}>
              <Copy size={15} />
              Copy
            </button>
            <button className="mini-action-button ghost" type="button" onClick={downloadBrief}>
              <Download size={15} />
              Download
            </button>
          </div>
        </article>
      </section>

      {evidenceCategory ? (
        <EvidenceDrawer
          evidence={evidence}
          activeCategory={evidenceCategory}
          loading={evidenceLoading}
          error={evidenceError}
          onCategoryChange={setEvidenceCategory}
          onClose={() => setEvidenceCategory(null)}
          onAsk={askAboutAction}
          onOpenPage={(page) => {
            setEvidenceCategory(null);
            onNavigate(page);
          }}
        />
      ) : null}
    </section>
  );
}
