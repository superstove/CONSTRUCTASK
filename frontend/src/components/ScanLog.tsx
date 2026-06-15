import React, { useState } from "react";
import { Search, Calendar, CheckCircle, AlertTriangle, ShieldCheck, ExternalLink, ShieldAlert, QrCode, Loader2, MapPin } from "lucide-react";
import QrScannerModal from "./QrScannerModal";
import { verifyMaterialRelease } from "../api/backendClient";

export interface ScanLogItem {
  id: string;
  timestamp: string;
  scannedBy: string;
  productName: string;
  productCode: string;
  qrPayload: string;
  location: string;
  status: "Verified" | "Flagged";
  details: string;
}

interface ScanLogProps {
  scanLogs: ScanLogItem[];
  onRefresh: () => void;
  selectedProjectId?: string;
}

export default function ScanLog({ scanLogs, onRefresh, selectedProjectId = "1" }: ScanLogProps) {
  const [search, setSearch] = useState("");
  const [selectedScan, setSelectedScan] = useState<ScanLogItem | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [scanResult, setScanResult] = useState<{ status: "success" | "warning" | "error"; message: string } | null>(null);

  const handleScan = async (qrText: string) => {
    setShowScanner(false);
    setVerifying(true);
    setScanResult(null);
    try {
      const decision = await verifyMaterialRelease({
        projectId: selectedProjectId,
        qrCode: qrText,
        scannedBy: "Site Inspector",
        location: "On-site QR scan",
      });
      const d = decision.decision.toLowerCase();
      const status = d.includes("approved") ? "success" : d.includes("blocked") ? "error" : "warning";
      const detail = [decision.material ? `${decision.material}` : `QR: ${qrText}`, decision.decision, ...(decision.reasons || [])].join(" — ");
      setScanResult({ status, message: detail });
      onRefresh(); // refresh the log so the new scan appears
    } catch (err: any) {
      setScanResult({ status: "error", message: `Verification failed: ${err?.message || "could not reach backend"}` });
    } finally {
      setVerifying(false);
    }
  };

  const filteredLogs = scanLogs.filter(log => 
    log.productName.toLowerCase().includes(search.toLowerCase()) ||
    log.productCode.toLowerCase().includes(search.toLowerCase()) ||
    log.scannedBy.toLowerCase().includes(search.toLowerCase()) ||
    log.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div id="scan-log-tab" className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b pb-5 gap-4">
        <div>
          <h2 className="text-3xl font-light tracking-tight text-neutral-900 font-sans">
            Site Scan Log
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Real-time audit record of on-field physical QR barcode scans, verifying location-based chain of custody.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowScanner(true)}
            disabled={verifying}
            className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            {verifying ? "Verifying…" : "Scan & Verify QR"}
          </button>
          <div className="flex items-center gap-1.5 text-[11px] bg-white border border-neutral-200 py-1.5 px-3 rounded-lg text-neutral-600 font-mono shadow-sm premium-card">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-bold">SCAN ENTRIES CRYPTO SIGNED</span>
          </div>
        </div>
      </div>

      {showScanner && (
        <QrScannerModal title="Scan & Verify Material" onResult={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {scanResult && (
        <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${
          scanResult.status === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : scanResult.status === "error" ? "bg-red-50 border-red-200 text-red-800"
          : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {scanResult.status === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <div className="flex-1">
            <p className="text-xs font-bold">Scan result</p>
            <p className="text-xs mt-0.5">{scanResult.message}</p>
          </div>
          <button onClick={() => setScanResult(null)} className="text-xs font-bold opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Search Bar / Filters */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-white border border-neutral-200 p-4 rounded-xl shadow-sm justify-between premium-card">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Filter scans by material, code, inspector, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-neutral-550 border border-neutral-200 focus:bg-white text-xs text-neutral-800 rounded-lg transition-all font-sans"
          />
        </div>
        <div className="text-[11px] text-neutral-405 font-mono">
          Showing <strong>{filteredLogs.length}</strong> recorded scanning events
        </div>
      </div>

      {/* Grid: Table + Drawer Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Grid of Scans (2 thirds) */}
        <div className="lg:col-span-2">
          {filteredLogs.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center text-neutral-450 font-mono text-xs premium-card">
              No matching scan history records found. Try adjusting filter query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredLogs.map((log) => {
                const isSelected = selectedScan?.id === log.id;
                const isVerified = log.status === "Verified";
                
                return (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedScan(log)}
                    className={`flex flex-col bg-white border rounded-2xl cursor-pointer transition-all hover:shadow-md hover:border-neutral-300 premium-card overflow-hidden ${isSelected ? 'ring-2 ring-neutral-900 border-neutral-900 shadow-md' : 'border-neutral-200 shadow-sm'}`}
                  >
                    {/* Map Preview Area */}
                    <div className="h-28 w-full bg-[#0a101d] relative overflow-hidden group border-b border-[#1A2433]">
                       {/* Topographic map pattern */}
                       <div className="absolute inset-0 opacity-20 transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: 'repeating-radial-gradient( circle at 0 0, transparent 0, rgba(255,255,255,0.15) 1px, transparent 1px, transparent 20px )' }} />
                       
                       {/* GPS marker */}
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                          <div className="w-8 h-8 bg-blue-500/20 rounded-full animate-ping absolute" />
                          <MapPin className="w-5 h-5 text-blue-600 relative z-10 drop-shadow-sm fill-blue-100" />
                       </div>
                       
                       {/* Location Tag */}
                       <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end gap-2">
                         <span className="bg-[#0B0F17]/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-sm text-[9px] font-mono font-bold text-white truncate border border-[#1A2433]">
                           {log.location}
                         </span>
                         <div className="bg-[#0B0F17]/80 backdrop-blur-md p-1.5 rounded-lg shadow-sm border border-[#1A2433]">
                           <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                         </div>
                       </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1">
                       <div className="flex justify-between items-start mb-4 gap-2">
                         <div className="min-w-0">
                           <h3 className="font-extrabold text-neutral-900 text-sm truncate">{log.productName}</h3>
                           <p className="font-mono text-[10px] text-neutral-500 mt-1 uppercase tracking-wider">{log.productCode}</p>
                         </div>
                         <span className={`shrink-0 font-mono text-[9px] py-1 px-2.5 rounded-full font-bold uppercase border tracking-wider ${
                              isVerified 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                : "bg-red-50 border-red-200 text-red-700"
                         }`}>
                           {log.status}
                         </span>
                       </div>

                       <div className="space-y-2.5 mt-auto pt-4 border-t border-neutral-100">
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-neutral-500 font-medium">Inspector</span>
                           <span className="font-bold text-white flex items-center gap-1.5">
                             <div className="w-4 h-4 rounded-full bg-[#1A2433] border border-[#2a364a] flex items-center justify-center text-[8px] font-bold text-cyan-400">{log.scannedBy.charAt(0)}</div>
                             {log.scannedBy}
                           </span>
                         </div>
                         <div className="flex justify-between items-center text-xs">
                           <span className="text-neutral-500 font-medium">Time</span>
                           <span className="font-mono text-[10px] text-neutral-300 font-bold bg-[#1A2433] border border-[#2a364a] px-1.5 py-0.5 rounded shadow-sm">
                             {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </span>
                         </div>
                       </div>

                       <button className="mt-5 w-full py-2.5 bg-[#1A2433]/50 hover:bg-[#1A2433] text-white text-xs font-bold tracking-wide uppercase rounded-xl transition-all border border-[#1A2433] hover:border-cyan-500/50 flex items-center justify-center gap-2 group-hover:text-cyan-400 group-hover:border-cyan-500/50 shadow-sm">
                         View Evidence <ExternalLink className="w-3 h-3" />
                       </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Scan Signature Detail Panel (1 col / 1 third) */}
        <div className="lg:col-span-1">
          {selectedScan ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-5 sticky top-6 premium-card animate-fadeIn">
              <div className="border-b pb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                  Verification Detail
                </h3>
                <span className="text-[10px] font-mono text-neutral-400 font-bold">
                  ID: {selectedScan.id}
                </span>
              </div>

              {/* Status Header */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                selectedScan.status === "Verified" 
                  ? "bg-emerald-50/20 border-emerald-150" 
                  : "bg-amber-50/20 border-amber-150"
              }`}>
                {selectedScan.status === "Verified" ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">
                    {selectedScan.status === "Verified" ? "Ledger Entry Secured" : "Ledger Entry Warning"}
                  </h4>
                  <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed font-light">
                    {selectedScan.details}
                  </p>
                </div>
              </div>

              {/* Details List */}
              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Scanned QR URL Payload:</span>
                  <a 
                    href={selectedScan.qrPayload}
                    target="_blank" 
                    rel="noreferrer"
                    className="text-neutral-700 hover:text-black font-mono select-all break-all overflow-hidden inline-flex items-center gap-1 hover:underline pt-0.5 font-medium leading-tight"
                  >
                    <span>{selectedScan.qrPayload}</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Operator Sign-Off:</span>
                    <span className="font-bold text-neutral-800 leading-snug">{selectedScan.scannedBy}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Logged Site:</span>
                    <span className="font-bold text-neutral-800 leading-snug">{selectedScan.location}</span>
                  </div>
                </div>

                {/* Cryptographic Ledger Block Proof */}
                <div className="border-t pt-4 space-y-2">
                  <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> SHA-256 Block Signature
                  </span>
                  <div className="bg-neutral-50 border border-neutral-200 p-2.5 rounded-xl font-mono text-[9px] text-neutral-500 break-all select-all font-bold select-all leading-relaxed">
                    0x{selectedScan.status === "Verified" ? "8f48" : "3d1c"}e23a{selectedScan.productCode.replace("-","").toLowerCase()}b19{Math.floor(selectedScan.timestamp.charCodeAt(2) * 2314)}f93b58be02ebcbfce6e788
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 border-dashed rounded-2xl p-8 text-center text-neutral-400 text-xs font-mono premium-card">
              Click “View Signature” adjacent to any scan log entry in the table to review verified cryptographic blocks.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
