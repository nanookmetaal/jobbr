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
    <main className="min-h-screen bg-[#faf8f5] flex flex-col">
      <header className="px-8 py-7">
        <span className="text-stone-400 text-xl tracking-[0.25em] uppercase font-sans">jobbr</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md">

          {/* Mission statement */}
          <div className="mb-12">
            <p className="font-serif text-2xl text-stone-800 leading-relaxed mb-5">
              Most of us got here because someone believed in us before we believed in ourselves.
            </p>
            <p className="text-stone-500 text-base leading-relaxed">
              A mentor, a referral, an honest conversation at the right moment.
              Jobbr is for people who want to be that person for someone else - and find the people who will do the same for them.
            </p>
          </div>

          {/* Auth states */}
          {sent ? (
            <div className="border border-stone-200 bg-white rounded-xl px-6 py-8 text-center">
              <p className="text-stone-800 font-medium mb-1">Check your inbox</p>
              <p className="text-stone-500 text-sm">
                We sent a sign-in link to <span className="text-stone-700">{email}</span>. It expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : pending ? (
            <div className="border border-stone-200 bg-white rounded-xl px-6 py-8 text-center">
              <p className="text-stone-800 font-medium mb-1">You are on the list</p>
              <p className="text-stone-500 text-sm">
                We have your request for <span className="text-stone-700">{email}</span>. We will be in touch soon.
              </p>
              <button
                onClick={() => { setPending(false); setEmail(""); }}
                className="mt-5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : needName ? (
            <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
              <p className="text-stone-500 text-sm">One more thing - what is your name?</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                  placeholder="First name"
                  className="flex-1 bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-400 transition-colors"
                  autoFocus
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setError(null); }}
                  placeholder="Last name"
                  className="flex-1 bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
              >
                {loading ? "Sending..." : "Request access"}
              </button>
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
              <button
                type="button"
                onClick={() => { setNeedName(false); setEmail(""); }}
                className="text-xs text-stone-400 hover:text-stone-600 transition-colors text-center"
              >
                Use a different email
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <p className="text-stone-500 text-sm mb-1">
                Jobbr is invite-only. Enter your email to request access or sign in.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="your@email.com"
                className="bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-400 transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
              >
                {loading ? "..." : "Continue"}
              </button>
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
