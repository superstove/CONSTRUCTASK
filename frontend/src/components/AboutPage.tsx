import React from "react";
import {
  Building,
  Code2,
  User,
  Clock,
  Layers,
  Shield,
  Activity,
  FileCheck,
  Network,
  ShieldCheck,
  MessageSquareCode,
  Gauge,
  ExternalLink,
  Sparkles,
} from "lucide-react";

const modules = [
  { name: "Command Center", icon: Gauge, description: "Executive dashboard with real-time project health metrics and digital twin visualization." },
  { name: "Product Passports (DPP)", icon: Building, description: "Full Digital Product Passport lifecycle — origin, compliance, sustainability, and audit chain." },
  { name: "Supplier Health", icon: Activity, description: "Supplier reliability scoring, on-time delivery analytics, and risk profiling." },
  { name: "Audit Trail", icon: Network, description: "Immutable, hash-linked audit ledger with verifiable evidence chain." },
  { name: "Compliance Hub", icon: FileCheck, description: "Certificate registry, approval workflows, and compliance review management." },
  { name: "Risk Analysis", icon: Shield, description: "Automated risk scoring, urgency ranking, and cascading impact analysis." },
  { name: "Delivery Intelligence", icon: Layers, description: "Logistics tracking, delay alerts, and supplier delivery performance." },
  { name: "Scan Log", icon: ShieldCheck, description: "QR-based material verification with GPS-tagged scan history." },
  { name: "Evidence Assistant", icon: MessageSquareCode, description: "AI-powered compliance Q&A with context-aware project intelligence." },
];

export default function AboutPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-10 w-full min-h-full pb-32 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-500 bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 mb-3">
            <Sparkles className="w-3 h-3" /> About This Platform
          </span>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight premium-text-primary">
            Construct Ask
          </h1>
          <p className="text-sm premium-text-secondary mt-1.5 max-w-xl">
            An enterprise-grade construction compliance and material traceability platform — 
            engineered for real-world infrastructure project management.
          </p>
        </div>
        <div className="shrink-0">
          <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl px-5 py-3 text-center">
            <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 block font-bold">Custom Solution For</span>
            <span className="text-sm font-extrabold text-white mt-0.5 block">Anton Solutions</span>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {[
          { icon: Code2, label: "Project", value: "Construct Ask", sub: "Construction DPP Platform" },
          { icon: Building, label: "Client", value: "Anton Solutions", sub: "Infrastructure & Engineering" },
          { icon: User, label: "Developer", value: "Abhijith AK", sub: "Full-Stack Engineer" },
          { icon: Clock, label: "Development", value: "2 Months", sub: "Design → Deployment" },
        ].map((item, i) => (
          <div key={i} className="premium-card rounded-2xl p-6 border premium-border relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/5 to-transparent rounded-bl-full" />
            <item.icon className="w-5 h-5 text-cyan-500 mb-3" />
            <span className="text-[9px] font-mono uppercase tracking-widest premium-text-secondary font-bold block">{item.label}</span>
            <h3 className="text-lg font-extrabold premium-text-primary mt-1">{item.value}</h3>
            <p className="text-[11px] premium-text-secondary mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Modules Section */}
      <div className="premium-card rounded-2xl border premium-border p-6 md:p-8 mb-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold premium-text-primary">Platform Modules</h2>
            <p className="text-[11px] premium-text-secondary">9 integrated modules powering end-to-end construction compliance</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border premium-border bg-[var(--theme-bg-page)]/50 hover:border-cyan-500/30 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                  <mod.icon className="w-4 h-4 text-cyan-500" />
                </div>
                <h4 className="text-xs font-bold premium-text-primary">{mod.name}</h4>
              </div>
              <p className="text-[11px] premium-text-secondary leading-relaxed">{mod.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div className="premium-card rounded-2xl border premium-border p-6 md:p-8 mb-10">
        <h2 className="text-lg font-extrabold premium-text-primary mb-5">Technology Stack</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: "React + TypeScript", category: "Frontend" },
            { name: "Tailwind CSS", category: "Styling" },
            { name: "FastAPI (Python)", category: "Backend" },
            { name: "SQLite / PostgreSQL", category: "Database" },
            { name: "Framer Motion", category: "Animations" },
            { name: "Supabase Auth", category: "Authentication" },
            { name: "OpenAI / Gemini", category: "AI Engine" },
            { name: "Vite", category: "Build Tool" },
          ].map((tech, i) => (
            <div key={i} className="p-3 rounded-xl border premium-border text-center">
              <span className="text-[9px] font-mono uppercase tracking-widest premium-text-secondary font-bold block">{tech.category}</span>
              <span className="text-xs font-bold premium-text-primary mt-1 block">{tech.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Credit */}
      <div className="text-center py-8 border-t premium-border">
        <p className="text-xs premium-text-secondary font-mono">
          © {new Date().getFullYear()} <span className="font-bold premium-text-primary">Construct Ask</span>
        </p>
        <p className="text-[11px] premium-text-secondary mt-1">
          Designed & Developed by <span className="font-bold text-cyan-500">Abhijith AK</span> for <span className="font-bold premium-text-primary">Anton Solutions</span>
        </p>
      </div>
    </div>
  );
}
