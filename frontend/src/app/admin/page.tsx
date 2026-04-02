"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Profile, SuggestedIntroduction } from "@/lib/api";
import { isAuthenticated, isAdminSession } from "@/lib/auth";
import Navbar from "@/components/Navbar";

type WaitlistEntry = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
};

type Tab = "profiles" | "waitlist" | "introductions";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profiles");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [introductions, setIntroductions] = useState<SuggestedIntroduction[]>([]);
  const [introLoading, setIntroLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated() || !isAdminSession()) {
      router.replace("/");
      return;
    }
    Promise.all([api.admin.profiles(), api.admin.waitlist()])
      .then(([p, w]) => { setProfiles(p); setWaitlist(w); })
      .catch(() => setError("Failed to load data."))
      .finally(() => setLoading(false));
  }, [router]);

  const handleApprove = async (email: string) => {
    setApproving(email);
    try {
      await api.admin.approve(email);
      setWaitlist((prev) =>
        prev.map((e) => e.email === email ? { ...e, status: "approved", approved_at: new Date().toISOString() } : e)
      );
    } catch {
      alert("Failed to approve.");
    } finally {
      setApproving(null);
    }
  };

  const loadIntroductions = async () => {
    setIntroLoading(true);
    try {
      const data = await api.admin.suggestedIntroductions();
      setIntroductions(data);
    } catch {
      setError("Failed to load suggested introductions.");
    } finally {
      setIntroLoading(false);
    }
  };

  const handleSendIntroduction = async (idA: string, idB: string) => {
    const key = [idA, idB].sort().join("-");
    setSending(key);
    try {
      await api.admin.sendIntroduction(idA, idB);
      setSent((prev) => new Set(Array.from(prev).concat(key)));
    } catch {
      alert("Failed to send introduction.");
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (profileId: string, name: string) => {
    if (!confirm(`Delete ${name}'s profile? This cannot be undone.`)) return;
    setDeleting(profileId);
    try {
      await api.admin.deleteProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    } catch {
      alert("Failed to delete profile.");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Manage profiles and access requests</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3 mb-6">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(["profiles", "waitlist", "introductions"] as Tab[]).map((t) => (
            <button key={t} onClick={() => {
              setTab(t);
              if (t === "introductions" && introductions.length === 0) loadIntroductions();
            }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}>
              {t === "profiles" && `Profiles (${profiles.length})`}
              {t === "waitlist" && `Waitlist (${waitlist.filter((e) => e.status === "pending").length} pending)`}
              {t === "introductions" && "Introductions"}
            </button>
          ))}
        </div>

        {/* Profiles tab */}
        {tab === "profiles" && (
          <div className="space-y-3">
            {profiles.length === 0 && (
              <p className="text-gray-500 text-sm">No profiles yet.</p>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${typeStyle(p.profile_type)}`}>
                      {p.profile_type.replace("_", " ")}
                    </span>
                    {p.secondary_role && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${typeStyle(p.secondary_role)}`}>
                        {p.secondary_role}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">{p.email}</p>
                  <p className="text-sm text-gray-500 mt-1">{p.title}</p>
                  <p className="text-sm text-gray-500">{p.location}</p>
                  {p.linkedin_url && (
                    <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline mt-1 block">
                      LinkedIn
                    </a>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.skills.slice(0, 5).map((s) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{s}</span>
                    ))}
                    {p.skills.length > 5 && <span className="text-xs text-gray-600">+{p.skills.length - 5} more</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-600">{new Date(p.created_at).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deleting === p.id}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deleting === p.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Introductions tab */}
        {tab === "introductions" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                Top unconnected pairs ranked by compatibility. Send an introduction to email both parties.
              </p>
              <button onClick={loadIntroductions} disabled={introLoading}
                className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors">
                {introLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {introLoading && (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!introLoading && introductions.length === 0 && (
              <p className="text-gray-500 text-sm">No suggestions available. Profiles may be missing embeddings.</p>
            )}
            <div className="space-y-3">
              {introductions.map((intro, i) => {
                const key = [intro.profile_a.id, intro.profile_b.id].sort().join("-");
                const isSent = sent.has(key);
                const isSending = sending === key;
                return (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        {[intro.profile_a, intro.profile_b].map((p) => (
                          <div key={p.id}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-white text-sm">{p.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${typeStyle(p.profile_type)}`}>
                                {p.profile_type.replace("_", " ")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{p.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{p.location}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-600">Score: {intro.score}</span>
                        <button
                          onClick={() => handleSendIntroduction(intro.profile_a.id, intro.profile_b.id)}
                          disabled={isSent || isSending}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            isSent
                              ? "bg-green-500/15 text-green-400 border border-green-500/25 cursor-default"
                              : "bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                          }`}
                        >
                          {isSent ? "Sent" : isSending ? "Sending..." : "Introduce"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Waitlist tab */}
        {tab === "waitlist" && (
          <div className="space-y-3">
            {waitlist.length === 0 && (
              <p className="text-gray-500 text-sm">No waitlist entries yet.</p>
            )}
            {waitlist.map((e) => (
              <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between gap-4">
                <div>
                  {(e.first_name || e.last_name) && (
                    <p className="font-medium text-white">
                      {[e.first_name, e.last_name].filter(Boolean).join(" ")}
                    </p>
                  )}
                  <p className={e.first_name || e.last_name ? "text-sm text-gray-400" : "font-medium text-white"}>{e.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Requested {new Date(e.created_at).toLocaleDateString()}
                    {e.approved_at && ` - Approved ${new Date(e.approved_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {e.status === "pending" ? (
                    <button
                      onClick={() => handleApprove(e.email)}
                      disabled={approving === e.email}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {approving === e.email ? "Approving..." : "Approve"}
                    </button>
                  ) : (
                    <span className="text-xs px-3 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                      Approved
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
    </>
  );
}

function typeStyle(type: string): string {
  const styles: Record<string, string> = {
    job_seeker: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    employer: "bg-purple-500/10 text-purple-400 border-purple-500/25",
    mentor: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    mentee: "bg-green-500/10 text-green-400 border-green-500/25",
  };
  return styles[type] ?? "bg-gray-500/10 text-gray-400 border-gray-500/25";
}
