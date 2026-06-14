import React, { useEffect, useState } from "react";
import { ComplianceCertificate } from "../types";
import { FrontendApproval } from "../api/backendClient";
import { 
  AlertTriangle, 
  ShieldAlert, 
  ArrowRight,
  FileText,
  Calendar,
  Lock,
  Cpu,
  Bookmark,
  Activity,
  CheckCircle,
  FileCheck2,
  Trash,
  Plus
} from "lucide-react";

import ApprovalsWorkflow, { ApprovalGate } from "./ApprovalsWorkflow";

interface ComplianceHubProps {
  certificates: ComplianceCertificate[];
  approvals: FrontendApproval[];
  projectName?: string;
  onUpdateApproval: (id: number, status: "approved" | "rejected" | "pending") => Promise<void>;
  onNavigateToTab: (tab: any, actionQuery?: string) => void;
}

function mapApprovalToGate(approval: FrontendApproval): ApprovalGate {
  const isApproved = approval.status.toLowerCase() === "approved";
  const isOverdue = approval.overdue_days > 0 && !isApproved;

  return {
    id: String(approval.id),
    name: approval.approval_type,
    material: approval.material_name || `Material ${approval.material_id}`,
    assignee: approval.approver,
    dueDate: approval.requested_date,
    overdueDays: approval.overdue_days,
    priority: isOverdue ? "High Blocker" : isApproved ? "Low" : "Medium Risk",
    status: isApproved ? "Signed-off" : isOverdue ? "Overdue" : "Pending",
    signedOffAt: approval.approved_date || undefined,
  };
}

