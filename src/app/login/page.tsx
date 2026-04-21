"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const verify = searchParams.get("verify");

  const [magicEmail, setMagicEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState("");

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLoading(true);
    await signIn("email", { email: magicEmail, callbackUrl: "/groups", redirect: false });
    setEmailSent(true);
    setMagicLoading(false);
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredLoading(true);
    setCredError("");
    const result = await signIn("credentials", {
      email: credEmail,
      password: credPassword,
      callbackUrl: "/groups",
      redirect: false,
    });
    if (result?.error) {
      setCredError("Incorrect email or password.");
      setCredLoading(false);
    } else {
      window.location.href = "/groups";
    }
  };

  return (
    <div className="card space-y-4">
      {verify && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
          Check your email for a sign-in link.
        </div>
      )}

      {emailSent ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm text-center">
          Magic link sent! Check your email to complete sign-in.
        </div>
      ) : (
        <>
          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/groups" })}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400">
              <span className="bg-white px-2">or</span>
            </div>
          </div>

          {!showPasswordForm ? (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email"
                required
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
              <button type="submit" disabled={magicLoading} className="btn-primary w-full py-3">
                {magicLoading ? "Sending…" : "Send Magic Link"}
              </button>
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 pt-1"
              >
                Sign in with email &amp; password instead
              </button>
            </form>
          ) : (
            <form onSubmit={handleCredentials} className="space-y-3">
              <input
                type="email"
                required
                value={credEmail}
                onChange={(e) => setCredEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
              <input
                type="password"
                required
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Password"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
              {credError && <p className="text-sm text-red-600">{credError}</p>}
              <button type="submit" disabled={credLoading} className="btn-primary w-full py-3">
                {credLoading ? "Signing in…" : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setCredError(""); }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 pt-1"
              >
                Send magic link instead
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-gray-900">WC2026 Predictions</h1>
          <p className="text-gray-500 mt-1">Sign in to start predicting</p>
        </div>
        <Suspense fallback={<div className="card p-8 text-center text-gray-400">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
