import React, { useState } from "react";
import {
  FileUp,
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Download,
  Edit3,
  Save,
  ArrowRight,
  Upload,
  PenTool,
  Cpu,
  QrCode,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
} from "lucide-react";
import { API_BASE_URL, getAuthToken } from "../api/backendClient";

type ConversionStep = "choose" | "manual-entry" | "upload" | "review" | "approved";

interface DPPJson {
  dpp_version: string;
  passport_id: string;
  product_name: string;
  manufacturer: string;
  category: string;
  description: string;
  technical_properties: Record<string, any>;
  working_properties: Record<string, any>;
  application: { primary_use: string[]; suitable_for: string[] };
  standards_compliance: string[];
  packaging_and_storage: any;
  sustainability: any;
  batch_info: any;
  qr_verification: any;
  source_document: any;
}

interface ExtractResponse {
  status: string;
  conversion_method: string;
  warnings: string[];
  extracted_dpp: DPPJson;
  raw_text_preview?: string;
  raw_text_length?: number;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

export default function TDSConverter() {
  const [step, setStep] = useState<ConversionStep>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dpp, setDpp] = useState<DPPJson | null>(null);
  const [rawTextPreview, setRawTextPreview] = useState<string | null>(null);
  const [conversionMethod, setConversionMethod] = useState<string>("");
  const [approveResult, setApproveResult] = useState<any>(null);
  const [showRawText, setShowRawText] = useState(false);

  // Manual form state
  const [form, setForm] = useState({
    product_name: "",
    manufacturer: "",
    category: "",
    description: "",
    batch_number: "",
    origin_country: "India",
    factory_location: "",
    standards: "",
    applications: "",
    suitable_for: "",
    packaging: "",
    storage: "",
    shelf_life_months: 12,
  });

  // Technical properties for manual mode
  const [techProps, setTechProps] = useState<Array<{ name: string; value: string; unit: string; test_method: string }>>([
    { name: "", value: "", unit: "", test_method: "" },
  ]);

  const handleManualSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const techPropsObj: Record<string, any> = {};
      for (const p of techProps) {
        if (p.name.trim()) {
          const key = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          const val = parseFloat(p.value) || p.value;
          techPropsObj[key] = { value: val, unit: p.unit };
          if (p.test_method) techPropsObj[key].test_method = p.test_method;
        }
      }

      const payload = {
        ...form,
        technical_properties: techPropsObj,
        working_properties: {},
        applications: form.applications.split(",").map(s => s.trim()).filter(Boolean),
        suitable_for: form.suitable_for.split(",").map(s => s.trim()).filter(Boolean),
        standards_compliance: form.standards.split(",").map(s => s.trim()).filter(Boolean),
      };

