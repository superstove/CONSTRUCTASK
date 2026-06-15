import React, { useEffect, useState } from "react";
import { Printer, Loader2, BadgeCheck } from "lucide-react";
import { verifyDppMaterialPublic, dppQrPngUrl, DppVerification } from "../api/backendClient";

/**
 * Printable QR label for a material. Reached via /?label=<materialId>.
 * Stick this on the physical material — scanning the QR opens the public
 * verification page and re-checks the Ed25519 signature live.
 */
export default function QrLabel({ materialId }: { materialId: string }) {
  const [info, setInfo] = useState<DppVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifyDppMaterialPublic(materialId)
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [materialId]);

  const fields = (info?.signed_fields || {}) as Record<string, any>;

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center px-4 py-10">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      {/* The label card (this is what prints) */}
      <div className="bg-white border border-neutral-300 rounded-2xl w-[340px] p-6 text-center shadow-sm">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <BadgeCheck className="w-4 h-4 text-neutral-900" />
          <span className="text-sm font-bold tracking-tight text-neutral-900">Construct Ask</span>
        </div>

        {loading ? (
          <div className="py-16">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <img
              src={dppQrPngUrl(materialId)}
              alt="Verification QR code"
              className="w-52 h-52 mx-auto border border-neutral-200 rounded-lg"
            />
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mt-4">
              Scan to verify authenticity
            </p>
            <div className="mt-3 pt-3 border-t border-neutral-150 text-left text-xs space-y-1">
              <p className="font-bold text-neutral-900">{fields.product || `Material #${materialId}`}</p>
              {fields.batch && <p className="text-neutral-500">Batch: {fields.batch}</p>}
              {fields.supplier && <p className="text-neutral-500">Supplier: {fields.supplier}</p>}
              {fields.passport_id && (
                <p className="text-[9.5px] font-mono text-neutral-400 break-all pt-1">{fields.passport_id}</p>
              )}
            </div>
            <p className="text-[9px] text-neutral-400 mt-3 leading-snug">
              Tamper-evident · Ed25519 signed · verifiable by anyone
            </p>
          </>
        )}
      </div>

      <button
        onClick={() => window.print()}
        className="no-print inline-flex items-center gap-1.5 mt-6 bg-neutral-900 text-white text-xs font-bold px-5 py-2.5 rounded-lg hover:bg-neutral-800"
      >
        <Printer className="w-4 h-4" /> Print label
      </button>
    </div>
  );
}
