import React, { useState } from "react";
import { Project } from "../types";
import { 
  Building, 
  CheckCircle2, 
  ShieldAlert,
  Sparkles,
  Lock,
  Cpu,
  Layers,
  ArrowRight,
  TrendingDown,
  Activity,
  FileCheck2,
  Calendar,
  AlertTriangle
} from "lucide-react";

interface LifecycleIntelligenceProps {
  project: Project | null;
  onNavigateToTab: (tab: any, selectedId?: string) => void;
}

export default function LifecycleIntelligence({ project, onNavigateToTab }: LifecycleIntelligenceProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All Categories");

  if (!project) {
    return (
      <div className="p-8 text-neutral-500 font-mono text-xs flex items-center gap-2">
        <span className="w-4 h-4 rounded-full border-2 border-neutral-300 border-t-black animate-spin" />
        Synchronizing Material timelines...
      </div>
    );
  }

  const passports = project.passports || [];

  // Filter based on dropdown
  const filteredPassports = passports.filter(pp => {
    if (selectedCategory === "All Categories") return true;
    if (selectedCategory === "High Carbon Risk") return pp.carbonFootprint === "High";
    if (selectedCategory === "Sustainably Certified") return pp.sustainabilityScore !== null && pp.sustainabilityScore >= 90;
    return true;
  });

  // Real evidence derived from backend-mapped project data
  const certificates = project.certificates || [];
  const expiredCerts = certificates.filter((c) => c.status === "Expired" || c.status === "Revoked");
  const expiringCerts = certificates.filter((c) => c.status === "Expiring");
  const problemCerts = [...expiredCerts, ...expiringCerts];
  const tracedCount = passports.filter((pp) => pp.auditChain.length > 0).length;
  const allAuditBlocks = passports.flatMap((pp) => pp.auditChain);
  const latestAudit = allAuditBlocks.length
    ? allAuditBlocks.reduce((a, b) => (new Date(a.timestamp) > new Date(b.timestamp) ? a : b))
    : null;
  const issuers = Array.from(new Set(certificates.map((c) => c.issuer))).filter(Boolean);

  // Calculate stage counts
  const stagesList = [
    { label: "Manufactured", count: project.passports.filter(p => p.currentStage !== "Manufactured").length },
    { label: "Certified", count: project.passports.filter(p => ["Certified", "Delivered", "Approved", "Installed", "Verified", "Audited"].includes(p.currentStage)).length },
    { label: "Delivered", count: project.passports.filter(p => ["Delivered", "Approved", "Installed", "Verified", "Audited"].includes(p.currentStage)).length },
    { label: "Approved", count: project.passports.filter(p => ["Approved", "Installed", "Verified", "Audited"].includes(p.currentStage)).length },
    { label: "Installed", count: project.passports.filter(p => ["Installed", "Verified", "Audited"].includes(p.currentStage)).length },
    { label: "Verified", count: project.passports.filter(p => ["Verified", "Audited"].includes(p.currentStage)).length },
    { label: "Audited", count: project.passports.filter(p => p.currentStage === "Audited").length }
  ];

  return (
    <div id="lifecycle-tab" className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen transition-all">
      
      {/* 1. EXECUTIVE SUMMARY HEADER */}
      <section id="lifecycle-executive-header" className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-5 gap-4">
        <div>
          <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest">
            Module 03 : Supply Path Intelligence
          </span>
          <h2 className="text-3xl font-extrabold tracking-tighter text-neutral-900 font-sans mt-2.5">
            Lifecycle & Supply-Chain Traceability
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Validating each physical component's stage boundary from raw factories to verified on-site installation.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] bg-neutral-900 border border-neutral-800 text-white font-mono font-bold uppercase tracking-widest py-1.5 px-3.5 rounded-xl shadow-xs self-start md:self-auto">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>STAGES: REAL-TIME SECURED</span>
        </div>
      </section>

      {/* 2. CONTEXT PANEL */}
      <section id="lifecycle-context-panel" className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">PROJECT</span>
          <p className="text-xs font-bold text-neutral-900 mt-1.5 truncate">{project.name}</p>
          <span className="text-[10px] text-neutral-550 block font-mono">{project.location}</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">AGGREGATE COVERAGE</span>
          <p className="text-xs font-extrabold text-neutral-900 mt-1.5">{project.coverageScore}% verified paths</p>
          <span className="text-[10px] text-neutral-450 font-mono">{tracedCount}/{passports.length} materials with audit records</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">CERTIFICATE BLOCKERS</span>
          {problemCerts.length > 0 ? (
            <>
              <p className="text-xs font-bold text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> {expiredCerts.length} expired, {expiringCerts.length} expiring
              </p>
              <span className="text-[10px] text-neutral-450 font-mono truncate block" title={problemCerts.map((c) => c.name).join(", ")}>
                {problemCerts.map((c) => c.name).join(", ")}
              </span>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> No certificate blockers
              </p>
              <span className="text-[10px] text-neutral-450 font-mono">{certificates.length} certificates on record</span>
            </>
          )}
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">FILTER MATRIX</span>
          <div className="mt-1.5">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 p-1.5 rounded text-[11px] font-sans focus:outline-none w-full"
            >
              <option value="All Categories">Showing: All Categories</option>
              <option value="High Carbon Risk">Carbon Impact: High Only</option>
              <option value="Sustainably Certified">Sustainability: Recycled/Low</option>
            </select>
          </div>
        </div>
      </section>

      {/* 3. CORE DATA TABLE / TIMELINE VIEW */}
      <section id="lifecycle-data-table" className="space-y-6">
        
        {/* Aggregate pipeline gauge row */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#a3a3a3] mb-5">
            Aggregate Pipeline progress Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4 relative">
            {stagesList.map((st, idx) => (
              <div key={idx} className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl text-center space-y-1 relative">
                <div className="flex justify-center">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs bg-neutral-900 border border-neutral-800 text-white">
                    {idx + 1}
                  </span>
                </div>
                <p className="text-xs font-bold text-neutral-800 pt-1 leading-none">{st.label}</p>
                <p className="text-[9.5px] text-neutral-450 font-mono font-semibold uppercase tracking-wider pt-0.5">
                  {st.count} in stage
                </p>
                {idx < 6 && (
                  <div className="hidden md:block absolute top-8 -right-3.5 w-7 h-[1px] bg-neutral-200 z-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* List of Active Materials and their Stage status */}
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center text-xs font-bold uppercase tracking-widest text-neutral-400 font-mono">
            <span>Core Material Flow Registries</span>
            <span className="text-[9.5px] text-neutral-550 border rounded-full px-2 bg-white">
              Categories filtered: {selectedCategory}
            </span>
          </div>
          <div className="divide-y divide-neutral-150">
            {filteredPassports.map((pp) => {
              const lastAudit = pp.auditChain[pp.auditChain.length - 1];
              return (
                <div key={pp.id} className="p-5 hover:bg-neutral-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 max-w-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#111111] text-sm">{pp.name}</span>
                      <span className="font-mono text-[9px] text-[#737373] bg-[#f5f5f5] py-0.5 px-2 rounded-full border font-bold">
                        {pp.code}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-neutral-500 font-medium flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-neutral-400" /> {pp.manufacturer}
                      </span>
                      <span className="text-neutral-300">•</span>
                      <span>Origin: {pp.origin}</span>
                      <span className="text-neutral-300">•</span>
                      <span>Sustainability Index: {pp.sustainabilityScore !== null ? `${pp.sustainabilityScore}/100` : "Pending passport"}</span>
                    </div>

                    <div className="bg-neutral-50 border border-neutral-150 p-2 rounded-lg text-[11px] text-neutral-600 font-mono flex items-center justify-between">
                      <span className="truncate w-44 sm:w-80" title={`Latest node verification: ${lastAudit?.details}`}>
                        Last Proof: {lastAudit?.details || "N/A"}
                      </span>
                      <span className="text-[9.5px] text-white bg-neutral-900 py-0.5 px-2.5 rounded-full shrink-0 font-bold uppercase font-mono tracking-wider ml-2">
                        {pp.currentStage}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onNavigateToTab("passports", pp.id)}
                      className="text-xs bg-white hover:bg-neutral-50 border border-neutral-300 hover:text-black py-1.5 px-3.5 rounded-lg transition-all font-mono font-bold uppercase shadow-xs cursor-pointer"
                    >
                      Audit sheet
                    </button>
                    <button
                      onClick={() => onNavigateToTab("assistant", `Trace history check for ${pp.name}`)}
                      className="text-xs bg-black text-white hover:bg-neutral-850 py-1.5 px-3.5 rounded-lg transition-all font-mono font-bold uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-white" />
                      <span>Ask AI</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </section>

      {/* 4. AI INSIGHT CARD */}
      <section id="lifecycle-ai-insight" className="bg-neutral-50 border border-neutral-250 p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-black animate-pulse" /> Operational Intelligence Summary
          </span>
          <span className="text-[9px] font-mono text-neutral-400 font-bold uppercase">Source: live project records</span>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed font-sans font-light">
          Trace coverage stands at <strong>{project.coverageScore}%</strong> across {passports.length} tracked materials
          for {project.name}, with {tracedCount} carrying chained audit records.{" "}
          {expiredCerts.length > 0 ? (
            <>
              Active verification blockade: <strong>{expiredCerts[0].name}</strong> covering{" "}
              <strong>{expiredCerts[0].scope}</strong> is {expiredCerts[0].status.toLowerCase()} — the affected
              material must remain blocked until renewed evidence is uploaded.
            </>
          ) : expiringCerts.length > 0 ? (
            <>
              Nearest risk: <strong>{expiringCerts[0].name}</strong> covering <strong>{expiringCerts[0].scope}</strong>{" "}
              expires on {expiringCerts[0].expiresAt}. Schedule recertification before the deadline to avoid a release block.
            </>
          ) : (
            <>All {certificates.length} certificates on record are currently active. No certificate-driven blockades detected.</>
          )}
        </p>
      </section>

      {/* 5. EVIDENCE SECTION */}
      <section id="lifecycle-evidence" className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3 font-mono">
          Cryptographic Traceability Evidence Verification
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">LATEST SHA-256 CHAIN HASH</span>
            <span className="font-bold text-neutral-800 text-xs block truncate mt-1" title={latestAudit?.hash}>
              {latestAudit ? latestAudit.hash : "No audit records yet"}
            </span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">{allAuditBlocks.length} chained audit records</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">LATEST VERIFIED EVENT</span>
            <span className="font-bold text-neutral-805 text-xs block mt-1 truncate" title={latestAudit?.details}>
              {latestAudit ? latestAudit.action : "—"}
            </span>
            <span className="text-[9.3px] text-neutral-450 block font-mono">
              {latestAudit ? `By ${latestAudit.operator} • ${new Date(latestAudit.timestamp).toLocaleDateString()}` : "Awaiting first event"}
            </span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">CERTIFYING BODIES</span>
            <span className="font-bold text-neutral-805 text-xs block mt-1 truncate" title={issuers.join(", ")}>
              {issuers.length ? issuers.slice(0, 2).join(", ") : "None on record"}
            </span>
            <span className="text-[9.3px] text-neutral-450 block font-mono">
              {issuers.length > 2 ? `+${issuers.length - 2} more from compliance records` : `${certificates.length} certificates on record`}
            </span>
          </div>
        </div>
      </section>

      {/* 6. ACTION RECOMMENDATIONS */}
      <section id="lifecycle-action-recommendations" className="bg-[#1c1c1c] text-white border border-neutral-900 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-850 pb-3">
          <h4 className="text-[10px] font-mono font-bold uppercase text-[#a3a3a3] tracking-widest">
            RECOMMENDED PROTOCOL CHECKLISTS
          </h4>
          {expiredCerts.length > 0 ? (
            <span className="text-[9px] font-mono text-white font-extrabold uppercase bg-amber-600 px-2 py-0.5 rounded tracking-wider">
              {expiredCerts.length} EXPIRED CERTIFICATE{expiredCerts.length > 1 ? "S" : ""}
            </span>
          ) : (
            <span className="text-[9px] font-mono text-white font-extrabold uppercase bg-emerald-700 px-2 py-0.5 rounded tracking-wider">
              {expiringCerts.length > 0 ? "EXPIRY WATCH" : "ALL CERTIFICATES ACTIVE"}
            </span>
          )}
        </div>
        <ul className="space-y-3.5 text-xs font-sans text-[#e5e5e5]">
          {problemCerts.slice(0, 3).map((cert) => (
            <li key={cert.id} className="flex items-start gap-2.5">
              <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${cert.status === "Expiring" ? "bg-neutral-500" : "bg-amber-500"}`} />
              <div>
                <strong className="text-white block font-semibold leading-tight">
                  {cert.status === "Expiring" ? "Schedule renewal of" : "Renew"} {cert.name} with {cert.issuer}
                </strong>
                <p className="text-neutral-400 mt-0.5 leading-normal font-light">
                  Covers {cert.scope}. Status: {cert.status.toLowerCase()}, expiry date {cert.expiresAt}.{" "}
                  {cert.status === "Expiring"
                    ? "Renew before the deadline to avoid a release block."
                    : "The affected material stays blocked until renewed evidence is uploaded."}
                </p>
              </div>
            </li>
          ))}
          {problemCerts.length === 0 && (
            <li className="flex items-start gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block font-semibold leading-tight">No certificate actions required</strong>
                <p className="text-neutral-400 mt-0.5 leading-normal font-light">
                  All {certificates.length} certificates on record are active. Continue routine QR verification on incoming deliveries.
                </p>
              </div>
            </li>
          )}
        </ul>
      </section>

    </div>
  );
}