      const result: ExtractResponse = await apiFetch("/api/tds/manual", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDpp(result.extracted_dpp);
      setWarnings(result.warnings);
      setConversionMethod(result.conversion_method);
      setStep("review");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result: ExtractResponse = await apiFetch("/api/tds/extract", {
        method: "POST",
        body: formData,
      });

      setDpp(result.extracted_dpp);
      setWarnings(result.warnings);
      setConversionMethod(result.conversion_method);
      setRawTextPreview(result.raw_text_preview || null);
      setStep("review");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!dpp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch("/api/tds/approve", {
        method: "POST",
        body: JSON.stringify({ dpp_json: dpp }),
      });
      setApproveResult(result);
      setStep("approved");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!dpp) return;
    const blob = new Blob([JSON.stringify(dpp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dpp.passport_id || "dpp"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep("choose");
    setDpp(null);
    setError(null);
    setWarnings([]);
    setRawTextPreview(null);
    setApproveResult(null);
    setConversionMethod("");
    setForm({
      product_name: "", manufacturer: "", category: "", description: "",
      batch_number: "", origin_country: "India", factory_location: "",
      standards: "", applications: "", suitable_for: "",
      packaging: "", storage: "", shelf_life_months: 12,
    });
    setTechProps([{ name: "", value: "", unit: "", test_method: "" }]);
  };

  const addTechProp = () => setTechProps([...techProps, { name: "", value: "", unit: "", test_method: "" }]);
  const removeTechProp = (i: number) => setTechProps(techProps.filter((_, idx) => idx !== i));
  const updateTechProp = (i: number, field: string, val: string) => {
    const copy = [...techProps];
    (copy[i] as any)[field] = val;
    setTechProps(copy);
  };

  // Inline editing of DPP fields in review mode
  const updateDppField = (path: string, value: any) => {
    if (!dpp) return;
    const copy = JSON.parse(JSON.stringify(dpp));
    const keys = path.split(".");
    let obj = copy;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    setDpp(copy);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-cyan-400" />
            TDS to DPP Converter
          </h1>
          <p className="text-zinc-400 mt-1">
            Convert Technical Data Sheets into Digital Product Passport JSON
          </p>
        </div>
        {step !== "choose" && (
          <button onClick={handleReset} className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500">
            Start Over
          </button>
        )}
      </div>

      {/* Workflow steps indicator */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {["Choose Method", "Enter Data", "Review & Edit", "Approve & Save"].map((label, i) => {
          const stepIdx = step === "choose" ? 0 : step === "manual-entry" || step === "upload" ? 1 : step === "review" ? 2 : 3;
          return (
            <React.Fragment key={label}>
              {i > 0 && <ArrowRight className="w-3 h-3" />}
              <span className={`px-2 py-1 rounded ${i === stepIdx ? "bg-cyan-500/20 text-cyan-400 font-medium" : i < stepIdx ? "text-emerald-400" : ""}`}>
                {i < stepIdx ? <CheckCircle className="w-3 h-3 inline mr-1" /> : null}
                {label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Step: Choose Method */}
      {step === "choose" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setStep("manual-entry")}
            className="group bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 rounded-xl p-8 text-left transition-all"
          >
            <PenTool className="w-10 h-10 text-cyan-400 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Manual Conversion</h2>
            <p className="text-zinc-400 text-sm mb-4">
              Read the TDS document and enter engineering fields manually into the DPP schema.
            </p>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>- Full control over extracted data</div>
              <div>- Best accuracy for complex documents</div>
              <div>- 20-60 minutes per TDS</div>
            </div>
            <div className="mt-4 text-cyan-400 text-sm font-medium group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Start Manual Entry <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          <button
            onClick={() => setStep("upload")}
            className="group bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-xl p-8 text-left transition-all"
          >
            <Cpu className="w-10 h-10 text-emerald-400 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Automatic Extraction</h2>
            <p className="text-zinc-400 text-sm mb-4">
              Upload TDS PDF. AI extracts fields, maps to schema, normalizes units.
            </p>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>- PDF text extraction + AI mapping</div>
              <div>- Fast: 1-5 minutes per TDS</div>
              <div>- Human review before approval</div>
            </div>
            <div className="mt-4 text-emerald-400 text-sm font-medium group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Upload PDF <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Step: Manual Entry */}
      {step === "manual-entry" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <PenTool className="w-5 h-5 text-cyan-400" />
            Manual TDS Data Entry
          </h2>

          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Product Name", key: "product_name", placeholder: "e.g. Geogrid BX1200" },
              { label: "Manufacturer", key: "manufacturer", placeholder: "e.g. Delta GeoSystems" },
              { label: "Category", key: "category", placeholder: "e.g. Geosynthetic Reinforcement" },
              { label: "Batch Number", key: "batch_number", placeholder: "e.g. GEO-BATCH-22" },
              { label: "Origin Country", key: "origin_country", placeholder: "India" },
              { label: "Factory Location", key: "factory_location", placeholder: "e.g. Hyderabad, Telangana" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
                <input
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Description</label>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none h-20 resize-none"
              placeholder="Brief product description..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {/* Technical Properties */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-400 font-medium">Technical Properties</label>
              <button onClick={addTechProp} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Property
              </button>
            </div>
            <div className="space-y-2">
              {techProps.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder-zinc-500"
                    placeholder="Property name"
                    value={p.name}
                    onChange={e => updateTechProp(i, "name", e.target.value)}
                  />
                  <input
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder-zinc-500"
                    placeholder="Value"
                    value={p.value}
                    onChange={e => updateTechProp(i, "value", e.target.value)}
                  />
                  <input
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder-zinc-500"
                    placeholder="Unit"
                    value={p.unit}
                    onChange={e => updateTechProp(i, "unit", e.target.value)}
                  />
                  <input
                    className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder-zinc-500"
                    placeholder="Test method"
                    value={p.test_method}
                    onChange={e => updateTechProp(i, "test_method", e.target.value)}
                  />
                  {techProps.length > 1 && (
                    <button onClick={() => removeTechProp(i)} className="text-zinc-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Standards, Applications */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Standards Compliance (comma-separated)</label>
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-white placeholder-zinc-500 h-16 resize-none"
                placeholder="ISO 10319, EN 13249, ASTM D4355"
                value={form.standards}
                onChange={e => setForm({ ...form, standards: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Applications (comma-separated)</label>
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-white placeholder-zinc-500 h-16 resize-none"
                placeholder="Subgrade stabilization, Base reinforcement"
                value={form.applications}
                onChange={e => setForm({ ...form, applications: e.target.value })}
              />
            </div>
          </div>

          <button
            onClick={handleManualSubmit}
            disabled={loading || !form.product_name || !form.manufacturer}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Convert to DPP JSON
          </button>
        </div>
      )}

      {/* Step: Upload PDF */}
      {step === "upload" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Cpu className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Upload TDS PDF</h2>
          <p className="text-zinc-400 text-sm mb-6">
            The system will extract text, use AI to identify product fields, and generate DPP JSON.
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-3 text-cyan-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Extracting and processing PDF...</span>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium cursor-pointer">
              <Upload className="w-5 h-5" />
              Choose PDF File
              <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
            </label>
          )}

          <div className="mt-8 text-left max-w-md mx-auto">
            <h3 className="text-xs text-zinc-400 font-medium mb-2">Extraction Pipeline:</h3>
            <div className="space-y-1 text-xs text-zinc-500">
              {[
                "PDF text extraction (PyMuPDF)",
                "AI field identification (GPT/Gemini)",
                "JSON schema mapping",
                "Unit normalization",
                "Validation check",
                "Human review (next step)",
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px]">{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && dpp && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                Review Extracted DPP
              </h2>
              <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                Method: {conversionMethod}
              </span>
            </div>

            {warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                <div className="text-xs text-amber-400 font-medium mb-1">Validation Warnings:</div>
                {warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {w}
                  </div>
                ))}
              </div>
            )}

            {/* Editable fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { label: "Passport ID", path: "passport_id" },
                { label: "Product Name", path: "product_name" },
                { label: "Manufacturer", path: "manufacturer" },
                { label: "Category", path: "category" },
              ].map(({ label, path }) => (
                <div key={path}>
                  <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
                  <input
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    value={(dpp as any)[path] || ""}
                    onChange={e => updateDppField(path, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {/* Technical Properties display */}
            <div className="mb-4">
              <h3 className="text-xs text-zinc-400 font-medium mb-2">
                Technical Properties ({Object.keys(dpp.technical_properties).length})
              </h3>
              <div className="bg-zinc-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                {Object.entries(dpp.technical_properties).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-zinc-700/50 last:border-0">
                    <span className="text-xs text-zinc-300">{key.replace(/_/g, " ")}</span>
                    <span className="text-xs text-cyan-400">
                      {typeof val === "object" ? `${val.value} ${val.unit || ""}` : String(val)}
                      {typeof val === "object" && val.test_method ? ` (${val.test_method})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Standards */}
            <div className="mb-4">
              <h3 className="text-xs text-zinc-400 font-medium mb-2">
                Standards Compliance ({dpp.standards_compliance.length})
              </h3>
              <div className="flex flex-wrap gap-1">
                {dpp.standards_compliance.map((s: string, i: number) => (
                  <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{s}</span>
                ))}
              </div>
            </div>

            {/* Raw text preview (auto mode) */}
            {rawTextPreview && (
              <div className="mb-4">
                <button
                  onClick={() => setShowRawText(!showRawText)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  {showRawText ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Extracted PDF Text Preview
                </button>
                {showRawText && (
                  <pre className="mt-2 bg-zinc-950 rounded p-3 text-xs text-zinc-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {rawTextPreview}
                  </pre>
                )}
              </div>
            )}

            {/* Full JSON preview */}
            <details className="mb-4">
              <summary className="text-xs text-zinc-400 hover:text-white cursor-pointer">
                View Full DPP JSON
              </summary>
              <pre className="mt-2 bg-zinc-950 rounded p-3 text-xs text-emerald-400 max-h-60 overflow-y-auto">
                {JSON.stringify(dpp, null, 2)}
              </pre>
            </details>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Approve & Save to Database
            </button>
            <button
              onClick={handleDownloadJson}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
          </div>
        </div>
      )}

      {/* Step: Approved */}
      {step === "approved" && approveResult && (
        <div className="bg-zinc-900 border border-emerald-500/30 rounded-xl p-8 text-center">
          <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">DPP Approved & Saved</h2>
          <p className="text-zinc-400 mb-6">{approveResult.message}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mb-6">
            {[
              { label: "Passport ID", value: approveResult.passport_id },
              { label: "Material ID", value: `#${approveResult.material_id}` },
              { label: "DB Record", value: `#${approveResult.passport_db_id}` },
              { label: "Status", value: approveResult.status },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="text-sm text-white font-medium mt-1">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleDownloadJson}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
            <button
              onClick={handleReset}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Convert Another TDS
            </button>
          </div>
        </div>
      )}

      {/* Workflow info footer */}
      {step === "choose" && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-3">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-400">
            <div>
              <div className="text-cyan-400 font-medium mb-2">Manual Workflow</div>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Read the Technical Data Sheet</li>
                <li>Identify engineering parameters</li>
                <li>Extract values with units</li>
                <li>Enter into DPP schema</li>
                <li>Review and validate</li>
                <li>Save DPP + generate QR</li>
              </ol>
            </div>
            <div>
              <div className="text-emerald-400 font-medium mb-2">Automatic Workflow</div>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Upload TDS PDF</li>
                <li>Extract text (PyMuPDF / OCR)</li>
                <li>AI identifies product fields</li>
                <li>Map to DPP JSON schema</li>
                <li>Normalize units</li>
                <li>Human review and approval</li>
                <li>Save DPP + generate QR</li>
              </ol>
            </div>
          </div>
          <div className="mt-4 text-xs text-zinc-500 border-t border-zinc-800 pt-3">
            <strong className="text-zinc-400">Important:</strong> Construction material values affect safety and compliance.
            AI-generated JSON always goes through human review before becoming the final Digital Product Passport.
          </div>
        </div>
      )}
    </div>
  );
}
