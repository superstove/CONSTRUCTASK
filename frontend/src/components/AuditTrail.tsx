import React, { useState } from "react";
import { AuditBlock } from "../types";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Check,
  Cpu,
  FileCheck2,
  Layers,
  RefreshCw,
  User,
} from "lucide-react";

interface AuditTrailProps {
  auditTrail: (AuditBlock & { passportName?: string; passportCode?: string })[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

type AuditView = "all" | "changes" | "scan-events" | "sources";

export default function AuditTrail({ auditTrail, onRefresh, isRefreshing }: AuditTrailProps) {
  const [activeSubTab, setActiveSubTab] = useState<AuditView>("all");
  const [search, setSearch] = useState("");

  const readableAction = (action: string) =>
    action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const eventText = (block: AuditBlock) => `${block.action} ${block.details}`.toLowerCase();

  const whyItMatters = (block: AuditBlock & { passportName?: string; passportCode?: string }) => {
    const text = eventText(block);
    if (block.status === "Flagged" || /block|fail|expired|rejected/.test(text)) {
      return "Needs review before this material or workflow step is treated as clear.";
    }
    if (/approval/.test(text)) {
      return "Shows who changed an approval decision and when it happened.";
    }
    if (/stage|installed|delivered|created|updated/.test(text)) {
      return "Shows the material workflow movement recorded by the backend.";
    }
    if (/scan|qr|verify|release/.test(text)) {
      return "Shows site or QR evidence used for material release decisions.";
    }
    return "Keeps a readable record of what changed in the project.";
  };

  const filteredBlocks = auditTrail.filter((block) => {
    const query = search.trim().toLowerCase();
    const matchesKeyword =
      !query ||
      (block.passportName || "").toLowerCase().includes(query) ||
      (block.passportCode || "").toLowerCase().includes(query) ||
      block.operator.toLowerCase().includes(query) ||
      block.action.toLowerCase().includes(query) ||
      block.details.toLowerCase().includes(query);

    if (!matchesKeyword) return false;
    if (activeSubTab === "scan-events") return /scan|qr|verify|release/.test(eventText(block));
    if (activeSubTab === "changes") return /stage|created|approval|status|updated|material/.test(eventText(block));
    return true;
  });

  const successCount = auditTrail.filter((item) => item.status === "Success").length;
  const flaggedCount = auditTrail.filter((item) => item.status === "Flagged").length;

  const tabs: { id: AuditView; label: string }[] = [
    { id: "all", label: "All Events" },
    { id: "changes", label: "Material Changes" },
    { id: "scan-events", label: "Scan Events" },
    { id: "sources", label: "What This Uses" },
  ];

  return (
    <div id="audit-trail-tab" className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 bg-neutral-50 transition-all">
      <section id="audit-executive-header" className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-5 gap-4">
        <div>
          <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest">
            Module 05 : Audit Records
          </span>
          <h2 className="text-3xl font-extrabold tracking-tighter text-neutral-900 font-sans mt-2.5">
            Audit Trail
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Plain-English history of backend actions: what happened, who did it, when it happened, and why it matters.
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start md:self-auto font-mono">
          <span className="text-[9.5px] text-white bg-neutral-900 border border-neutral-800 py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 font-bold uppercase tracking-widest shadow-xs">
            <Check className="w-3.5 h-3.5 bg-emerald-600 text-white rounded-full p-0.5 shrink-0" />
            Backend records only
          </span>
        </div>
      </section>

      <section id="audit-context-panel" className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">Project</span>
          <p className="text-xs font-bold text-neutral-900 mt-1.5 truncate">Selected project</p>
          <span className="text-[10px] text-neutral-550 block font-mono">Filtered by current project</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">Audit Mode</span>
          <p className="text-xs font-extrabold text-neutral-900 mt-1.5 flex items-center gap-1">
            <FileCheck2 className="w-4 h-4 text-emerald-500" /> Easy reading
          </p>
          <span className="text-[10px] text-neutral-450 font-mono">No external ledger claims</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">Events</span>
          <p className="text-xs font-bold text-neutral-805 mt-1.5">
            {auditTrail.length} total records
          </p>
          <span className="text-[10px] text-neutral-450 font-mono">{successCount} recorded, {flaggedCount} need attention</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">Refresh</span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="mt-2 text-[10px] font-mono font-bold uppercase border border-neutral-300 bg-white hover:bg-neutral-50 p-1.5 rounded-lg flex items-center gap-1.5 justify-center cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh records</span>
          </button>
        </div>
      </section>

      <div className="space-y-6">
        <div className="flex border-b border-neutral-200 overflow-x-auto">
          <nav className="flex gap-4" aria-label="Sub tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? "border-neutral-900 text-neutral-900"
                    : "border-transparent text-neutral-400 hover:text-neutral-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeSubTab !== "sources" && (
          <div className="bg-white border p-4 rounded-xl shadow-xs">
            <input
              type="text"
              placeholder="Search by material, batch, operator, action, or detail..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-neutral-50 px-4 py-2 border border-neutral-200 focus:bg-white rounded-lg text-xs"
            />
          </div>
        )}

        {activeSubTab !== "sources" && (
          <div className="relative animate-fadeIn ml-2 sm:ml-4 mt-6">
            {filteredBlocks.length === 0 && (
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 text-sm text-neutral-500">
                No audit events match this view. Try clearing the search or switching to All Events.
              </div>
            )}

            {filteredBlocks.length > 0 && (
              <div className="absolute top-4 bottom-8 left-[11px] w-[2px] premium-bg-sub border-l premium-border z-0" />
            )}

            {filteredBlocks.map((block, idx) => {
              const isFlagged = block.status === "Flagged";
              
              return (
                <div key={`${block.passportId}-${block.index}-${idx}`} id={`audit-record-${idx}`} className="relative flex items-start gap-5 mb-8 group">
                  {/* Timeline Node */}
                  <div className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-[3px] bg-white shrink-0 mt-0.5 shadow-sm transition-all ${
                    isFlagged ? "border-red-200" : "border-neutral-200 group-hover:border-[var(--theme-accent-hover)]"
                  }`}>
                    {isFlagged ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 group-hover:bg-[var(--theme-accent-hover)] transition-colors" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3">
                        <span className={`text-[15px] tracking-tight font-bold ${isFlagged ? "text-red-700" : "premium-text-primary"}`}>
                          {readableAction(block.action)}
                        </span>
                        <span className="text-xs premium-text-secondary font-medium">
                          {block.passportName || "Unknown"} <span className="font-mono text-[10px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded ml-1">{block.passportCode}</span>
                        </span>
                        <div className="flex-1" />
                        <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-wider whitespace-nowrap mt-1 sm:mt-0">
                          {new Date(block.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                    </div>
                    
                    <div className="text-xs premium-text-secondary mt-1.5 flex items-center gap-2">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> <strong className="premium-text-primary">{block.operator}</strong></span>
                      {isFlagged && <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">Needs Attention</span>}
                    </div>

                    <div className="mt-3.5 bg-white border premium-border rounded-xl p-4 shadow-xs transition-shadow hover:shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">Action payload</span>
                            <p className="text-xs premium-text-primary font-medium leading-relaxed">{block.details || readableAction(block.action)}</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">Impact</span>
                            <p className="text-xs premium-text-secondary leading-relaxed">{whyItMatters(block)}</p>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeSubTab === "sources" && (
          <div id="evidence-sources-catalog" className="bg-white border rounded-2xl p-6 md:p-8 shadow-xs space-y-4 animate-fadeIn">
            <h3 className="text-xs font-mono font-bold uppercase text-neutral-400 border-b pb-3 block">
              What This Audit View Uses
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-neutral-150 p-5 rounded-2xl space-y-3">
                <span className="bg-emerald-100 text-emerald-800 font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">Backend</span>
                <h4 className="text-sm font-extrabold text-neutral-900">Audit records</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-light">
                  Actions saved by material creation, verification, approval, and stage update flows.
                </p>
              </div>

              <div className="border border-neutral-150 p-5 rounded-2xl space-y-3">
                <span className="bg-blue-100 text-blue-800 font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">Project</span>
                <h4 className="text-sm font-extrabold text-neutral-900">Material identity</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-light">
                  Material name, batch number, supplier, and status joined from the selected project.
                </p>
              </div>

              <div className="border border-neutral-150 p-5 rounded-2xl space-y-3">
                <span className="bg-amber-100 text-amber-800 font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">Site</span>
                <h4 className="text-sm font-extrabold text-neutral-900">Scan and decision evidence</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-light">
                  QR checks and workflow decisions are shown only when recorded by the backend.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <section id="audit-ai-insight" className="bg-neutral-50 border border-neutral-250 p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-black animate-pulse" /> Audit Reading Guide
          </span>
          <span className="text-[9px] font-mono text-neutral-450 font-bold uppercase">Plain records</span>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed font-sans font-light">
          Read this section like a project history log. Each event answers: what changed, who recorded it, which material it affects, and whether action is needed.
        </p>
      </section>

      <section id="audit-evidence" className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 border-b pb-3 font-mono">
          Legend
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">Recorded</span>
            <span className="font-bold text-xs block text-black truncate mt-1">Normal saved event</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">No immediate attention needed</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">Needs Attention</span>
            <span className="font-bold text-neutral-805 text-xs block mt-1">Blocked or failed event</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">Review before releasing work</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">Source</span>
            <span className="font-bold text-neutral-808 text-xs block mt-1">ConstructAsk backend</span>
            <span className="text-[9.3px] text-neutral-450 block font-mono">No external claim unless integrated</span>
          </div>
        </div>
      </section>

      <section id="audit-actions" className="premium-bg-sub premium-text-primary border premium-border rounded-2xl p-6 md:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b premium-border-b pb-3">
          <h4 className="text-[10px] font-mono font-bold uppercase premium-text-secondary tracking-widest">
            Audit Follow-Up
          </h4>
          <span className="text-[9.5px] font-mono text-amber-500 font-extrabold uppercase bg-amber-500/10 px-2 py-0.5 rounded tracking-wider">
            Review open items
          </span>
        </div>
        <ul className="space-y-3.5 text-xs font-sans premium-text-secondary">
          <li className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <strong className="premium-text-primary block font-semibold leading-tight">Review events marked Needs attention</strong>
              <p className="premium-text-secondary mt-0.5 leading-normal font-light">
                These usually mean a failed verification, blocked release, rejected approval, or expired evidence recorded in the backend.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <Activity className="w-4 h-4 premium-text-secondary mt-0.5 shrink-0" />
            <div>
              <strong className="premium-text-primary block font-semibold leading-tight">Use the material and batch names to trace the source</strong>
              <p className="premium-text-secondary mt-0.5 leading-normal font-light">
                Search the material or batch number, then check the related material, approval, certificate, or scan screen.
              </p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
