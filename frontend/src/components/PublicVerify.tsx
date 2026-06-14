import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  BadgeCheck,
  KeyRound,
  Fingerprint,
  RefreshCw,
  LogIn,
} from "lucide-react";
import { verifyDppMaterialPublic, dppQrPngUrl, DppVerification } from "../api/backendClient";

/**
 * Public, no-login verification page. Reached by scanning a material's QR, which
 * opens /?verify=<materialId>. Anyone can confirm a material is authentic and
 * untampered — the proof is an Ed25519 signature, not a "trust our database" lookup.
 */
export default function PublicVerify({ materialId }: { materialId: string }) {
  const [result, setResult] = useState<DppVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await verifyDppMaterialPublic(materialId));
    } catch (err: any) {
      setError(err?.message || "Could not reach the verification service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

  const verdict = result?.verdict;
  const tone =
    verdict === "AUTHENTIC"
      ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", icon: "text-emerald-600" }
      : verdict === "TAMPERED"
      ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "text-red-600" }
      : { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: "text-amber-600" };

  const fields = (result?.signed_fields || {}) as Record<string, any>;

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center px-4 py-10">
      {/* Brand header + sign-in entry into the full app */}
      <div className="w-full max-w-lg flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-neutral-900">ConstructAsk</span>
          <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-widest text-neutral-400 border-l border-neutral-300 pl-2 ml-1">
            Material Verification
          </span>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-700 border border-neutral-300 rounded-lg px-3 py-1.5 hover:bg-neutral-100 transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" /> Sign in
        </a>
      </div>

      <div className="w-full max-w-lg space-y-5">
        {loading && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center shadow-sm">
            <Loader2 className="w-7 h-7 text-neutral-400 animate-spin mx-auto" />
            <p className="text-sm text-neutral-500 mt-3">Verifying cryptographic signature…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center shadow-sm">
            <ShieldAlert className="w-8 h-8 text-neutral-400 mx-auto" />
            <p className="text-sm font-bold text-neutral-800 mt-3">Verification unavailable</p>
            <p className="text-xs text-neutral-500 mt-1">{error}</p>
            <button
              onClick={run}
              className="inline-flex items-center gap-1.5 mt-4 bg-neutral-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-neutral-800"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {result && !loading && (
          <>
            {/* Verdict banner */}
            <div className={`rounded-2xl border ${tone.bg} ${tone.border} p-6 shadow-sm`}>
              <div className="flex items-center gap-3">
                {verdict === "AUTHENTIC" ? (
                  <ShieldCheck className={`w-9 h-9 ${tone.icon}`} />
                ) : (
                  <ShieldAlert className={`w-9 h-9 ${tone.icon}`} />
                )}
                <div>
                  <p className={`text-2xl font-extrabold tracking-tight ${tone.text}`}>
                    {verdict === "AUTHENTIC" ? "Authentic" : verdict === "TAMPERED" ? "Tampered" : "Untrusted issuer"}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {verdict === "AUTHENTIC"
                      ? "This material is genuine and unaltered."
                      : verdict === "TAMPERED"
                      ? "This material's data was changed after issuance."
                      : "Signature is valid but the issuer is not accredited."}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-neutral-600 mt-4 leading-relaxed">{result.reason}</p>
            </div>

            {/* Signed material identity */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
                Signed material identity
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="Product" value={fields.product} />
                <Field label="Batch" value={fields.batch} />
                <Field label="Supplier" value={fields.supplier} />
                <Field label="Quantity" value={fields.quantity} />
                <Field label="Passport ID" value={fields.passport_id} full />
                {Array.isArray(fields.certificates) && fields.certificates.length > 0 && (
                  <Field label="Certificates" value={fields.certificates.join(", ")} full />
                )}
              </div>
            </div>

            {/* Cryptographic proof */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
                Cryptographic proof
              </h3>
              <div className="space-y-3 text-xs font-mono text-neutral-600">
                <Crypto icon={<BadgeCheck className="w-3.5 h-3.5" />} label="Issuer" value={result.issuer_name} />
                <Crypto icon={<KeyRound className="w-3.5 h-3.5" />} label="Algorithm" value={result.algorithm} />
                <Crypto icon={<Fingerprint className="w-3.5 h-3.5" />} label="Key fingerprint" value={result.key_fingerprint} />
                <Crypto icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Signature" value={result.signature_preview} />
              </div>
              <p className="text-[10px] text-neutral-400 mt-4 leading-snug">
                Verified by an Ed25519 digital signature checked against an accredited trust registry — no
                database lookup needed. Altering any signed field (batch, supplier, quantity) breaks this signature.
              </p>
            </div>

            {/* The QR itself, for reference */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
              <img
                src={dppQrPngUrl(materialId)}
                alt="Material QR code"
                className="w-20 h-20 rounded-lg border border-neutral-150"
              />
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                This is the QR printed on the material. Scanning it always lands here and re-checks the
                signature live, so a copied or edited label cannot fake a valid result.
              </p>
            </div>
          </>
        )}

        <p className="text-center text-[10px] text-neutral-400 pt-2">
          Powered by ConstructAsk · Verifiable Digital Product Passport
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: any; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <span className="block text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
      <span className="text-neutral-900 font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

function Crypto({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-neutral-400">
        {icon} {label}
      </span>
      <span className="text-neutral-800 break-all text-right">{value ?? "—"}</span>
    </div>
  );
}
