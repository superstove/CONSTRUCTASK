import React, { useState, useEffect } from "react";
import {
  Building, Cpu, ShieldAlert, CheckCircle, Target, Link, Calendar, Layers,
  TrendingUp, Activity, AlertTriangle, ShieldCheck, Zap, PackagePlus, QrCode
} from "lucide-react";

type IntelTab = "needs-attention" | "supplier-health" | "risk-analysis" | "readiness" | "delivery";

export default function ProjectIntelligence({
  intelligenceData,
  onAddMaterial,
  onScanQr,
  requestedSubTab,
}: {
  intelligenceData: any;
  onAddMaterial?: () => void;
  onScanQr?: () => void;
  requestedSubTab?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<IntelTab>("needs-attention");

  // Jump to a sub-tab when the sidebar requests one.
  useEffect(() => {
    const sub = requestedSubTab?.split("#")[0];
    const valid: IntelTab[] = ["needs-attention", "supplier-health", "risk-analysis", "readiness", "delivery"];
    if (sub && (valid as string[]).includes(sub)) {
      setActiveTab(sub as IntelTab);
    }
  }, [requestedSubTab]);

  const tabs = [
    { id: "needs-attention", label: "Needs Attention" },
    { id: "readiness", label: "Readiness Breakdown" },
    { id: "supplier-health", label: "Supplier Health" },
    { id: "risk-analysis", label: "Risk Analysis" },
    { id: "delivery", label: "Delivery Intelligence" }
  ] as const;

  if (!intelligenceData) return null;

  return (
    <div id="project-intelligence-tab" className="p-4 sm:p-6 lg:p-10 w-full min-h-full pb-32 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center shrink-0 shadow-sm border border-neutral-800">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest">
              Project Intelligence
            </span>
            <h2 className="text-3xl font-extrabold tracking-tighter text-neutral-900 font-sans mt-2.5">
              Operational Intelligence
            </h2>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
              Live readiness, supplier health, risks and delivery signals — all from connected Construct Ask records.
            </p>
          </div>
        </div>
        {(onAddMaterial || onScanQr) && (
          <div className="flex items-center gap-2 shrink-0">
            {onScanQr && (
              <button
                onClick={onScanQr}
                className="flex items-center gap-1.5 bg-black text-white rounded-lg px-3 py-2 text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Scan a QR and verify a material"
              >
                <QrCode className="w-4 h-4" /> Scan QR
              </button>
            )}
            {onAddMaterial && (
              <button
                onClick={onAddMaterial}
                className="flex items-center gap-1.5 bg-white border border-neutral-250 text-neutral-800 rounded-lg px-3 py-2 text-xs font-bold hover:bg-neutral-50 transition-colors cursor-pointer"
                title="Add a new material to this project"
              >
                <PackagePlus className="w-4 h-4" /> Add Material
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 mb-6 border-b border-neutral-200">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-3 text-xs font-bold uppercase tracking-wider font-mono border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id ? "border-black text-black" : "border-transparent text-neutral-400 hover:text-neutral-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === "needs-attention" && (
          <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
            <h3 className="font-bold font-sans text-lg mb-4 text-white">Workflow Dependency Engine</h3>
            <p className="text-xs text-neutral-400 mb-6">Visual relationship mapping of systemic blockers, constraints, and cascading lifecycle impacts.</p>
            
            {intelligenceData.dependencyEngine?.length ? (
            <div className="grid grid-cols-1 gap-8">
              {intelligenceData.dependencyEngine.map((dep: any, idx: number) => (
                <div key={idx} className="border border-[#1A2433] rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-[#05070A]/50 border-b border-[#1A2433] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-500/20 border border-red-500/30 text-red-400 font-mono text-[9px] px-2 py-1 uppercase tracking-widest font-bold rounded">
                        Root Cause
                      </div>
                      <h4 className="font-bold text-sm text-white font-sans">{dep.rootCause}</h4>
                    </div>
                  </div>

                  <div className="px-5 py-5 bg-[#0B0F17] space-y-6">
                    {/* Cause → Effect → Impact chain */}
                    <div className="space-y-3 relative">
                      <div className="absolute left-6 top-6 bottom-6 w-px bg-red-200 z-0 border-l border-dashed border-red-300"></div>

                      {dep.effect && (
                        <div className="flex items-start gap-4 relative z-10 opacity-90 hover:opacity-100 transition-opacity">
                          <div className="w-12 shrink-0 flex justify-end mt-1.5">
                            <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                            </div>
                          </div>
                          <div className="flex-1 bg-amber-950/20 border border-amber-900/50 p-4 rounded-xl">
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 block mb-1">
                              Cascading Effect
                            </span>
                            <p className="text-xs font-bold text-amber-50 leading-snug">{dep.effect}</p>
                          </div>
                        </div>
                      )}

                      {/* Downstream Impact Node */}
                      <div className="flex items-start gap-4 relative z-10 pt-2">
                        <div className="w-12 shrink-0 flex justify-end mt-1.5">
                          <div className="w-6 h-6 rounded-full premium-card border premium-border flex items-center justify-center">
                            <Link className="w-3 h-3 premium-text-primary" />
                          </div>
                        </div>
                        <div className="flex-1 premium-bg-sub shadow-sm p-4 rounded-xl border premium-border">
                           <span className="text-[9px] font-mono font-bold uppercase tracking-wider premium-text-secondary block mb-1">
                              Downstream Impact
                            </span>
                            <p className="text-xs font-semibold premium-text-primary leading-snug font-sans">
                              {dep.impact}
                            </p>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-xl px-5 py-4">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">No active workflow blockers found in the current project records.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "readiness" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-1 text-white">
                <Cpu className="w-5 h-5" />
                <h3 className="font-bold font-sans text-lg">Can we use this material yet?</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-4">Every material must pass 5 checks before it is cleared for use on site.</p>
              <div className="space-y-4">
                 {intelligenceData.materialReleaseEngine?.map((item: any) => {
                  const checkList = [
                    { ok: item.checks.certificates, good: "Certificate valid", bad: "Certificate expired" },
                    { ok: item.checks.approvals, good: "Approved", bad: "Waiting for approval" },
                    { ok: item.checks.compliance, good: "Passed inspection", bad: "Failed inspection" },
                    { ok: item.checks.delivery, good: "Delivery on track", bad: "Delivery delayed" },
                    { ok: item.checks.qrScans, good: "QR verified on site", bad: "Not yet verified" },
                  ];
                  const failing = checkList.filter((c) => !c.ok).map((c) => c.bad.toLowerCase());
                  const verdict = item.decision === "READY FROM RECORDS"
                    ? { label: "READY TO USE", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                    : item.decision === "HOLD"
                    ? { label: "ON HOLD", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                    : { label: "BLOCKED", cls: "bg-red-50 text-red-700 border-red-200" };
                  return (
                  <div key={item.id} className="p-4 border border-neutral-150 rounded-xl bg-neutral-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-sm font-sans text-neutral-900">{item.name}</div>
                      <span className={`text-[9.5px] font-mono font-bold px-2 py-1 rounded-md border uppercase ${verdict.cls}`}>
                        {verdict.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 mb-3">
                      {failing.length === 0
                        ? "All 5 checks passed — cleared for use on site."
                        : `Waiting on: ${failing.join(", ")}.`}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {checkList.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          {c.ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                          <span className={c.ok ? "text-neutral-600" : "text-red-700 font-bold"}>{c.ok ? c.good : c.bad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-white">
                  <Activity className="w-5 h-5" />
                  <h3 className="font-bold font-sans text-lg">What needs attention</h3>
                </div>
                <p className="text-xs text-neutral-400 mb-4">Open issues holding materials back. Clear these to release the materials on the left.</p>
                <div className="space-y-3">
                  {intelligenceData.risks?.map((r: any) => (
                    <div key={r.id} className="p-3 border border-[#1A2433] bg-[#05070A]/50 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TrendIndicator score={r.score} />
                        <div>
                          <p className="font-bold text-xs text-white">{r.name}</p>
                          <p className="text-[10px] text-neutral-400">{r.action ? `Next step: ${r.action}` : r.category}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${r.critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.critical ? "CRITICAL" : "HIGH"}
                      </span>
                    </div>
                  ))}
                </div>
            </div>
          </div>
        )}

        {activeTab === "supplier-health" && (
          <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
            <h3 className="font-bold font-sans text-lg mb-1 text-white">Supplier Health — who delivers on time?</h3>
            <p className="text-xs text-neutral-400 mb-4">One card per supplier. The big word tells you straight away: can you rely on them?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {intelligenceData.supplierPerformance?.map((sp: any, i: number) => {
                const style = sp.risk === "High"
                  ? { word: "RISKY", dot: "bg-red-500", text: "text-red-400", card: "border-red-900/50 bg-red-500/10", meaning: "Has caused delays — avoid for time-critical materials." }
                  : sp.risk === "Medium"
                  ? { word: "WATCH", dot: "bg-amber-500", text: "text-amber-400", card: "border-amber-900/50 bg-amber-500/10", meaning: "Mixed record — keep an eye on their deliveries." }
                  : { word: "RELIABLE", dot: "bg-emerald-500", text: "text-emerald-400", card: "border-emerald-900/50 bg-emerald-500/10", meaning: "Delivers on time — safe to depend on." };
                return (
                <div key={i} className={`rounded-2xl border p-5 ${style.card}`}>
                  <div className="flex justify-between items-start gap-2">
                    <h5 className="text-base font-bold text-white font-sans">{sp.name}</h5>
                    <span className="text-[10px] font-mono bg-[#1A2433] border border-[#2a364a] text-neutral-300 px-2 py-1 rounded-lg font-bold whitespace-nowrap">
                      {sp.reliability === null ? "No deliveries yet" : `${sp.ontimeDeliveries} of ${sp.totalDeliveries} on time`}
                    </span>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${style.dot}`}></span>
                      <span className={`text-2xl font-extrabold tracking-tight ${style.text}`}>{style.word}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-extrabold text-white">{sp.reliability === null ? "—" : `${sp.reliability}%`}</span>
                      <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500">on-time</span>
                    </div>
                  </div>
                  <p className={`text-xs font-semibold mt-3 ${style.text}`}>{style.meaning}</p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Why: {sp.reason}{sp.totalDelayDays > 0 ? ` (${sp.totalDelayDays} day${sp.totalDelayDays === 1 ? "" : "s"} late total)` : ""}
                  </p>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "risk-analysis" && (
          <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
            <h3 className="font-bold font-sans text-lg mb-1 text-white">Risk Analysis — what could go wrong?</h3>
            <p className="text-xs text-neutral-400 mb-4">Open issues ranked by urgency. The longer the bar, the more urgent it is to fix.</p>
            <div className="space-y-4">
               {intelligenceData.risks?.map((risk: any) => (
                 <div key={risk.id} className="flex flex-col md:flex-row md:items-center gap-4 p-4 border border-[#1A2433] rounded-xl bg-[#05070A]/50">
                   <div className="flex-1">
                     <div className="flex items-center gap-2">
                       <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${risk.critical ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                         {risk.critical ? "CRITICAL" : "HIGH"}
                       </span>
                       <p className="text-sm font-bold text-white font-sans">{risk.name}</p>
                     </div>
                     <p className="text-xs text-neutral-400 mt-1">{risk.action ? `Next step: ${risk.action}` : risk.category}</p>
                   </div>
                   <div className="shrink-0 md:w-56">
                      <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
                        <span>Urgency</span><span>{risk.score}/100</span>
                      </div>
                      <div className="w-full bg-[#1A2433] rounded-full h-2.5 overflow-hidden">
                        <div className={`h-2.5 rounded-full ${risk.critical ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${risk.score}%` }}></div>
                      </div>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === "delivery" && (
           <div className="bg-[#0B0F17] border border-[#1A2433] rounded-2xl p-6 md:p-8 shadow-sm">
             <h3 className="font-bold font-sans text-lg mb-4 text-white">Logistics & Delivery Intelligence</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="bg-[#05070A]/50 border border-[#1A2433] rounded-xl p-4">
                <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold">Total Deliveries</span>
                <strong className="text-2xl text-white">{intelligenceData.deliveryIntelligence?.total ?? 0}</strong>
              </div>
              <div className="bg-[#05070A]/50 border border-[#1A2433] rounded-xl p-4">
                <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold">On Time</span>
                <strong className="text-2xl text-emerald-400">{intelligenceData.deliveryIntelligence?.onTime ?? 0}</strong>
              </div>
              <div className="bg-[#05070A]/50 border border-[#1A2433] rounded-xl p-4">
                <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold">Delayed</span>
                <strong className="text-2xl text-red-400">{intelligenceData.deliveryIntelligence?.delayed ?? 0}</strong>
              </div>
             </div>
             {intelligenceData.deliveryIntelligence?.delayedActions?.length ? (
              <div className="space-y-3">
                {intelligenceData.deliveryIntelligence.delayedActions.map((action: any) => (
                  <div key={action.id} className="border border-red-900/50 bg-red-500/10 rounded-xl p-4">
                    <p className="text-sm font-bold text-red-100">{action.issue}</p>
                    <p className="text-xs text-red-200/70 mt-1">Material: {action.material_name}</p>
                    <p className="text-xs text-red-200/70 mt-1">Action: {action.action}</p>
                  </div>
                ))}
              </div>
             ) : (
              <p className="text-xs text-neutral-500 italic pb-4">No delayed delivery action is currently recorded by the backend.</p>
             )}
           </div>
        )}
      </div>
    </div>
  );
}

function TrendIndicator({ score }: { score: number }) {
  if (score > 80) return <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-500" /></div>;
  return <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-500" /></div>;
}
