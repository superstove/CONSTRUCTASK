import React, { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function LoginScreen({ onDemoLogin }: { onDemoLogin: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError("Google sign-in is not configured. Use the demo account instead.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
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
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border border-white rounded-full"></div>
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-neutral-900 font-sans leading-none">
                ConstructAsk
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold">
                Project Intelligence Platform
              </span>
            </div>
          </div>

          <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
            Sign in to access materials, approvals, compliance evidence, and the AI assistant.
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 border border-neutral-300 rounded-xl px-4 py-3 text-sm font-bold text-neutral-800 bg-white hover:bg-neutral-50 transition-colors disabled:opacity-60 cursor-pointer"
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

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-neutral-200"></div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-bold">or</span>
            <div className="flex-1 h-px bg-neutral-200"></div>
          </div>

          <button
            onClick={onDemoLogin}
            className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-xl px-4 py-3 text-sm font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Continue with Demo Account
          </button>

          {error && (
            <p className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-neutral-400 mt-4 uppercase tracking-widest">
          Sign in with Google, or use the demo account
        </p>
      </div>
    </div>
  );
}
