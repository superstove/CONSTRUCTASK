import React from "react";
import {
  X, Gauge, Layers, Activity, FileCheck, GitBranch, QrCode, ScanLine,
  MessageSquareText, ShieldCheck, ArrowRight
} from "lucide-react";

const MODULES = [
  { icon: Gauge, name: "Command Center", what: "Live project health: readiness score, risks, alerts, and an executive brief you can export." },
  { icon: Layers, name: "Project Intelligence", what: "Why things are blocked — root-cause chains, supplier performance, and delivery risks." },
  { icon: Activity, name: "Lifecycle Intelligence", what: "Each material's journey from manufacture to installation." },
  { icon: FileCheck, name: "Compliance Hub", what: "Certificates and approvals — what is valid, expiring, or overdue." },
  { icon: GitBranch, name: "Audit Trail", what: "A SHA-256 hash-chained log of every action — altering a past record breaks the chain, so tampering is detectable." },
  { icon: QrCode, name: "Product Passports", what: "A digital identity for every material: supplier, batch, certificates, carbon score." },
  { icon: ScanLine, name: "Scan Log", what: "Every QR scan on site — who scanned what, where, and the result." },
  { icon: MessageSquareText, name: "Evidence Assistant", what: "Ask questions in plain English. Answers come from live project data with proof." },
];

export default function WelcomeGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-7 py-5 flex items-start justify-between rounded-t-2xl">
          <div>
            <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest">
              Welcome to Construct Ask
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-neutral-900 font-sans mt-2.5">
              What this platform does
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors cursor-pointer"
            aria-label="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {/* The one-sentence purpose */}
          <p className="text-sm text-neutral-700 leading-relaxed">
            Every construction material has a story — who made it, who certified it, who approved
            it, and where it was installed. Today that story lives in scattered PDFs and registers
            that no one can verify.{" "}
            <strong className="text-neutral-900">
              Construct Ask turns it into a Digital Product Passport: one trusted, audit-ready
              record per material — with an AI layer that reads the evidence and tells your team
              what is blocking the project and what to fix first.
            </strong>
          </p>

          {/* How the data flows */}
          <div className="bg-neutral-50 border border-neutral-150 rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold block mb-2">
              How it works
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-neutral-700">
              <span className="bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">Material registered</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">Certificates &amp; approvals attached</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">Verified by QR scan on site</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">Passport &amp; audit trail updated</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-2.5 py-1.5">AI explains risks &amp; next actions</span>
            </div>
          </div>

          {/* Module map */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold block mb-3">
              What each section shows
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MODULES.map((m) => (
                <div key={m.name} className="flex items-start gap-3 border border-neutral-150 rounded-xl p-3 bg-white">
                  <div className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0 mt-0.5">
                    <m.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-neutral-900 block">{m.name}</span>
                    <span className="text-[11px] text-neutral-500 leading-snug block mt-0.5">{m.what}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data honesty note */}
          <div className="flex items-start gap-3 bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-emerald-900 leading-relaxed">
              <strong>Every number on screen comes from live project records</strong> — materials,
              certificates, approvals, deliveries, and scans in the database. Where evidence does
              not exist yet, the platform says <em>pending</em> instead of guessing.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-6 pb-2 relative">
            {/* Scroll Indicator (Visible mostly on small screens if needed) */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce sm:hidden text-neutral-400">
              <span className="text-[10px] font-bold uppercase tracking-widest mb-1 text-neutral-500">Scroll</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
            </div>
            <button
              onClick={onClose}
              className="relative group bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl px-6 py-3 text-sm font-bold transition-all cursor-pointer shadow-[0_0_25px_rgba(6,182,212,0.6)] hover:shadow-[0_0_40px_rgba(6,182,212,0.9)] hover:-translate-y-0.5 active:translate-y-0 ring-2 ring-cyan-400/50"
            >
              <div className="absolute inset-0 rounded-xl bg-white/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="relative z-10 flex items-center justify-center gap-2">
                Start exploring
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
            <span className="text-[11px] text-neutral-500">
              Tip: open the <strong>Evidence Assistant</strong> and ask{" "}
              <em>"What should we fix first today?"</em>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
