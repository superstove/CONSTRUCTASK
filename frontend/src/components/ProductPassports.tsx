import React, { useState, useEffect } from "react";
import { ProductPassport, ComplianceCertificate, Project } from "../types";
import VerifyMaterial from "./VerifyMaterial";
import { calculateDppMetrics } from "../utils/projectMetrics";
import { dppQrPngUrl } from "../api/backendClient";
import { 
  Building, 
  Leaf, 
  ShieldCheck, 
  QrCode, 
  Lock, 
  MapPin, 
  PlusCircle, 
  ArrowRight,
  Search,
  CheckCircle,
  AlertTriangle,
  User,
  CheckSquare,
  Square,
  Loader2,
  FileCheck2,
  Activity,
  Network,
  Cpu,
  Layers,
  FileText,
  Truck
} from "lucide-react";

interface ProductPassportsProps {
  passports: ProductPassport[];
  certificates: ComplianceCertificate[];
  project: Project | null;
  selectedProjectId: string;
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onUpdateStage: (id: string, stage: string, details: string, operator?: string) => Promise<void>;
  isUpdating: boolean;
  onCreateMaterial?: (material: { name: string; batch_id: string; supplier: string; category?: string }) => Promise<void>;
  requestedSubTab?: string | null;
}

export default function ProductPassports({
  passports,
  certificates,
  project,
  selectedProjectId,
  selectedId,
  onSelectId,
  onUpdateStage,
  isUpdating,
  onCreateMaterial,
  requestedSubTab,
}: ProductPassportsProps) {
  // Sub-tabs management
  type SubTab = "overview" | "registry" | "verify" | "explorer" | "supplier" | "lifecycle";
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("registry");

  // Jump to a sub-tab when the sidebar requests one.
  useEffect(() => {
    const sub = requestedSubTab?.split("#")[0];
    const valid: SubTab[] = ["overview", "registry", "verify", "explorer", "supplier", "lifecycle"];
    if (sub && (valid as string[]).includes(sub)) {
      setActiveSubTab(sub as SubTab);
    }
  }, [requestedSubTab]);
  
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [sustainabilityTier, setSustainabilityTier] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  // QR Verification local states
  const [qrSelectedId, setQrSelectedId] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [scannedBy, setScannedBy] = useState("Anand AK");
  const [siteLocation, setSiteLocation] = useState("Sector-3 Slope Face, IN");
  
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

  // Manual Stage updates form inside the sheet
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventStage, setEventStage] = useState<string>("");
  const [eventOperator, setEventOperator] = useState("");
  const [eventDetails, setEventDetails] = useState("");

  // Add Material modal states
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialBatch, setNewMaterialBatch] = useState("");
  const [newMaterialSupplier, setNewMaterialSupplier] = useState("");
  const [newMaterialCategory, setNewMaterialCategory] = useState("general");
  const [isCreating, setIsCreating] = useState(false);

  const activePassport = passports.find(p => p.id === (selectedId || passports[0]?.id)) || passports[0];

  // Auto fill QR properties when QR select changes
  useEffect(() => {
    if (qrSelectedId) {
      const p = passports.find(pp => pp.id === qrSelectedId);
      if (p) {
        setQrPayload(p.qrPayload || `constructask://passport/${p.code}`);
      }
    } else {
      setQrPayload("");
    }
    setCheckResult({ status: null, message: "", expiredCerts: [] });
    setIsAuthorized(false);
  }, [qrSelectedId, passports]);

  const toggleChecklist = (field: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePassport || !eventStage) return;

    await onUpdateStage(
      activePassport.id, 
      eventStage, 
      eventDetails || `Manual inspection logged by ${eventOperator || "authorized auditor"}.`,
      eventOperator || "Site Auditor"
    );

    setShowEventForm(false);
    setEventStage("");
    setEventOperator("");
    setEventDetails("");
  };

  // Material release verification lives in the VerifyMaterial component (real backend engine).

  // Sign Block update stage on server
  const handleAuthorizeRelease = async (status: "Verified" | "Flagged") => {
    const selected = passports.find(p => p.id === qrSelectedId);
    if (!selected) return;

    const nextStage = status === "Verified" ? "Verified" : "Delivered"; 
    const scanDetails = status === "Verified" 
      ? `On-field QA cleared site inspection checklists successfully by ${scannedBy} at ${siteLocation}.`
      : `Flagged: non-compliance reported. Release denied.`;

    await onUpdateStage(selected.id, nextStage, scanDetails, scannedBy);
    
    setIsAuthorized(true);
    setCheckResult({
      status: "success",
      message: status === "Verified" 
        ? `Ledger block signed! Materials released for installation at ${siteLocation}.` 
        : `Flags written to ledger node successfully. Release denied.`,
      expiredCerts: []
    });

    setChecklist({
      packagingDry: false,
      batchMatches: false,
      invoiceMatched: false,
      visualPassed: false,
    });
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateMaterial || !newMaterialName || !newMaterialBatch || !newMaterialSupplier) return;
    setIsCreating(true);
    try {
      await onCreateMaterial({
        name: newMaterialName,
        batch_id: newMaterialBatch,
        supplier: newMaterialSupplier,
        category: newMaterialCategory || "general",
      });
      setShowAddMaterial(false);
      setNewMaterialName("");
      setNewMaterialBatch("");
      setNewMaterialSupplier("");
      setNewMaterialCategory("general");
    } catch (err) {
      console.error("Failed to add material:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // Filter computations
  const filteredPassports = passports.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.manufacturer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOrigin = originFilter ? p.origin.toLowerCase().includes(originFilter.toLowerCase()) : true;
    const matchesSustainability = sustainabilityTier
      ? (p.sustainabilityScore !== null && (sustainabilityTier === "High" ? p.sustainabilityScore >= 90 : p.sustainabilityScore < 90))
      : true;
    const matchesStage = stageFilter ? p.currentStage === stageFilter : true;
    
    return matchesSearch && matchesOrigin && matchesSustainability && matchesStage;
  });

  const stagesInOrder = [
    "Manufactured",
    "Certified",
    "Delivered",
    "Approved",
    "Installed",
    "Verified",
    "Audited"
  ] as const;

  const dppMetrics = calculateDppMetrics(passports, certificates);

  return (
    <div id="product-passports-tab" className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 bg-neutral-50 transition-all">
      
      {/* 1. EXECUTIVE SUMMARY HEADER */}
      <section id="dpp-executive-header" className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-5 gap-4">
        <div>
          <span className="text-[10px] font-mono bg-black text-white px-2.5 py-1 rounded font-bold uppercase tracking-widest">
            Product Passports
          </span>
          <h2 className="text-3xl font-extrabold tracking-tighter text-neutral-900 font-sans mt-2.5">
            Digital Product Passports (DPP)
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            A verified digital record for every material — supplier, composition, certificates, carbon footprint, and audit history.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-center font-mono">
          <div className="text-right leading-tight hidden sm:block">
            <span className="text-[9px] text-[#8c8c8c] block uppercase font-bold">Materials with a passport</span>
            <span className="text-sm font-black text-neutral-900">{dppMetrics.activeDppCount} of {passports.length}</span>
          </div>
          <div className="bg-neutral-900 text-white font-mono text-[10.5px] font-bold uppercase tracking-widest py-2 px-4 rounded-xl shadow-xs">
            {dppMetrics.activeDppCount} Passports
          </div>
        </div>
      </section>

      {/* 2. CONTEXT PANEL */}
      <section id="dpp-context-panel" className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">PROJECT</span>
          <span className="text-xs font-bold text-neutral-800 block mt-1.5 truncate">{project?.name || "No project selected"}</span>
          <span className="text-[10px] text-neutral-450 block font-mono mt-0.5">{project?.location || selectedProjectId}</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">AUDIT TRAIL</span>
          <span className="text-xs font-bold text-neutral-800 block mt-1.5 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-emerald-500" /> Tamper-evident
          </span>
          <span className="text-[10px] text-neutral-455 block font-mono mt-0.5">SHA-256 hash chain</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">CERTIFICATE COMPLIANCE</span>
          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden mt-2.5">
            <div className="bg-neutral-900 h-full rounded-full" style={{ width: `${dppMetrics.complianceLevel}%` }} />
          </div>
          <p className="text-[10px] text-neutral-500 font-mono font-bold mt-1.5">{dppMetrics.complianceLevel}% of certificates valid</p>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">SHOWING</span>
          <span className="text-xs font-bold text-neutral-800 block mt-1.5">{filteredPassports.length} of {passports.length} passports</span>
        </div>
      </section>

      {/* CORE VIEW WITH TAB MANAGEMENT (Palantir Inspired Operating System Shell) */}
      <div className="space-y-6">
        
        {/* Dynamic Navigation Sub-Bar */}
        <div className="flex border-b border-neutral-200 overflow-x-auto">
          <nav className="flex gap-4" aria-label="Sub tabs">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "overview" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSubTab("registry")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "registry" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Material Registry
            </button>
            <button
              onClick={() => setActiveSubTab("verify")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "verify" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Verify Material
            </button>
            <button
              onClick={() => setActiveSubTab("explorer")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "explorer" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Passport Explorer
            </button>
            <button
              onClick={() => setActiveSubTab("supplier")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "supplier" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Supplier Records
            </button>
            <button
              onClick={() => setActiveSubTab("lifecycle")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeSubTab === "lifecycle" 
                  ? "border-neutral-900 text-neutral-900" 
                  : "border-transparent text-neutral-400 hover:text-neutral-900 hover:border-neutral-200"
              }`}
            >
              Lifecycle Chain
            </button>
          </nav>
        </div>

        {activeSubTab === "overview" && (
           <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
             <h3 className="font-bold font-sans text-lg mb-4">Digital Product Passports Overview</h3>
             <p className="text-xs text-neutral-500 italic pb-4">Executive summary of passport coverage and digital twins tracking across the active ledger.</p>
           </div>
        )}

        {/* ─── TAB 1: MATERIAL REGISTRY ─── */}
        {activeSubTab === "registry" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Search, filters, & sorting parameters */}
            <div className="bg-white border border-neutral-250 p-4 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filter by material spec, batch code, or supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-xs text-neutral-800 rounded-lg transition-all focus:outline-none focus:ring-1 focus:ring-black border border-neutral-200 font-sans"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 p-2 rounded text-[11px] font-sans focus:outline-none"
                >
                  <option value="">Origin: All</option>
                  {Array.from(new Set(passports.map((p) => p.origin).filter(Boolean))).map((origin) => (
                    <option key={origin} value={origin}>{origin}</option>
                  ))}
                </select>

                <select
                  value={sustainabilityTier}
                  onChange={(e) => setSustainabilityTier(e.target.value)}
                  className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 p-2 rounded text-[11px] font-sans focus:outline-none"
                >
                  <option value="">CO₂ Grade: All</option>
                  <option value="High">Sustainability High (&gt;=90)</option>
                  <option value="Low">Sustainability Standard (&lt;90)</option>
                </select>

                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 p-2 rounded text-[11px] font-sans focus:outline-none"
                >
                  <option value="">Stage: All</option>
                  {stagesInOrder.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split layout: Registry List & Sheet */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Material Cards */}
              <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col max-h-[750px]">
                <div className="px-5 py-4 bg-neutral-50 border-b border-neutral-200 flex justify-between items-center">
                  <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#a3a3a3]">
                    Active Pasport Catalog
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold bg-neutral-200 text-neutral-600 py-0.5 px-2 rounded-full uppercase">
                      Matched: {filteredPassports.length}
                    </span>
                    {onCreateMaterial && (
                      <button
                        id="add-material-btn"
                        onClick={() => setShowAddMaterial(true)}
                        className="text-[9px] font-mono font-bold bg-black text-white py-0.5 px-2.5 rounded-full uppercase flex items-center gap-1 cursor-pointer hover:bg-neutral-800 transition-colors"
                      >
                        <PlusCircle className="w-3 h-3" /> Add Material
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-neutral-150 overflow-y-auto flex-1">
                  {filteredPassports.map((p) => {
                    const IsSelected = p.id === activePassport?.id;
                    return (
                      <div
                        key={p.id}
                        id={`passport-list-item-${p.id}`}
                        onClick={() => onSelectId(p.id)}
                        className={`p-5 transition-all cursor-pointer text-left ${
                          IsSelected 
                            ? "bg-neutral-50 border-l-4 border-black font-semibold" 
                            : "hover:bg-neutral-50/50 border-l-4 border-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <span className={`font-bold text-sm ${IsSelected ? "text-neutral-900 font-black" : "text-neutral-800"}`}>
                            {p.name}
                          </span>
                          <span className="font-mono text-[9px] text-neutral-500 bg-neutral-100 border py-0.5 px-1.5 rounded font-bold uppercase shrink-0">
                            {p.code}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mb-2 font-medium">{p.manufacturer}</p>
                        
                        <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400">
                          <span className="font-mono">Stage: <strong className="text-neutral-850 font-bold">{p.currentStage}</strong></span>
                          <span className={`inline-block font-mono text-[9px] py-0.5 px-2 rounded-full font-bold uppercase border ${
                            p.carbonFootprint === "Low" 
                              ? "bg-emerald-50 border-emerald-200/65 text-emerald-800" 
                              : p.carbonFootprint === "Medium"
                                ? "bg-amber-50 border-amber-200/60 text-amber-800"
                                : "bg-red-50 border-red-200/60 text-red-800"
                          }`}>
                            CO₂ {p.carbonFootprint}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredPassports.length === 0 && (
                    <div className="p-8 text-center text-neutral-400 text-xs font-mono">
                      No matching registered passports found. Try resetting the filters.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Detailed Passport Sheet (Palantir Foundry-inspired specifications panel) */}
              {activePassport && (
                <div 
                  id={`passport-details-panel-${activePassport.id}`}
                  className="lg:col-span-8 bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden flex flex-col"
                >
                  <div className="premium-bg-sub premium-text-primary p-6 relative overflow-hidden border-b premium-border-b">
                    <div className="absolute top-0 right-0 p-6 opacity-5 select-none pointer-events-none">
                      <QrCode className="w-24 h-24 premium-text-primary" />
                    </div>
                    <div className="space-y-1.5 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono tracking-widest uppercase premium-text-secondary px-2.5 py-0.5 premium-card border premium-border rounded font-bold">
                          ORIGINAL DOCUMENTED ASSET NODE
                        </span>
                        <span className="text-[9.5px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded flex items-center gap-1 font-bold">
                          <Lock className="w-3 h-3 text-emerald-500 animate-pulse" /> LEDGER CHAIN LOCKED
                        </span>
                      </div>
                      <h3 className="text-xl font-normal tracking-tight">{activePassport.name}</h3>
                      <p className="text-xs premium-text-secondary font-mono">Passport Node: {activePassport.id} | Spec ID: {activePassport.code}</p>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Physical origins */}
                      <div className="bg-neutral-50 border border-neutral-150 p-5 rounded-xl space-y-3.5 text-xs text-neutral-700">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b pb-2 flex items-center gap-1.5 font-mono">
                          <MapPin className="w-3.5 h-3.5 text-neutral-500" /> Physical Spec & Origins
                        </h4>
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Manufactured At:</span>
                          <p className="font-bold text-neutral-900 mt-0.5 text-sm">{activePassport.origin}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Primary Supplier:</span>
                          <p className="font-bold text-neutral-900 mt-0.5 text-sm flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-neutral-400" /> {activePassport.manufacturer}
                          </p>
                        </div>
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Chemical Composition:</span>
                          <p className="text-neutral-600 mt-1 italic leading-relaxed bg-white border border-neutral-100 p-2.5 rounded-lg">{activePassport.composition}</p>
                        </div>
                      </div>

                      {/* Sustainability metrics */}
                      <div className="bg-neutral-50 border border-neutral-150 p-5 rounded-xl space-y-3.5 text-xs text-neutral-700">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b pb-2 flex items-center gap-1.5 font-mono">
                          <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Carbon Metrics & Standards
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">EPD Score:</span>
                            <span className="font-bold text-lg text-emerald-700 block mt-0.5">{activePassport.sustainabilityScore !== null ? `${activePassport.sustainabilityScore}/100` : "Pending"}</span>
                          </div>
                          <div>
                            <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Trust Grade:</span>
                            <span className="font-bold text-neutral-900 block mt-1">
                              <span className="bg-neutral-900 text-white font-mono font-bold uppercase text-[9.5px] py-1 px-2.5 rounded-full shadow-xs">
                                {activePassport.complianceRating} Grade
                              </span>
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">LCA Emissions Index:</span>
                          <p className="font-bold text-neutral-900 mt-0.5">
                            {activePassport.carbonEmissions ?? "—"} kg CO₂e / kg (
                            <span className="font-mono text-neutral-500 font-semibold uppercase">{activePassport.carbonFootprint} Load</span>)
                          </p>
                        </div>
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[9.5px] font-mono block">Mandatory Quality Standards:</span>
                          <div className="flex gap-1.5 flex-wrap mt-1.5">
                            {activePassport.standards.map((st, idx) => (
                              <span key={idx} className="bg-white text-neutral-600 border border-neutral-200 rounded font-mono text-[9px] px-2 py-0.5 font-bold uppercase">
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* QR Anchor registration — live scannable QR shown inline in-app */}
                    <div className="bg-neutral-50 border border-neutral-150 rounded-xl p-4 flex items-start gap-4">
                      <img
                        src={dppQrPngUrl(activePassport.id)}
                        alt="Material verification QR code"
                        className="w-24 h-24 rounded-lg bg-white border border-neutral-150 shrink-0 shadow-xs"
                      />
                      <div className="flex-1 space-y-1">
                        <h4 className="text-[10px] font-bold text-neutral-800 uppercase tracking-widest font-mono">
                          ConstructAsk QR / Passport Identifier
                        </h4>
                        <p className="text-neutral-500 text-xs leading-relaxed font-light">
                          Site operators scan this material's QR code to pull its passport and run a release check instantly.
                        </p>
                        <p className="text-[9.5px] font-mono select-all text-neutral-400 break-all pt-1 font-bold">{activePassport.qrPayload}</p>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <a
                            href={`?label=${activePassport.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-neutral-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
                          >
                            <QrCode className="w-3.5 h-3.5" /> Print QR Label
                          </a>
                          <a
                            href={`?verify=${activePassport.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-white border border-neutral-300 text-neutral-700 text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Open Verify Page
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Standard Action Area to progresses ledger state in the popup */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#a3a3a3] flex items-center gap-1.5 font-mono">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" /> IMMUTABLE BLOCK LINEAGE
                        </h4>
                        <button
                          id="add-custom-auditevent-btn"
                          onClick={() => setShowEventForm(!showEventForm)}
                          className="text-xs text-black hover:underline transition-all flex items-center gap-1.5 font-bold cursor-pointer font-mono uppercase"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Progress Stage Block</span>
                        </button>
                      </div>

                      {showEventForm && (
                        <form 
                          onSubmit={handleCreateBlock} 
                          className="bg-neutral-50 border border-neutral-250 rounded-xl p-5 space-y-4 text-xs animate-fadeIn"
                        >
                          <h5 className="font-bold text-neutral-800 uppercase tracking-widest text-[9.5px] font-mono">
                            Authorize New Blockchain Block progression
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-neutral-400 font-bold uppercase text-[9px] font-mono mb-1">Target Stage</label>
                              <select 
                                required
                                value={eventStage} 
                                onChange={(e) => setEventStage(e.target.value)}
                                className="w-full bg-white border border-neutral-300 p-2 rounded text-xs focus:ring-1 focus:ring-black focus:outline-none"
                              >
                                <option value="">-- Choose Stage --</option>
                                {stagesInOrder.map((st) => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-neutral-400 font-bold uppercase text-[9px] font-mono mb-1">Inspector Name</label>
                              <input 
                                type="text" 
                                required
                                placeholder="e.g. Anand AK" 
                                value={eventOperator}
                                onChange={(e) => setEventOperator(e.target.value)}
                                className="w-full bg-white border border-[#cccccc] p-2 rounded text-xs focus:ring-1 focus:ring-black focus:outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-neutral-400 font-bold uppercase text-[9px] font-mono mb-1">Observation details / crypt proof</label>
                            <textarea
                              rows={2}
                              placeholder="Describe physical alignment or laboratory testing results precisely..."
                              value={eventDetails}
                              onChange={(e) => setEventDetails(e.target.value)}
                              className="w-full bg-white border border-[#cccccc] p-2 rounded text-xs focus:ring-1 focus:ring-black focus:outline-none font-sans"
                            />
                          </div>
                          <div className="flex justify-end gap-2 text-[10.5px] font-bold uppercase font-mono">
                            <button 
                              type="button" 
                              onClick={() => setShowEventForm(false)}
                              className="bg-neutral-200 text-neutral-750 py-1.5 px-4 rounded hover:bg-neutral-300"
                            >
                              Cancel
                            </button>
                            <button 
                              type="submit" 
                              disabled={isUpdating}
                              className="bg-black text-white hover:bg-neutral-850 py-1.5 px-5 rounded shadow-xs"
                            >
                              {isUpdating ? "Signing..." : "Lock block & sign SHA-256"}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Blockchain vertical timeline */}
                      <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-[1px] before:bg-neutral-200">
                        {activePassport.auditChain.map((bk) => (
                          <div key={bk.index} className="flex gap-4 relative z-10">
                            <span className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] shrink-0 bg-white font-mono font-bold ${
                              bk.action === activePassport.currentStage
                                ? "border-black ring-4 ring-neutral-100 text-black"
                                : "border-neutral-200 text-neutral-400"
                            }`}>
                              {bk.index + 1}
                            </span>

                            <div className="bg-neutral-50 border border-neutral-150 rounded-xl p-4 flex-1 space-y-1">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                                <div>
                                  <span className="font-bold text-neutral-800">{bk.action}</span>
                                  <span className="text-[10px] text-neutral-450 font-mono ml-2">by {bk.operator}</span>
                                </div>
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  {new Date(bk.timestamp).toLocaleString("en-US", { hourCycle: "h23", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-650 leading-relaxed font-sans">{bk.details}</p>
                              <div className="bg-white border border-neutral-100 p-1.5 rounded text-[9px] font-mono text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-inner">
                                <span className="truncate w-full sm:w-44">PREV: {bk.previousHash.slice(0, 16)}...</span>
                                <span className="text-emerald-700 font-bold flex items-center gap-0.5 truncate w-full sm:w-44 sm:justify-end">
                                  <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" /> HASH: {bk.hash.slice(0, 16)}...
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        )}

        {activeSubTab === "explorer" && (
           <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
             <h3 className="font-bold font-sans text-lg mb-4">Passport Explorer</h3>
             <p className="text-xs text-neutral-500 italic pb-4">Deep dive search into specific digital twins and component properties.</p>
           </div>
        )}

        {activeSubTab === "supplier" && (
           <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
             <h3 className="font-bold font-sans text-lg mb-4">Supplier Records</h3>
             <p className="text-xs text-neutral-500 italic pb-4">Master supplier directory matched with corresponding DPP components.</p>
           </div>
        )}

        {/* ─── TAB: VERIFY MATERIAL ─── */}
        {activeSubTab === "verify" && (
          <VerifyMaterial 
            passports={passports} 
            certificates={certificates}
            selectedProjectId={selectedProjectId}
            onAuthorizeRelease={(passportId, stage, details, operator) => onUpdateStage(passportId, stage, details, operator)}
            onAddScanLog={(scan) => console.log("Scan logged", scan)}
          />
        )}

        {/* ─── TAB 3: MATERIAL LIFECYCLE ─── */}
        {activeSubTab === "lifecycle" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Horizontal progress indicators */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#a3a3a3] mb-6">
                Active Project Stages Pipeline (All Categories)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 relative">
                {stagesInOrder.map((stage, idx) => {
                  const stageCount = passports.filter(p => p.currentStage === stage).length;
                  return (
                    <div key={idx} className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl text-center space-y-1 relative">
                      <div className="flex justify-center">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs bg-neutral-900 text-white border border-neutral-850 shadow-sm">
                          {idx + 1}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-neutral-800 pt-1 leading-none">{stage}</p>
                      <p className="text-[9.5px] text-neutral-450 font-mono font-bold uppercase tracking-wider pt-0.5">
                        {stageCount} active
                      </p>
                      {idx < 6 && (
                        <div className="hidden md:block absolute top-8 -right-3.5 w-7 h-[1px] bg-neutral-200 z-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dependency Mapping & Workflow Blocker panels */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-white shadow-xs space-y-4">
                <h4 className="font-bold text-white tracking-tight flex items-center gap-1.5 text-xs uppercase tracking-widest text-neutral-300 font-mono">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> COMPLIANCE DEPENDENCY BLOCKS
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed font-light">
                  Active materials are strictly blockaded from progressing past <strong>Approved</strong> to <strong>Installed/Verified</strong> phase on site due to expired safety testing certifications.
                </p>

                <div className="space-y-3 pt-1">
                  <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] font-mono text-red-400 border border-red-900/40 bg-red-950/20 px-1.5 py-0.5 font-bold uppercase rounded tracking-wider">
                      RE-TEST REQUIRED
                    </span>
                    <h5 className="font-bold text-xs text-neutral-100 pt-1">High-Tensile Anchor Rod (HT-AR-001)</h5>
                    <p className="text-[11px] text-neutral-400">
                      Standard checklist relies on <strong>ASTM A975 Compliance Certificate</strong> which expired on March 22, 2025. Contact SGL Testing Labs.
                    </p>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-xl space-y-1">
                    <span className="text-[9px] font-mono text-amber-400 border border-amber-900/30 bg-amber-950/20 px-1.5 py-0.5 font-bold uppercase rounded tracking-wider">
                      WARNING WITHIN 12 DAYS
                    </span>
                    <h5 className="font-bold text-xs text-neutral-100 pt-1">ISO 9001 Factory Quality Statement</h5>
                    <p className="text-[11px] text-neutral-400">
                      Supplier 'Construck Engineered Systems' quality cert expires in 12 days. Imminent logistics lock on rockfall barriers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-12 lg:col-span-7 bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3 font-mono">
                  Live Operational Chain Visualization
                </h4>
                <div className="divide-y divide-neutral-100">
                  {passports.slice(0, 3).map((pp, idx) => {
                    const lastAudit = pp.auditChain[pp.auditChain.length - 1];
                    return (
                      <div key={idx} className="py-4.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 text-sm">{pp.name}</span>
                            <span className="text-[9px] font-mono bg-neutral-50 px-1 py-0.5 rounded border text-neutral-450">{pp.code}</span>
                          </div>
                          <p className="text-xs text-neutral-400 font-mono">Latest Verification check: {lastAudit ? lastAudit.details : "N/A"}</p>
                        </div>
                        <span className="bg-neutral-900 text-white font-mono text-[9px] font-bold uppercase py-1 px-3 rounded-full">
                          {pp.currentStage}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ─── 4. AI INSIGHT CARD ─── */}
      <section id="dpp-ai-insight" className="bg-neutral-50 border border-neutral-250 p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-black" /> Passport Summary
          </span>
          <span className="text-[9px] font-mono text-neutral-400 font-bold uppercase">From project records</span>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed font-sans font-light">
          <strong>{activePassport.name}</strong> (batch {activePassport.code}) from {activePassport.manufacturer} is at the{" "}
          <strong>{activePassport.currentStage}</strong> stage with a <strong>{activePassport.complianceRating}</strong> compliance grade.
          Its provenance is anchored to {activePassport.auditChain.length} tamper-evident audit-trail block(s).
          {activePassport.standards.length > 0 && ` Linked standards: ${activePassport.standards.join(", ")}.`}
        </p>
      </section>

      {/* ─── 5. EVIDENCE SECTION ─── */}
      <section id="dpp-evidence-section" className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3 font-mono">
          Cryptographic Evidence Ledger Logs
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">LATEST BLOCK HASH</span>
            <span className="font-bold text-neutral-850 text-xs block truncate mt-1">
              {activePassport.auditChain.length > 0 ? activePassport.auditChain[0].hash : "No audit blocks yet"}
            </span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">SHA-256 hash-chained audit record</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">LINKED STANDARDS</span>
            <span className="font-bold text-neutral-850 text-xs block flex items-center gap-1 mt-1">
              <FileText className="w-3.5 h-3.5 text-neutral-450" /> {activePassport.standards[0] || "No certificates linked"}
            </span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">{activePassport.standards.length} standard(s) on record</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold">QR IDENTIFIER</span>
            <span className="font-bold text-neutral-850 text-xs block mt-1 truncate">{activePassport.qrPayload}</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">Scanned for on-site release checks</span>
          </div>
        </div>
      </section>

      {/* ─── 6. ACTION RECOMMENDATIONS ─── */}
      <section id="dpp-action-recommendations" className="bg-[#1c1c1c] text-[#ededed] border border-neutral-900 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h4 className="text-[10px] font-mono font-bold uppercase text-[#a3a3a3] tracking-widest">
            Recommended Actions
          </h4>
          {(() => {
            const verifiedStages = ["Verified", "Audited", "Installed"];
            const needsAttention = activePassport.complianceRating === "C" || !verifiedStages.includes(activePassport.currentStage);
            return (
              <span className={`text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded tracking-wider ${needsAttention ? "text-amber-400 bg-amber-950/20" : "text-emerald-400 bg-emerald-950/20"}`}>
                {needsAttention ? "Action Needed" : "On Track"}
              </span>
            );
          })()}
        </div>
        <ul className="space-y-3.5 text-xs font-sans">
          {activePassport.complianceRating === "C" && (
            <li className="flex items-start gap-2.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block font-semibold leading-tight">Resolve compliance for {activePassport.name}</strong>
                <p className="text-neutral-400 mt-0.5 leading-normal font-light">Compliance grade is C. Renew or attach valid certificates before this material can be released to site.</p>
              </div>
            </li>
          )}
          {!["Verified", "Audited", "Installed"].includes(activePassport.currentStage) && (
            <li className="flex items-start gap-2.5">
              <span className="h-2 w-2 rounded-full bg-neutral-500 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block font-semibold leading-tight">Advance {activePassport.name} through verification</strong>
                <p className="text-neutral-400 mt-0.5 leading-normal font-light">Current stage: {activePassport.currentStage}. Complete the site verification and approval steps to progress it toward release.</p>
              </div>
            </li>
          )}
          {activePassport.complianceRating !== "C" && ["Verified", "Audited", "Installed"].includes(activePassport.currentStage) && (
            <li className="flex items-start gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block font-semibold leading-tight">No blocking actions for {activePassport.name}</strong>
                <p className="text-neutral-400 mt-0.5 leading-normal font-light">At the {activePassport.currentStage} stage with grade {activePassport.complianceRating}. Continue routine monitoring.</p>
              </div>
            </li>
          )}
        </ul>
      </section>

      {/* ADD MATERIAL MODAL */}
      {showAddMaterial && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddMaterial(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-neutral-200 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="bg-neutral-900 text-white p-5 rounded-t-2xl">
              <span className="text-[9px] font-mono tracking-widest uppercase text-neutral-400 font-bold">NEW REGISTRATION</span>
              <h3 className="text-lg font-bold tracking-tight mt-1">Register New Material</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Add a new material to the project evidence registry.</p>
            </div>
            <form onSubmit={handleAddMaterial} className="p-6 space-y-4">
              <div>
                <label className="block text-neutral-500 font-bold uppercase text-[9px] font-mono mb-1.5">Material Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rockfall Barrier Panel"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-black focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-neutral-500 font-bold uppercase text-[9px] font-mono mb-1.5">Batch ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NH66-RBP-11"
                    value={newMaterialBatch}
                    onChange={(e) => setNewMaterialBatch(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 font-bold uppercase text-[9px] font-mono mb-1.5">Category</label>
                  <select
                    value={newMaterialCategory}
                    onChange={(e) => setNewMaterialCategory(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-black focus:outline-none"
                  >
                    <option value="general">General</option>
                    <option value="structural">Structural</option>
                    <option value="geotechnical">Geotechnical</option>
                    <option value="drainage">Drainage</option>
                    <option value="reinforcement">Reinforcement</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-neutral-500 font-bold uppercase text-[9px] font-mono mb-1.5">Supplier *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GeoStruct Materials"
                  value={newMaterialSupplier}
                  onChange={(e) => setNewMaterialSupplier(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-black focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMaterial(false)}
                  className="text-xs font-bold font-mono uppercase bg-neutral-100 text-neutral-600 py-2 px-4 rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="text-xs font-bold font-mono uppercase bg-black text-white py-2 px-5 rounded-lg hover:bg-neutral-800 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isCreating ? "Registering..." : "Register Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
