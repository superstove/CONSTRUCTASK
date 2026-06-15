import React, { useState, useEffect } from "react";
import { ProductPassport, ComplianceCertificate } from "../types";
import { verifyMaterialRelease, verifyDppMaterial, DppVerification } from "../api/backendClient";
import QrScannerModal from "./QrScannerModal";
import { 
  QrCode, 
  Search, 
  User, 
  MapPin, 
  CheckSquare, 
  Square, 
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileCheck2,
  Building
} from "lucide-react";

interface VerifyMaterialProps {
  passports: ProductPassport[];
  certificates: ComplianceCertificate[];
  selectedProjectId: string;
  onAuthorizeRelease: (passportId: string, updatedStage: string, details: string, operator: string) => void;
  onAddScanLog: (scan: {
    id: string;
    timestamp: string;
    scannedBy: string;
    productName: string;
    productCode: string;
    qrPayload: string;
    location: string;
    status: "Verified" | "Flagged";
    details: string;
  }) => void;
}

export default function VerifyMaterial({ 
  passports, 
  certificates, 
  selectedProjectId,
  onAuthorizeRelease,
  onAddScanLog
}: VerifyMaterialProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPassportId, setSelectedPassportId] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [scannedBy, setScannedBy] = useState("Anand AK");
  const [siteLocation, setSiteLocation] = useState("Sector-3 Slope Face, IN");
  
  // Checklist states
  const [checklist, setChecklist] = useState({
    packagingDry: false,
    batchMatches: false,
    invoiceMatched: false,
    visualPassed: false,
  });

  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    status: "success" | "warning" | "error" | null;
    message: string;
    expiredCerts: ComplianceCertificate[];
  }>({ status: null, message: "", expiredCerts: [] });

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [crypto, setCrypto] = useState<DppVerification | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);

  const handleVerifySignature = async () => {
    if (!selectedPassportId) return;
    setCryptoLoading(true);
    setCrypto(null);
    try {
      setCrypto(await verifyDppMaterial(selectedPassportId));
    } catch (err) {
      console.error("DPP signature verification failed:", err);
    } finally {
      setCryptoLoading(false);
    }
  };

  // Reset the crypto panel whenever the selected material changes.
  useEffect(() => { setCrypto(null); }, [selectedPassportId]);

  // When a QR is scanned: fill the payload and auto-select a matching passport.
  const handleScanResult = (text: string) => {
    setShowScanner(false);
    setQrPayload(text);
    const match = passports.find(
      (p) => p.qrPayload === text || text.includes(p.code) || p.code === text.replace(/^QR-/, "")
    );
    if (match) setSelectedPassportId(match.id);
  };

  // Auto-fill QR payload when selected passport changes
  useEffect(() => {
    if (selectedPassportId) {
      const p = passports.find(pp => pp.id === selectedPassportId);
      if (p) {
        setQrPayload(p.qrPayload || `constructask://passport/${p.code}`);
      }
    } else {
      setQrPayload("");
    }
    setCheckResult({ status: null, message: "", expiredCerts: [] });
    setIsAuthorized(false);
  }, [selectedPassportId, passports]);

  const toggleChecklist = (field: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const selectedPassport = passports.find(p => p.id === selectedPassportId);
  // Real cert-expiry check for the selected material (no hardcoding).
  const selectedCertExpired = !!selectedPassport && certificates.some(
    (c) => c.scope?.includes(selectedPassport.name) && String(c.status).toLowerCase() === "expired"
  );

  const handleCheckRelease = async () => {
    if (!selectedPassportId) {
      setCheckResult({
        status: "error",
        message: "Please select a material passport to verify.",
        expiredCerts: []
      });
      return;
    }

    setIsChecking(true);
    setCheckResult({ status: null, message: "", expiredCerts: [] });
    setIsAuthorized(false);

    try {
      const isChecklistComplete = Object.values(checklist).every(Boolean);
      if (!isChecklistComplete) {
        setCheckResult({
          status: "error",
          message: "Awaiting physical site checks. All checklist inspection rules must be marked as passed before the backend release decision is accepted.",
          expiredCerts: []
        });
        return;
      }

      const decision = await verifyMaterialRelease({
        projectId: selectedProjectId,
        qrCode: qrPayload || selectedPassport?.qrPayload || "",
        scannedBy,
        location: siteLocation,
      });

      const decisionText = decision.decision.toLowerCase();
      const status =
        decisionText.includes("approved") ? "success" :
        decisionText.includes("blocked") ? "error" :
        "warning";

      const backendSummary = [
        `BACKEND RELEASE DECISION: ${decision.decision}`,
        decision.material ? `Material: ${decision.material}` : null,
        decision.batch_number ? `Batch: ${decision.batch_number}` : null,
        ...(decision.reasons || []),
        ...(decision.checks || []).map((check) => `${check.label}: ${check.status} - ${check.detail}`),
      ].filter(Boolean).join("\n");

      setCheckResult({
        status,
        message: backendSummary,
        expiredCerts: []
      });
    } catch (err: any) {
      setCheckResult({
        status: "error",
        message: `Backend release check failed: ${err?.message || "Unable to reach ConstructAsk API."}`,
        expiredCerts: []
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleAuthorizeRelease = (status: "Verified" | "Flagged") => {
    if (!selectedPassport) return;

    const newScanId = "SCAN-" + Math.floor(100000 + Math.random() * 900000);
    const dateStr = new Date().toISOString();

    const scanDetails = status === "Verified" 
      ? `Authorized site release check successful by ${scannedBy} at ${siteLocation}.`
      : `Flagged non-compliant behavior detected: expired certificate found or visual QA failed.`;

    // 1. Add to Scan Log
    onAddScanLog({
      id: newScanId,
      timestamp: dateStr,
      scannedBy,
      productName: selectedPassport.name,
      productCode: selectedPassport.code,
      qrPayload: qrPayload,
      location: siteLocation,
      status: status,
      details: scanDetails
    });

    // 2. Trigger Blockchain Hook / App Stage Update on Backend
    const nextStage = status === "Verified" ? "Verified" : "Delivered"; 
    onAuthorizeRelease(selectedPassport.id, nextStage, scanDetails, scannedBy);

    // Reset fields
    setIsAuthorized(true);
    setCheckResult({
      status: "success",
      message: status === "Verified" 
        ? `Ledger block signed! Physical material released to site installation at ${siteLocation}.` 
        : `Non-compliance reported. Materials flagged in central ledger workspace.`,
      expiredCerts: []
    });

    // Reset Checklist
    setChecklist({
      packagingDry: false,
      batchMatches: false,
      invoiceMatched: false,
      visualPassed: false,
    });
  };

  const filteredPassports = passports.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="verify-material-tab" className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen transition-all">
      {showScanner && (
        <QrScannerModal title="Scan Material QR" onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      )}
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <h2 className="text-3xl font-light tracking-tight text-neutral-900 font-sans">
          Material Release Decision Engine
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Verify Certificates, Approvals, Compliance bounds, QR validation, and Supplier health status to generate a final site release decision.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Form: Parameters (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-5 premium-card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 border-b pb-3">
              Site Verification Parameters
            </h3>

            {/* Step 1: Search and Select Material */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                1. Select Registered Material Passport
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400" />
                <input 
                  type="text"
                  placeholder="Type material name or batch code (e.g. NH66)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white text-xs text-neutral-800 transition-all font-sans"
                />
              </div>

              {/* Suggestions List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pt-1">
                {filteredPassports.map((p) => {
                  const isSelected = selectedPassportId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPassportId(p.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected 
                          ? "border-neutral-900 bg-neutral-50 font-bold" 
                          : "border-neutral-150 bg-white hover:border-neutral-400 text-neutral-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-800">{p.name}</span>
                        <span className="text-[9.5px] font-mono bg-neutral-100 py-0.5 px-1.5 rounded text-neutral-400 border block">
                          {p.code}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-400 mt-1">{p.manufacturer}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Input QR Payload */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                2. Input QR Data / Scan Payload
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <QrCode className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Auto-filled from selection or enter QR link..."
                    value={qrPayload}
                    onChange={(e) => setQrPayload(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white text-xs font-mono text-neutral-800 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1.5 bg-black text-white rounded-xl px-4 text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <QrCode className="w-4 h-4" /> Scan QR
                </button>
              </div>
            </div>

            {/* Cryptographic passport verification (the DPP differentiator) */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                Cryptographic Passport Verification
              </label>
              <button
                type="button"
                onClick={handleVerifySignature}
                disabled={!selectedPassportId || cryptoLoading}
                className="flex items-center gap-2 bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                {cryptoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {cryptoLoading ? "Verifying signature…" : "Verify Passport Signature"}
              </button>

              {crypto && (
                <div className={`border rounded-xl p-4 ${
                  crypto.verdict === "AUTHENTIC" ? "bg-emerald-50 border-emerald-200"
                  : crypto.verdict === "TAMPERED" ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {crypto.verdict === "AUTHENTIC"
                      ? <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      : <ShieldAlert className="w-5 h-5 text-red-600" />}
                    <span className={`text-sm font-extrabold tracking-tight ${
                      crypto.verdict === "AUTHENTIC" ? "text-emerald-800"
                      : crypto.verdict === "TAMPERED" ? "text-red-800" : "text-amber-800"
                    }`}>
                      🔐 {crypto.verdict === "AUTHENTIC" ? "AUTHENTIC" : crypto.verdict === "TAMPERED" ? "TAMPERED" : "UNTRUSTED ISSUER"}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-700 mt-2 leading-relaxed">{crypto.reason}</p>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] font-mono text-neutral-600">
                    <div><span className="text-neutral-400 uppercase block">Issuer</span>{crypto.issuer_name}</div>
                    <div><span className="text-neutral-400 uppercase block">Algorithm</span>{crypto.algorithm}</div>
                    <div><span className="text-neutral-400 uppercase block">Key fingerprint</span>{crypto.key_fingerprint}</div>
                    <div><span className="text-neutral-400 uppercase block">Signature</span>{crypto.signature_preview}</div>
                  </div>
                  <p className="text-[9.5px] text-neutral-400 mt-3 leading-snug">
                    Verified by Ed25519 signature against the accredited trust registry — no database lookup required. Changing any signed field (batch, supplier, quantity) breaks this signature.
                  </p>
                </div>
              )}
            </div>

            {/* Step 3: Scanned By & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                  3. Scanned By
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400" />
                  <input 
                    type="text" 
                    value={scannedBy}
                    onChange={(e) => setScannedBy(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white text-xs font-sans text-neutral-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                  4. Site Destination Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400" />
                  <select 
                    value={siteLocation}
                    onChange={(e) => setSiteLocation(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white text-xs font-sans text-neutral-800 appearance-none"
                  >
                    <option value="Sector-3 Slope Face, IN">Sector-3 Slope Face, IN</option>
                    <option value="Western Ghats Segment KM-12.4">Western Ghats Segment KM-12.4</option>
                    <option value="Kochi Metro Bridge Area B">Kochi Metro Bridge Area B</option>
                    <option value="NH66 Main Central Yards">NH66 Main Central Yards</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Step 5: QA Checklist */}
            <div className="space-y-3.5 pt-2">
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block">
                5. On-site Physical Checklist Inspections
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => toggleChecklist("packagingDry")}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left cursor-pointer ${
                    checklist.packagingDry 
                      ? "border-emerald-200 bg-emerald-50/20 text-emerald-900" 
                      : "border-neutral-150 hover:bg-neutral-50"
                  }`}
                >
                  {checklist.packagingDry ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-450 shrink-0" />
                  )}
                  <span className="text-xs font-medium">Physical packaging undamaged & dry</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleChecklist("batchMatches")}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left cursor-pointer ${
                    checklist.batchMatches 
                      ? "border-emerald-200 bg-emerald-50/20 text-emerald-900" 
                      : "border-neutral-150 hover:bg-neutral-50"
                  }`}
                >
                  {checklist.batchMatches ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-450 shrink-0" />
                  )}
                  <span className="text-xs font-medium">Batch markings match registered passport</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleChecklist("invoiceMatched")}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left cursor-pointer ${
                    checklist.invoiceMatched 
                      ? "border-emerald-200 bg-emerald-50/20 text-emerald-900" 
                      : "border-neutral-150 hover:bg-neutral-50"
                  }`}
                >
                  {checklist.invoiceMatched ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-450 shrink-0" />
                  )}
                  <span className="text-xs font-medium">Physical delivery invoice matched</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleChecklist("visualPassed")}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left cursor-pointer ${
                    checklist.visualPassed 
                      ? "border-emerald-200 bg-emerald-50/20 text-emerald-900" 
                      : "border-neutral-150 hover:bg-neutral-50"
                  }`}
                >
                  {checklist.visualPassed ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-450 shrink-0" />
                  )}
                  <span className="text-xs font-medium">Visual inspection check passed</span>
                </button>
              </div>
            </div>

              {/* Execute Check Button */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleCheckRelease}
                disabled={isChecking || isAuthorized}
                className="w-full bg-black hover:bg-neutral-800 text-white font-bold py-3 px-4 rounded-xl text-[11px] uppercase tracking-widest transition-colors disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Analyzing engines & rules...</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="w-4.5 h-4.5 text-white" />
                    <span>Generate Final Release Decision</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* Right Info: Selected Materials Compliance Overview (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-5 premium-card">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 border-b pb-3 font-mono">
              Material Context Review
            </h3>

            {selectedPassport ? (
              <div className="space-y-4">
                {/* Product General info */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-neutral-800 text-sm">{selectedPassport.name}</span>
                    <span className="font-mono text-[9px] bg-neutral-100 border text-neutral-400 py-0.5 px-2 rounded">
                      {selectedPassport.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Building className="w-3.5 h-3.5" />
                    <span>{selectedPassport.manufacturer}</span>
                  </div>
                </div>

                {/* Pre-flight Checks checklist mimicking the Decision Engine reqs */}
                <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl text-xs space-y-3">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase block mb-1">Material Record Checks</span>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Certificate Validity</span>
                      {selectedCertExpired
                        ? <span className="text-red-600 font-bold font-mono">EXPIRED</span>
                        : <span className="text-emerald-600 font-bold font-mono">VALID</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Compliance Rating</span>
                      <span className="text-neutral-800 font-bold font-mono">{selectedPassport.complianceRating || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Current Stage</span>
                      <span className="text-neutral-800 font-bold font-mono uppercase">{selectedPassport.currentStage || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Standards Recorded</span>
                      <span className="text-neutral-800 font-bold font-mono">{selectedPassport.standards?.length ?? 0}</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-neutral-400 leading-snug pt-1">Authoritative verdict comes from the live release decision below.</p>
                </div>

                <div className="bg-neutral-550 border border-neutral-150 p-3.5 rounded-xl text-xs space-y-2 leading-relaxed">
                  <div>
                    <span className="text-[10px] text-neutral-400 font-bold uppercase block mb-0.5">Physical Composition:</span>
                    <span className="text-neutral-700 italic">"{selectedPassport.composition}"</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
                    <div>
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Compliance Rating</span>
                      <span className="font-bold text-emerald-700">{selectedPassport.complianceRating} Grade</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Current Stage</span>
                      <span className="font-bold text-neutral-700 font-mono text-[10px] uppercase">{selectedPassport.currentStage}</span>
                    </div>
                  </div>
                </div>

                {/* Validation Rules */}
                <div className="space-y-2">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Required Standards:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPassport.standards.map((std, i) => (
                      <span key={i} className="text-[10px] bg-neutral-100 border text-neutral-500 font-bold py-1 px-2.5 rounded-lg font-mono">
                        {std}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-neutral-400 text-xs font-mono">
                No material selected. Select a passport coupon on the left to review its registered certificates.
              </div>
            )}
          </div>

          {/* Verification Results Console */}
          {checkResult.status && (
            <div className={`border rounded-2xl p-6 shadow-sm space-y-4 animate-fadeIn ${
              checkResult.status === "success" 
                ? "bg-emerald-50/20 border-emerald-250" 
                : checkResult.status === "warning"
                  ? "bg-amber-50/20 border-amber-250"
                  : "bg-red-50/20 border-red-250"
            }`}>
              <div className="flex items-start gap-3">
                {checkResult.status === "success" && <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
                {checkResult.status === "warning" && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                {checkResult.status === "error" && <ShieldAlert className="w-5 h-5 text-red-650 shrink-0 mt-0.5" />}
                
                <div className="space-y-1.5 flex-1">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${
                    checkResult.status === "success" ? "text-emerald-800" : checkResult.status === "warning" ? "text-amber-800" : "text-red-800"
                  }`}>
                    {checkResult.status === "success" ? "Verification OK" : checkResult.status === "warning" ? "Compliance Alert" : "Validation Blocked"}
                  </h4>
                  <p className="text-xs text-neutral-650 leading-relaxed font-light">
                    {checkResult.message}
                  </p>
                </div>
              </div>

              {/* Action buttons (Authorize Site Release or report) */}
              {!isAuthorized && checkResult.status !== "error" && (
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-neutral-200/50">
                  <button
                    onClick={() => handleAuthorizeRelease(checkResult.status === "success" ? "Verified" : "Flagged")}
                    className={`flex-1 font-bold py-2 px-3.5 rounded-lg text-xs uppercase tracking-wider text-white transition-colors cursor-pointer text-center ${
                      checkResult.status === "success" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    Authorize Release to Site
                  </button>
                  <button
                    onClick={() => handleAuthorizeRelease("Flagged")}
                    className="bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 font-bold py-2 px-3.5 rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                  >
                    Flag Non-Compliance
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
