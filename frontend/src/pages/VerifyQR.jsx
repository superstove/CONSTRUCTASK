import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, QrCode, ShieldCheck } from "lucide-react";
import { api } from "../api/client.js";

const decisionMeta = {
  "Approved for site use": { tone: "ok", icon: CheckCircle2 },
  "Hold for review": { tone: "warning", icon: HelpCircle },
  "Blocked from installation": { tone: "danger", icon: AlertTriangle },
  Blocked: { tone: "danger", icon: AlertTriangle },
  Error: { tone: "danger", icon: AlertTriangle }
};

export default function VerifyQR({ projectId, selectedProject, onNavigate }) {
  const [form, setForm] = useState({
    qr: "",
    scannedBy: "Site Engineer",
    location: "Chainage 42+300 - Cut Slope"
  });
  const [materials, setMaterials] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [result, setResult] = useState(null);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");

  useEffect(() => {
    let active = true;
    setMaterialsError("");
    setSelectedMaterialId("");
    setForm((current) => ({ ...current, qr: "" }));
    setResult(null);
    setReport("");

    api.materials(projectId)
      .then((items) => {
        if (!active) return;
        setMaterials(items);
        if (items.length > 0) {
          const firstReadyChoice = items.find((item) => item.status !== "failed") || items[0];
          setSelectedMaterialId(String(firstReadyChoice.id));
          setForm((current) => ({ ...current, qr: firstReadyChoice.qr_code }));
        }
      })
      .catch((err) => {
        if (active) setMaterialsError(err.message);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const visibleMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    if (!query) return materials;
    return materials.filter((material) =>
      [material.name, material.batch_number, material.qr_code, material.supplier, material.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [materials, materialSearch]);

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function handleMaterialSelect(event) {
    const materialId = event.target.value;
    setSelectedMaterialId(materialId);
    const material = materials.find((item) => String(item.id) === materialId);
    setForm((current) => ({ ...current, qr: material?.qr_code || "" }));
    setResult(null);
    setReport("");
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (!form.qr || !form.scannedBy || !form.location) return;

    setLoading(true);
    setReport("");
    try {
      setResult(await api.verifyQR(form.qr, form.scannedBy, form.location, projectId));
    } catch (err) {
      setResult({ decision: "Error", material: null, reasons: [err.message] });
    } finally {
      setLoading(false);
    }
  }

  function askWhy() {
    if (!result?.material) return;
    sessionStorage.setItem(
      "constructask-quick-question",
      `Can ${result.material} be safely used on this project today? Explain the release decision.`
    );
    onNavigate("chat");
  }

  function generateReport() {
    if (!result) return;
    const projectName = selectedProject?.name || "Selected project";
    const reasonText = result.reasons?.map((reason, index) => `${index + 1}. ${reason}`).join("\n") || "No reasons returned.";
    setReport(
      [
        `${projectName} - Material Release Decision`,
        `Decision: ${result.decision}`,
        result.material ? `Material: ${result.material}` : "Material: Not found in this project",
        result.batch_number ? `Batch: ${result.batch_number}` : null,
        result.supplier ? `Supplier: ${result.supplier}` : null,
        `Scanned by: ${form.scannedBy}`,
        `Location: ${form.location}`,
        "",
        "Evidence:",
        reasonText,
        "",
        "Site instruction:",
        result.decision === "Approved for site use"
          ? "Material may proceed to site use under normal supervision."
          : "Do not release this material until the listed evidence issues are cleared."
      ].filter(Boolean).join("\n")
    );
  }

  const meta = decisionMeta[result?.decision] || decisionMeta.Error;
  const DecisionIcon = meta.icon;

  return (
    <section className="page-grid">
      <article className="panel wide-panel release-check-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Material Release Check</p>
            <h2>Material Verification</h2>
            <p className="panel-copy">
              Verify QR records, material status, certificates, approvals, and history for site-use decisions.
            </p>
          </div>
          <QrCode size={24} />
        </div>

        <div className="release-check-grid">
          <form className="release-form" onSubmit={handleVerify}>
            <label>
              Search material
              <input
                value={materialSearch}
                onChange={(event) => setMaterialSearch(event.target.value)}
                placeholder="Search by material, batch, supplier, or QR"
              />
            </label>
            <label>
              Select material
              <select value={selectedMaterialId} onChange={handleMaterialSelect} disabled={materials.length === 0}>
                {visibleMaterials.length === 0 ? (
                  <option value="">No matching materials</option>
                ) : (
                  visibleMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} - {material.batch_number} - {material.status}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              QR code
              <input name="qr" value={form.qr} onChange={handleChange} placeholder="QR-NH66-RBP-11" required />
              <small className="field-help">Choose a material above, or paste a scanned QR code manually.</small>
            </label>
            {materialsError ? <div className="release-form-alert">{materialsError}</div> : null}
            <label>
              Scanned by
              <input name="scannedBy" value={form.scannedBy} onChange={handleChange} placeholder="Site Engineer" required />
            </label>
            <label>
              Site location
              <input name="location" value={form.location} onChange={handleChange} placeholder="Zone B Slope Face" required />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              <ShieldCheck size={17} />
              {loading ? "Checking evidence..." : "Check Material Release"}
            </button>
          </form>

          <aside className={`release-result-card ${result ? meta.tone : ""}`}>
            {result ? (
              <>
                <div className="release-decision">
                  <span>
                    <DecisionIcon size={22} />
                  </span>
                  <div>
                    <p className="eyebrow">Decision</p>
                    <h2>{result.decision}</h2>
                  </div>
                  <strong className={`decision-stamp ${meta.tone}`}>{meta.tone === "ok" ? "RELEASED" : meta.tone === "warning" ? "HOLD" : "BLOCKED"}</strong>
                </div>

                {result.material ? (
                  <div className="release-material">
                    <strong>{result.material}</strong>
                    <span>{result.batch_number} - {result.supplier}</span>
                    <small>{result.qr_code}</small>
                  </div>
                ) : null}

                <div className="release-reasons">
                  {result.checks?.length ? (
                    <div className="release-checklist">
                      {result.checks.map((check) => (
                        <span className={`release-checkitem ${check.status.toLowerCase().replaceAll(" ", "-")}`} key={`${check.label}-${check.detail}`}>
                          <strong>{check.label}</strong>
                          <em>{check.status}</em>
                          <small>{check.detail}</small>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {result.reasons?.map((reason) => (
                    <div key={reason}>{reason}</div>
                  ))}
                </div>

                {result.material ? (
                  <div className="release-actions">
                    <button className="secondary-button" type="button" onClick={generateReport}>
                      Decision Report
                    </button>
                    <button className="secondary-button" type="button" onClick={askWhy}>
                      Ask AI why
                    </button>
                  </div>
                ) : null}

                {report ? <pre className="decision-report">{report}</pre> : null}
              </>
            ) : (
              <div className="release-empty">
                <QrCode size={34} />
                <strong>Ready to verify site use</strong>
                <span>Enter a project QR and ConstructAsk will decide whether the material can be released today.</span>
              </div>
            )}
          </aside>
        </div>
      </article>
    </section>
  );
}
