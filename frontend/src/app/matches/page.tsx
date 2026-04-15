"use client";

import { useEffect, useState } from "react";
import { api, Match, Profile } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import Navbar from "@/components/Navbar";

const TYPE_LABELS: Record<string, string> = {
  job_seeker: "Job Seeker",
  employer: "Employer",
  mentor: "Mentor",
  mentee: "Mentee",
};

const TYPE_STYLES: Record<string, string> = {
  job_seeker: "bg-blue-50 text-blue-700 border-blue-200",
  employer: "bg-purple-50 text-purple-700 border-purple-200",
  mentor: "bg-amber-50 text-amber-700 border-amber-200",
  mentee: "bg-green-50 text-green-700 border-green-200",
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace("/");
      return;
    }
    const id = localStorage.getItem("profile_id");
    if (!id) {
      setError("No profile found.");
      setLoading(false);
      return;
    }
    setProfileId(id);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    Promise.all([
      api.agents.getMatches(profileId),
      api.connections.getSent(profileId),
    ])
      .then(([m, sent]) => {
        setMatches(m);
        setSentTo(new Set(sent.map((r) => r.to_profile_id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load matches"))
      .finally(() => setLoading(false));
  }, [profileId]);

  const handleRefresh = async () => {
    if (!profileId) return;
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await api.agents.findMatches(profileId);
      setMatches(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find matches");
    } finally {
      setRefreshing(false);
    }
  };

  const openConnect = (profile: Profile) => {
    setConnectTarget(profile);
    setMessage("");
    setSendError(null);
  };

  const handleSend = async () => {
    if (!profileId || !connectTarget || !message.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api.connections.send({
        from_profile_id: profileId,
        to_profile_id: connectTarget.id,
        message: message.trim(),
      });
      setSentTo((prev) => new Set(Array.from(prev).concat(connectTarget.id)));
      setConnectTarget(null);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setSending(false);
    }
  };

  const empty = !loading && matches.length === 0;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#faf8f5] px-4 py-10">
        {connectTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setConnectTarget(null)} />
            <div className="relative z-10 w-full max-w-md bg-white border border-stone-200 rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-stone-900 mb-1">Connect with {connectTarget.name}</h2>
              <p className="text-sm text-stone-500 mb-4">
                Your email will be shared so they can reply directly. Their email stays private.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Hi ${connectTarget.name}, I came across your profile and think we could help each other...`}
                rows={4}
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-400 outline-none focus:border-amber-400 resize-none mb-3 transition-colors"
              />
              {sendError && (
                <p className="text-sm text-red-500 mb-3">{sendError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setConnectTarget(null)}
                  className="flex-1 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 py-2.5 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-2.5 text-sm font-semibold transition-colors"
                >
                  {sending ? "Sending..." : "Send Request"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mt-8 mb-2">
            <div>
              <h1 className="text-3xl font-bold text-stone-900">Matches</h1>
              <p className="text-stone-500 text-sm mt-1">
                Curated connections based on complementary goals and skills.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-600 text-sm font-medium border border-stone-200 transition-colors"
            >
              {refreshing ? <><Spinner />Finding...</> : "Refresh"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-600 px-5 py-4 text-sm mt-4 mb-6">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Spinner />
              <p className="text-stone-400 text-sm">Loading matches...</p>
            </div>
          )}

          {empty && (
            <div className="text-center py-24">
              <p className="text-lg text-stone-500 mb-2">No matches yet</p>
              <p className="text-sm text-stone-400 mb-6">Find people who complement your goals and skills.</p>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-semibold transition-colors"
              >
                {refreshing ? <><Spinner /> Finding matches...</> : "Find Matches"}
              </button>
            </div>
          )}

          {!loading && matches.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {matches.map((match) => {
                const profile = match.matched_profile;
                if (!profile) return null;
                const requested = sentTo.has(profile.id);
                return (
                  <ProfileCard
                    key={match.id}
                    profile={profile}
                    match={match}
                    requested={requested}
                    onConnect={() => openConnect(profile)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function ProfileCard({
  profile,
  match,
  requested,
  onConnect,
}: {
  profile: Profile;
  match: Match;
  requested: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-stone-900">{profile.name}</div>
          <div className="text-sm text-stone-500 truncate">{profile.title}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_STYLES[profile.profile_type] ?? "bg-stone-100 text-stone-600 border-stone-200"}`}>
              {TYPE_LABELS[profile.profile_type] ?? profile.profile_type}
            </span>
            {profile.secondary_role && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_STYLES[profile.secondary_role] ?? "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {TYPE_LABELS[profile.secondary_role] ?? profile.secondary_role}
              </span>
            )}
          </div>
        </div>
      </div>

      {profile.location && (
        <p className="text-xs text-stone-400">{profile.location}</p>
      )}

      {profile.bio && (
        <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{profile.bio}</p>
      )}

      {profile.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 6).map((skill) => (
            <span key={skill} className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs border border-stone-200">
              {skill}
            </span>
          ))}
          {profile.skills.length > 6 && (
            <span className="text-xs text-stone-400 self-center">+{profile.skills.length - 6}</span>
          )}
        </div>
      )}

      {profile.looking_for && (
        <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Looking for</p>
          <p className="text-sm text-stone-600 line-clamp-2">{profile.looking_for}</p>
        </div>
      )}

      {match.compatibility_score > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-stone-100">
            <div
              className="h-1.5 rounded-full bg-amber-400"
              style={{ width: `${match.compatibility_score}%` }}
            />
          </div>
          <span className="text-xs text-stone-400">{match.compatibility_score}% match</span>
        </div>
      )}

      <button
        onClick={onConnect}
        disabled={requested}
        className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
          requested
            ? "bg-stone-100 text-stone-400 border border-stone-200 cursor-default"
            : "bg-amber-600 hover:bg-amber-500 text-white"
        }`}
      >
        {requested ? "Request Sent" : "Connect"}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