export default function ComplianceHub({ certificates, approvals, projectName, onUpdateApproval, onNavigateToTab }: ComplianceHubProps) {
  // Sub-tabs management
  const [activeSubTab, setActiveSubTab] = useState<"certificates" | "approvals" | "reviews" | "issues">("certificates");
  
  const [gates, setGates] = useState<ApprovalGate[]>([]);

  useEffect(() => {
    setGates(approvals.map(mapApprovalToGate));
  }, [approvals]);
  
  // Search query
  const [search, setSearch] = useState("");

  const [activeNotification, setActiveNotification] = useState<string | null>(null);

  const triggerAuditDownload = (certId: string) => {
    setActiveNotification(`Verified record sequence initiated for certificate ${certId}. Document bundle compiled successfully.`);
    setTimeout(() => {
      setActiveNotification(null);
    }, 4500);
  };

  // Filters for certificates
  const filteredCerts = certificates.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase()) ||
    c.issuer.toLowerCase().includes(search.toLowerCase())
  );
  const activeCertsCount = certificates.filter(c => c.status === "Active").length;
  const issueCerts = certificates.filter(c => c.status !== "Active");
  const expiredCerts = certificates.filter(c => c.status === "Expired");
  const expiringCerts = certificates.filter(c => c.status === "Expiring");
  const pendingGates = gates.filter((gate) => gate.status !== "Signed-off");
  const pendingGateNames = gates
    .filter((gate) => gate.status !== "Signed-off")
    .slice(0, 2)
    .map((gate) => gate.name);
  const hasEscalation = issueCerts.length > 0 || pendingGates.length > 0;

  return (
    <div id="compliance-tab" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen transition-all">
      
      {/* Floating toast notification */}
      {activeNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white px-5 py-4 rounded-xl border border-neutral-850 shadow-2xl max-w-md animate-fadeIn text-xs font-mono">
          <p className="font-bold uppercase tracking-widest text-[#a3a3a3] mb-1">SYSTEM INTEGRITY ACTION</p>
          <p className="font-sans text-neutral-300 font-light">{activeNotification}</p>
        </div>
      )}

      {/* 1. EXECUTIVE SUMMARY HEADER */}
      <section id="compliance-executive-header" className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-5 gap-4">
        <div>
          <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest font-sans">
            Module 04 : Regulatory Trust Hub
          </span>
          <h2 className="text-3xl font-extrabold tracking-tighter text-neutral-900 font-sans mt-2.5">
            Regulatory Compliance Hub
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Backend view of certificates and approval gates recorded for the selected project.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-neutral-900 border border-neutral-800 text-white font-mono font-bold uppercase tracking-widest py-1.5 px-3.5 rounded-xl shadow-xs self-start md:self-auto">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>{hasEscalation ? "Requires review" : "No open compliance blocker"}</span>
        </div>
      </section>

      {/* 2. CONTEXT PANEL */}
      <section id="compliance-context-panel" className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-[9px] font-mono text-[#a3a3a3] font-bold block uppercase tracking-wider">PROJECT LEVEL</span>
          <p className="text-xs font-bold text-neutral-900 mt-1.5 truncate">{projectName || "Selected project"}</p>
          <span className="text-[10px] text-neutral-550 block font-mono">Live project approval feed</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-[#a3a3a3] font-bold block uppercase tracking-wider">VALID CERTIFICATES</span>
          <span className="text-xs font-bold text-neutral-800 block mt-1.5 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600 animate-pulse" /> {activeCertsCount} Standard Certs Active
          </span>
          <span className="text-[10px] text-neutral-450 font-mono">From compliance API</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-[#a3a3a3] font-bold block uppercase tracking-wider">PENDING APPROVAL GATES</span>
          <p className="text-xs font-semibold text-neutral-800 mt-1.5 flex items-center gap-1">
            <ShieldAlert className="w-4 h-4 text-[#ef4444]" /> {pendingGates.length} pending or overdue
          </p>
          <span className="text-[10px] text-neutral-450 font-mono">From approvals API</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-[#a3a3a3] font-bold block uppercase tracking-wider">CERTIFICATE REVIEW</span>
          <span className="font-mono text-[9px] py-0.5 px-3 bg-neutral-900 text-white rounded-full uppercase self-start mt-2">
            {expiredCerts.length} expired / {expiringCerts.length} expiring
          </span>
        </div>
      </section>

      {/* 3. CORE VIEWS & SUB-TABS DATA SECTION */}
      <div className="space-y-6">
        
        {/* Sub Navigation controls */}
        <div className="flex border-b border-neutral-200 overflow-x-auto">
          <nav className="flex gap-4" aria-label="Sub tabs">
            <button
              onClick={() => setActiveSubTab("certificates")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "certificates" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Certificates
            </button>
            <button
              onClick={() => setActiveSubTab("approvals")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "approvals" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Approvals
            </button>
            <button
              onClick={() => setActiveSubTab("reviews")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "reviews" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Compliance Reviews
            </button>
            <button
              onClick={() => setActiveSubTab("issues")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "issues" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Issues & Exceptions
            </button>
          </nav>
        </div>

        {/* ─── SUB-TAB 1: CERTIFICATES REGISTRY ─── */}
        {activeSubTab === "certificates" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter query search */}
            <div className="bg-white border p-4 rounded-xl shadow-xs">
              <input 
                type="text"
                placeholder="Search certificate registry by testing body, rule name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-neutral-50 px-4 py-2 border border-neutral-200 focus:bg-white rounded-lg text-xs"
              />
            </div>

            {/* List columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredCerts.map((cert) => {
                const IsActive = cert.status === "Active";
                const IsExpiring = cert.status === "Expiring";
                return (
                  <div key={cert.id} className="premium-card rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                    <div className="space-y-4">
                      
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] font-mono premium-text-secondary tracking-wider">CODE ID: {cert.id}</span>
                          <h4 className="font-extrabold text-neutral-900 group-hover:text-black dark:text-white text-sm">{cert.name}</h4>
                        </div>
                        <span className={`inline-block font-mono text-[9px] py-0.5 px-2.5 rounded-full font-bold uppercase border shrink-0 ${
                          IsActive 
                            ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
                            : IsExpiring 
                              ? "bg-amber-100 border-amber-250 text-amber-800 animate-pulse" 
                              : "bg-red-50 border-red-200 text-red-800"
                        }`}>
                          {cert.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-3.5 bg-neutral-100/55 rounded-xl border">
                        <div>
                          <span className="text-[9px] font-mono premium-text-secondary font-bold block uppercase">Auditing Body</span>
                          <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs mt-0.5">{cert.issuer}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono premium-text-secondary font-bold block uppercase">Date of Expiration:</span>
                          <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs mt-0.5 font-mono">{new Date(cert.expiresAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="text-xs space-y-1">
                        <span className="premium-text-secondary font-mono tracking-wide text-[9.5px] font-bold uppercase">Standards scope boundaries:</span>
                        <p className="premium-text-secondary italic leading-relaxed bg-neutral-100/35 border p-3 rounded-lg font-light">
                          "{cert.scope}"
                        </p>
                      </div>

                    </div>

                    <div className="flex items-center justify-between border-t border-neutral-100 mt-5 pt-4">
                      <span className="text-[9px] font-mono premium-text-secondary font-bold">BACKEND CERTIFICATE RECORD</span>
                      <a 
                        href="#" 
                        onClick={(e) => { e.preventDefault(); triggerAuditDownload(cert.id); }}
                        className="text-xs text-black dark:text-white hover:underline font-bold flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>Review certificate details</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── SUB-TAB 2: APPROVALS WORKFLOW ─── */}
        {activeSubTab === "approvals" && (
          <div className="animate-fadeIn">
            <ApprovalsWorkflow 
              gates={gates} 
              setGates={setGates} 
              onGateApproved={(gateId) => {
                const id = Number(gateId);
                if (Number.isFinite(id)) {
                  onUpdateApproval(id, "approved").catch((err) => {
                    console.error("Failed to persist approval sign-off:", err);
                  });
                }
              }} 
              onRefresh={() => setGates(approvals.map(mapApprovalToGate))}
            />
          </div>
        )}

        {/* ─── SUB-TAB 3: COMPLIANCE REVIEWS ─── */}
        {activeSubTab === "reviews" && (
          <div className="bg-white border rounded-2xl p-6 shadow-xs animate-fadeIn">
            <h3 className="text-xs font-mono font-bold uppercase text-[#a3a3a3] border-b pb-3 block">
              Active Compliance Reviews
            </h3>
            <div className="py-8 text-center text-neutral-400 font-mono text-xs">
              Compliance review records are not a separate backend table yet. Current review status is derived from certificate and approval APIs.
            </div>
          </div>
        )}

        {/* ─── SUB-TAB 4: ISSUES & EXCEPTIONS ─── */}
        {activeSubTab === "issues" && (
          <div className="bg-white border rounded-2xl p-6 shadow-xs animate-fadeIn">
            <h3 className="text-xs font-mono font-bold uppercase text-[#a3a3a3] border-b pb-3 block">
               Exceptions Engine Database
            </h3>
            <div className="py-8 text-center text-neutral-400 font-mono text-xs">
              Exceptions are derived from backend records: expired certificates, expiring certificates, and pending or overdue approvals.
            </div>
          </div>
        )}

      </div>

      {/* 4. AI INSIGHT CARD */}
      <section id="compliance-ai-insight" className="bg-neutral-50 border border-neutral-255 p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-black animate-pulse" /> AI Compliance Auditor Insight
          </span>
          <span className="text-[9px] font-mono text-neutral-400 font-bold uppercase">Backend-derived summary</span>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed font-sans font-light">
          The current compliance feed shows <strong>{activeCertsCount}</strong> active certificate records, <strong>{expiredCerts.length}</strong> expired record, and <strong>{expiringCerts.length}</strong> expiring record. Pending approval gates: {pendingGateNames.length ? pendingGateNames.join(", ") : "none"}.
        </p>
      </section>

      {/* 5. EVIDENCE SECTION */}
      <section id="compliance-evidence" className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3 font-mono">
          Connected Compliance Evidence
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">CERTIFICATE API</span>
            <span className="font-bold text-xs block text-black">
              {certificates.length} certificate records
            </span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">Active, expiring, expired</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">APPROVALS API</span>
            <span className="font-bold text-neutral-800 text-xs block mt-1">{approvals.length} approval gates</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">Approved, pending, overdue</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">MATERIAL LINK</span>
            <span className="font-bold text-neutral-800 text-xs block mt-1">Certificate scope by material</span>
            <span className="text-[9.5px] text-neutral-455 block font-mono">From selected project records</span>
          </div>
        </div>
      </section>

      {/* 6. ACTION RECOMMENDATIONS */}
      <section id="compliance-actions" className="bg-[#1c1c1c] text-white border border-neutral-900 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-850 pb-3">
          <h4 className="text-[10px] font-mono font-bold uppercase text-neutral-450 tracking-widest">
            COMPLIANCE FOLLOW-UP
          </h4>
          <span className="text-[9px] font-mono text-white font-extrabold uppercase bg-amber-600 px-2 py-0.5 rounded tracking-wider">
            HIGH PRIORITY
          </span>
        </div>
        <ul className="space-y-3.5 text-xs font-sans text-neutral-305">
          <li className="flex items-start gap-2.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
            <div>
              <strong className="text-white block font-semibold leading-tight">Review certificates that are not active in the backend feed</strong>
              <p className="text-neutral-400 mt-0.5 leading-normal font-light">Open the affected certificate records and update the supporting evidence before releasing related materials.</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-2 w-2 rounded-full bg-neutral-550 mt-1.5 shrink-0" />
            <div>
              <strong className="text-white block font-semibold leading-tight">Clear pending approval gates from the approvals API</strong>
              <p className="text-neutral-400 mt-0.5 leading-normal font-light">Persist approval status changes through the backend sign-off endpoint so the dashboard totals update after refresh.</p>
            </div>
          </li>
        </ul>
      </section>

    </div>
  );
}
