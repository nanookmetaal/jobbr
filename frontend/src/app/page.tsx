"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.requestMagicLink(email.trim());
      if (res.message === "need_name") {
        setNeedName(true);
      } else if (res.message === "request_pending") {
        setPending(true);
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.requestMagicLink(email.trim(), firstName.trim(), lastName.trim());
      if (res.message === "request_pending") {
        setNeedName(false);
        setPending(true);
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-blue-950/30 to-purple-950/20 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto">
        <h1 className="text-7xl font-bold tracking-tight bg-gradient-to-br from-white via-blue-100 to-blue-400 bg-clip-text text-transparent mb-4">
          Jobbr
        </h1>

        <p className="text-xl text-gray-300 mb-4 leading-relaxed text-balance">
          Find your next opportunity or mentor.
        </p>

        <p className="text-sm text-gray-500 mb-6 text-balance">
          The professional matching platform that understands what you actually need.
          Job seekers, employers, mentors, and mentees - all in one place.
        </p>

        <p className="text-xs text-gray-600 mb-10 text-balance">
          Jobbr is currently invite-only. Enter your email to request access - you&apos;ll hear back once approved.
        </p>

        <div className="w-full max-w-sm mx-auto">
          {needName ? (
            <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
              <p className="text-sm text-gray-400 text-center mb-1">
                One more thing - what&apos;s your name?
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                  placeholder="First name"
                  className="flex-1 rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none px-4 py-3.5 text-sm text-white placeholder-gray-500 transition-colors"
                  autoFocus
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setError(null); }}
                  placeholder="Last name"
                  className="flex-1 rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none px-4 py-3.5 text-sm text-white placeholder-gray-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3.5 font-semibold text-white transition-colors"
              >
                {loading ? "Requesting..." : "Request access"}
              </button>
              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
              <button
                type="button"
                onClick={() => { setNeedName(false); setEmail(""); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Use a different email
              </button>
            </form>
          ) : sent ? (
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-6 py-8 text-center">
              <div className="text-2xl mb-3">📬</div>
              <p className="text-white font-semibold mb-1">Check your email</p>
              <p className="text-sm text-gray-400">
                We sent a sign-in link to <span className="text-gray-200">{email}</span>.
                It expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : pending ? (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-6 py-8 text-center">
              <div className="text-2xl mb-3">⏳</div>
              <p className="text-white font-semibold mb-1">Request received</p>
              <p className="text-sm text-gray-400">
                Your access request for <span className="text-gray-200">{email}</span> is pending approval.
                You&apos;ll get an email once you&apos;re approved.
              </p>
              <button
                onClick={() => { setPending(false); setEmail(""); }}
                className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="Enter your email"
                className="rounded-xl bg-gray-900 border border-gray-700 focus:border-blue-500 focus:outline-none px-4 py-3.5 text-sm text-white placeholder-gray-500 transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3.5 font-semibold text-white transition-colors"
              >
                {loading ? "Requesting..." : "Request access"}
              </button>
              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
            </form>
          )}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 w-full max-w-lg">
          {[
            { label: "Smart Matching", desc: "Matched on complementary goals and skills" },
            { label: "Profile Coaching", desc: "Get actionable feedback on your profile" },
            { label: "Connect", desc: "Reach out to people who get it" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center text-center gap-2">
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
                {f.label}
              </div>
              <div className="text-xs text-gray-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
