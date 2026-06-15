import React, { useState, useEffect, useRef } from 'react';
import { Search, Package, Shield, Activity, FileCheck, X, FileText, ArrowRight } from 'lucide-react';
import { ProductPassport, ComplianceCertificate, AuditBlock } from '../types';
import { FrontendApproval } from '../api/backendClient';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  passports: ProductPassport[];
  certificates: ComplianceCertificate[];
  approvals: FrontendApproval[];
  auditTrail: AuditBlock[];
  onNavigate: (tab: string, query?: string) => void;
}

export default function GlobalSearchModal({
  isOpen,
  onClose,
  passports,
  certificates,
  approvals,
  auditTrail,
  onNavigate
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Search logic
  const lowerQuery = query.toLowerCase();
  
  const filteredPassports = query ? passports.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) || 
    p.code.toLowerCase().includes(lowerQuery) ||
    p.manufacturer.toLowerCase().includes(lowerQuery)
  ).slice(0, 5) : [];

  const filteredCerts = query ? certificates.filter(c => 
    c.name.toLowerCase().includes(lowerQuery) || 
    c.issuer.toLowerCase().includes(lowerQuery) ||
    c.scope.toLowerCase().includes(lowerQuery)
  ).slice(0, 5) : [];

  const filteredApprovals = query ? approvals.filter(a => 
    a.approval_type.toLowerCase().includes(lowerQuery) || 
    a.approver.toLowerCase().includes(lowerQuery) ||
    (a.material_name || "").toLowerCase().includes(lowerQuery)
  ).slice(0, 5) : [];

  const filteredAudit = query ? auditTrail.filter(a => 
    a.action.toLowerCase().includes(lowerQuery) || 
    a.details.toLowerCase().includes(lowerQuery) ||
    a.operator.toLowerCase().includes(lowerQuery)
  ).slice(0, 5) : [];

  const hasResults = query && (filteredPassports.length > 0 || filteredCerts.length > 0 || filteredApprovals.length > 0 || filteredAudit.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 sm:px-6 bg-[#05070A]/80 backdrop-blur-sm transition-opacity">
      {/* Click away overlay */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#0B0F17]/95 backdrop-blur-xl border border-[#1A2433] shadow-2xl shadow-black/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Search Input Area */}
        <div className="flex items-center px-4 border-b border-[#1A2433]">
          <Search className="w-5 h-5 text-cyan-500 shrink-0 animate-pulse drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-0 py-5 pl-4 pr-4 text-white text-lg placeholder-neutral-500 focus:ring-0 outline-none font-sans"
            placeholder="Search materials, certificates, approvals, audits..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            onClick={onClose}
            className="shrink-0 p-1 rounded-md text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <div className="px-6 py-12 text-center text-neutral-400">
              <p className="text-sm font-medium">Type a keyword to start searching.</p>
              <div className="flex justify-center gap-4 mt-6">
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 bg-[#05070A] px-3 py-1.5 rounded-full border border-[#1A2433]">
                  <Package className="w-3.5 h-3.5" /> Materials
                </div>
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 bg-[#05070A] px-3 py-1.5 rounded-full border border-[#1A2433]">
                  <Shield className="w-3.5 h-3.5" /> Certificates
                </div>
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 bg-[#05070A] px-3 py-1.5 rounded-full border border-[#1A2433]">
                  <Activity className="w-3.5 h-3.5" /> Audit Logs
                </div>
              </div>
            </div>
          )}

          {query && !hasResults && (
            <div className="px-6 py-12 text-center text-neutral-500 text-sm">
              No results found for "<span className="font-bold text-white">{query}</span>"
            </div>
          )}

          {hasResults && (
            <div className="p-2 space-y-4">
              
              {filteredPassports.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-1 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" /> Product Passports
                  </h3>
                  <div className="space-y-0.5">
                    {filteredPassports.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => {
                          onNavigate("passports", p.id);
                          onClose();
                        }}
                        className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <div>
                          <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{p.name}</span>
                          <span className="text-xs text-neutral-500 ml-2 font-mono">{p.code}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredCerts.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-1 flex items-center gap-1.5 mt-2">
                    <Shield className="w-3.5 h-3.5" /> Certificates
                  </h3>
                  <div className="space-y-0.5">
                    {filteredCerts.map(c => (
                      <button 
                        key={c.id}
                        onClick={() => {
                          onNavigate("compliance");
                          onClose();
                        }}
                        className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <div>
                          <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{c.name}</span>
                          <span className="text-xs text-neutral-500 ml-2 hidden sm:inline-block">({c.scope})</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${c.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#1A2433] text-neutral-400'}`}>{c.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredApprovals.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-1 flex items-center gap-1.5 mt-2">
                    <FileCheck className="w-3.5 h-3.5" /> Approvals
                  </h3>
                  <div className="space-y-0.5">
                    {filteredApprovals.map(a => (
                      <button 
                        key={a.id}
                        onClick={() => {
                          onNavigate("compliance");
                          onClose();
                        }}
                        className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <div>
                          <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{a.approval_type}</span>
                          <span className="text-xs text-neutral-500 ml-2">({a.material_name})</span>
                        </div>
                        <span className="text-xs text-neutral-500">{a.approver}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredAudit.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-1 flex items-center gap-1.5 mt-2">
                    <Activity className="w-3.5 h-3.5" /> Audit Trail
                  </h3>
                  <div className="space-y-0.5">
                    {filteredAudit.map((a, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          onNavigate("audit");
                          onClose();
                        }}
                        className="w-full text-left flex flex-col justify-center px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{a.action.replace(/_/g, " ")}</span>
                          <span className="text-[10px] font-mono text-neutral-500">{new Date(a.timestamp).toLocaleDateString()}</span>
                        </div>
                        <span className="text-xs text-neutral-500 truncate block w-full mt-0.5">{a.details}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1A2433] bg-[#05070A]/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="flex items-center justify-center w-5 h-5 bg-[#1A2433] border border-[#1A2433] text-white/80 rounded shadow-sm text-[10px] font-mono font-bold">↑↓</span>
            <span className="text-[10px] font-medium uppercase tracking-widest">Navigate</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="flex items-center justify-center px-1.5 h-5 bg-[#1A2433] border border-[#1A2433] text-white/80 rounded shadow-sm text-[10px] font-mono font-bold">esc</span>
            <span className="text-[10px] font-medium uppercase tracking-widest">Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
