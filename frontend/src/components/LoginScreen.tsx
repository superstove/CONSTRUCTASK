import React, { useState } from "react";
import { ShieldCheck, Loader2, Info, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function LoginScreen({ onDemoLogin }: { onDemoLogin: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleNote, setShowGoogleNote] = useState(false);

  const handleGoogleSignIn = () => {
    if (!supabase) {
      setError("Google sign-in is not configured. Use the demo account instead.");
      return;
    }
    setShowGoogleNote(true);
  };

  const proceedWithGoogle = async () => {
    setShowGoogleNote(false);
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
    // On success the browser redirects to Google, then back here.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070A] px-4 bg-cover bg-center" style={{ backgroundImage: `url('/hero-bg.jpg')` }}>
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-[#05070A]/80 backdrop-blur-sm z-0"></div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-[#0B0F17]/90 backdrop-blur-xl border border-[#1A2433] rounded-2xl shadow-2xl shadow-black/50 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#1A2433] rounded-xl flex items-center justify-center shrink-0 border border-[#1A2433] shadow-inner">
              <div className="w-4 h-4 border-2 border-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white font-sans leading-none">
                ConstructAsk
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-500 font-bold drop-shadow-[0_0_2px_rgba(6,182,212,0.8)]">
                Project Intelligence Platform
              </span>
            </div>
          </div>

          <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
            Sign in to access materials, approvals, compliance evidence, and the AI assistant.
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 border border-[#1A2433] rounded-xl px-4 py-3 text-sm font-bold text-white bg-[#05070A] hover:bg-white/5 transition-colors disabled:opacity-60 cursor-pointer shadow-inner"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.21 1.66l3.16-3.16A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.36 12 5.36z" />
              </svg>
            )}
            Sign in with Google
          </button>

          {(import.meta as any).env?.VITE_ENABLE_DEMO !== "false" && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-[#1A2433]"></div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-bold">or</span>
                <div className="flex-1 h-px bg-[#1A2433]"></div>
              </div>

              <button
                onClick={onDemoLogin}
                className="w-full flex items-center justify-center gap-2 bg-white/10 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-bold hover:bg-white/20 transition-all cursor-pointer shadow-md"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Continue with Demo Account
              </button>
            </>
          )}

          {error && (
            <p className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-neutral-500 mt-6 uppercase tracking-widest">
          Tip: the Demo Account has the full sample data
        </p>
      </div>

      {showGoogleNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm px-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setShowGoogleNote(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
              <Info className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-neutral-900 tracking-tight">Signing in opens a fresh workspace</h3>
            <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
              A Google account starts empty. All the sample materials, passports, risks and audit records
              live in the <span className="font-bold text-neutral-700">Demo Account</span>.
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={proceedWithGoogle}
                className="w-full bg-neutral-900 text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Continue with Google
              </button>
              <button
                onClick={() => { setShowGoogleNote(false); onDemoLogin(); }}
                className="w-full bg-white border border-neutral-300 text-neutral-800 rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Use Demo Account instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
