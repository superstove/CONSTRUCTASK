import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { X, QrCode, Keyboard, Upload } from "lucide-react";

interface QrScannerModalProps {
  onResult: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
}

const REGION_ID = "qr-reader-region";

export default function QrScannerModal({ onResult, onClose, title = "Scan QR Code" }: QrScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(REGION_ID, {
      verbose: false,
      // Only look for QR codes (faster + more accurate than scanning all formats),
      // and use the browser's native, hardware-accelerated detector when available.
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 15,
          // Large, responsive scan box (70% of the smaller side) so the QR is
          // easy to fill — improves detection accuracy a lot.
          qrbox: (vw: number, vh: number) => {
            const size = Math.floor(Math.min(vw, vh) * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => finish(decodedText),
        () => { /* per-frame decode misses are normal — ignore */ }
      )
      .then(() => { if (!cancelled) startedRef.current = true; })
      .catch((e) => { if (!cancelled) setCameraError(e?.message || "Camera not available"); });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s && startedRef.current) {
        s.stop().then(() => s.clear()).catch(() => {});
        startedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopThen = (cb: () => void) => {
    const s = scannerRef.current;
    if (s && startedRef.current) {
      startedRef.current = false;
      s.stop().then(() => { s.clear(); cb(); }).catch(() => cb());
    } else {
      cb();
    }
  };

  const finish = (text: string) => {
    const value = text.trim();
    if (!value) return;
    stopThen(() => onResult(value));
  };

  // Decode a QR from an uploaded image file (no camera needed).
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (startedRef.current) { await s.stop(); startedRef.current = false; }
      const text = await s.scanFile(file, false);
      finish(text);
    } catch {
      setFileError("No QR code found in that image. Use a clearer, well-cropped picture.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => stopThen(onClose)}>
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-neutral-900" />
            <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
          </div>
          <button onClick={() => stopThen(onClose)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-black cursor-pointer" aria-label="Close scanner">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!cameraError ? (
            <>
              <div id={REGION_ID} className="w-full overflow-hidden rounded-xl bg-black" />
              <p className="text-[11px] text-neutral-500 text-center mt-3">
                Point the camera at a material's QR code. It detects automatically.
              </p>
            </>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
              Camera unavailable ({cameraError}). Enter the QR code manually below.
            </div>
          )}

          {/* Upload a QR image (decoded locally, no camera needed) */}
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold mb-2">
              <Upload className="w-3 h-3" /> Or upload a QR image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="block w-full text-[11px] text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-xs file:font-bold file:cursor-pointer hover:file:bg-neutral-800"
            />
            {fileError && <p className="text-[11px] text-red-600 mt-2">{fileError}</p>}
          </div>

          {/* Manual fallback — always available (great for laptops without a camera) */}
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold mb-2">
              <Keyboard className="w-3 h-3" /> Or enter QR code manually
            </label>
            <div className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) finish(manual); }}
                placeholder="e.g. QR-NH66-RBP-11"
                className="flex-1 text-xs font-mono p-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
              />
              <button
                onClick={() => manual.trim() && finish(manual)}
                disabled={!manual.trim()}
                className="bg-black text-white rounded-lg px-4 text-xs font-bold hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
