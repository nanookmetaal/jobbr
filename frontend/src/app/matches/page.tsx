"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api, Match } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [matchModal, setMatchModal] = useState<Match | null>(null);
  const [coffeeInviteSent, setCoffeeInviteSent] = useState(false);

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
    api.agents
      .getMatches(profileId)
      .then((m) => { setMatches(m); setIndex(0); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load matches"))
      .finally(() => setLoading(false));
  }, [profileId]);

  const handleSwipe = async (direction: "left" | "right") => {
    if (!profileId) return;
    const match = matches[index];
    const matchedProfileId =
      match.profile_id_a === profileId ? match.profile_id_b : match.profile_id_a;

    try {
      const result = await api.swipes.create({
        swiper_id: profileId,
        swiped_id: matchedProfileId,
        direction,
      });
      if (result.is_mutual) {
        setMatchModal(match);
        setCoffeeInviteSent(false);
      } else {
        setIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save swipe");
    }
  };

  const handleRefresh = async () => {
    if (!profileId) return;
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await api.agents.findMatches(profileId);
      setMatches(fresh);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find matches");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSendCoffeeInvite = async () => {
    if (!matchModal || !profileId) return;
    const matchedProfileId =
      matchModal.profile_id_a === profileId
        ? matchModal.profile_id_b
        : matchModal.profile_id_a;
    try {
      await api.notifications.sendCoffeeInvite({
        from_profile_id: profileId,
        to_profile_id: matchedProfileId,
        message: "Let's grab a coffee!",
      });
      setCoffeeInviteSent(true);
    } catch {
      // silently ignore
    }
  };

  const dismissModal = () => {
    setMatchModal(null);
    setIndex((i) => i + 1);
  };

  const current = matches[index] ?? null;
  const done = !loading && !current && matches.length > 0;
  const empty = !loading && matches.length === 0;

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-12">
      {/* Match Modal */}
      {matchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={dismissModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-gradient-to-br from-blue-900 via-purple-900 to-blue-950 border border-blue-500/40 p-8 text-center shadow-2xl">
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
              It&apos;s a Match!
            </h2>
            <p className="text-blue-200 text-sm mb-6">
              You and{" "}
              <span className="font-semibold text-white">
                {matchModal.matched_profile?.name ?? "this person"}
              </span>{" "}
              both liked each other.
            </p>

            {coffeeInviteSent ? (
              <div className="rounded-xl bg-green-900/40 border border-green-600/40 p-4 mb-4 text-green-300 text-sm font-medium">
                Coffee invite sent! Check your notifications.
              </div>
            ) : (
              <button
                onClick={handleSendCoffeeInvite}
                className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold py-3 px-6 mb-3 transition-all active:scale-95"
              >
                Send Coffee Invite
              </button>
            )}

            <button
              onClick={dismissModal}
              className="w-full rounded-xl border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 font-medium py-3 px-6 transition-colors"
            >
              Keep Browsing
            </button>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            - Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Matches</h1>
        <p className="text-gray-400 text-sm mb-8">
          Curated connections based on complementary goals and skills.
        </p>

        {error && (
          <div className="rounded-xl bg-red-900/30 border border-red-700 text-red-300 px-5 py-4 text-sm mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Spinner />
            <p className="text-gray-500 text-sm">Loading matches...</p>
          </div>
        )}

        {empty && (
          <div className="text-center py-24">
            <p className="text-lg text-gray-400 mb-2">No matches yet</p>
            <p className="text-sm text-gray-600 mb-6">Find people who complement your goals and skills.</p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {refreshing ? <><Spinner /> Finding matches...</> : "Find Matches"}
            </button>
          </div>
        )}

        {done && (
          <div className="text-center py-24">
            <p className="text-lg text-gray-400 mb-2">You&apos;ve seen everyone</p>
            <p className="text-sm text-gray-600 mb-6">Check back later or refresh to find new connections.</p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold transition-colors"
            >
              {refreshing ? <><Spinner /> Finding matches...</> : "Refresh Matches"}
            </button>
          </div>
        )}

        {current && (
          <MatchCard
            match={current}
            onSwipe={handleSwipe}
          />
        )}
      </div>
    </main>
  );
}

function MatchCard({
  match,
  onSwipe,
}: {
  match: Match;
  onSwipe: (direction: "left" | "right") => void;
}) {
  const [swiping, setSwiping] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);

  const profile = match.matched_profile;
  const THRESHOLD = 80;

  const typeLabels: Record<string, string> = {
    job_seeker: "Job Seeker",
    employer: "Employer",
    mentor: "Mentor",
    mentee: "Mentee",
  };

  const handleSwipeAction = async (direction: "left" | "right") => {
    if (swiping) return;
    setSwiping(true);
    await onSwipe(direction);
    setSwiping(false);
  };

  const onDragStart = (clientX: number) => {
    dragStart.current = clientX;
    setDragging(true);
  };

  const onDragMove = (clientX: number) => {
    if (dragStart.current === null || !dragging) return;
    setDragX(clientX - dragStart.current);
  };

  const onDragEnd = () => {
    if (dragStart.current === null) return;
    const dx = dragX;
    setDragging(false);
    setDragX(0);
    dragStart.current = null;
    if (Math.abs(dx) >= THRESHOLD) {
      handleSwipeAction(dx > 0 ? "right" : "left");
    }
  };

  const onMouseDown = (e: React.MouseEvent) => onDragStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => { if (dragging) onDragMove(e.clientX); };
  const onMouseUp = () => onDragEnd();
  const onMouseLeave = () => { if (dragging) onDragEnd(); };
  const onTouchStart = (e: React.TouchEvent) => onDragStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => onDragMove(e.touches[0].clientX);
  const onTouchEnd = () => onDragEnd();

  const rotation = dragX * 0.06;
  const likeOpacity = Math.min(Math.max(dragX / THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / THRESHOLD, 0), 1);

  const cardStyle = dragging
    ? { transform: `translateX(${dragX}px) rotate(${rotation}deg)`, transition: "none", cursor: "grabbing" }
    : { transition: "transform 0.3s ease", cursor: "grab" };

  return (
    <div className="relative select-none">
      <div
        className="absolute inset-0 rounded-2xl flex items-center justify-center z-10 pointer-events-none"
        style={{ opacity: likeOpacity, background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.5)" }}
      >
        <span className="text-green-400 text-2xl font-black tracking-widest rotate-[-15deg] border-4 border-green-400 rounded-lg px-3 py-1">LIKE</span>
      </div>
      <div
        className="absolute inset-0 rounded-2xl flex items-center justify-center z-10 pointer-events-none"
        style={{ opacity: passOpacity, background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.5)" }}
      >
        <span className="text-red-400 text-2xl font-black tracking-widest rotate-[15deg] border-4 border-red-400 rounded-lg px-3 py-1">PASS</span>
      </div>

      <div
        style={cardStyle}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6"
      >
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
            {profile?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div>
            <div className="font-semibold text-white text-lg">{profile?.name ?? "Unknown"}</div>
            <div className="text-sm text-gray-400">{profile?.title ?? ""}</div>
            {profile?.profile_type && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs border border-gray-700">
                {typeLabels[profile.profile_type] ?? profile.profile_type}
              </span>
            )}
          </div>
        </div>

        {profile?.location && (
          <p className="text-xs text-gray-500 mb-4">{profile.location}</p>
        )}

        {profile?.bio && (
          <p className="text-sm text-gray-300 leading-relaxed mb-4">{profile.bio}</p>
        )}

        {profile?.skills && profile.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 text-xs border border-gray-700"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {profile?.looking_for && (
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 px-4 py-3 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Looking for</p>
            <p className="text-sm text-gray-300">{profile.looking_for}</p>
          </div>
        )}

        <div
          className="flex gap-3"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleSwipeAction("left")}
            disabled={swiping}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-800/50 hover:border-red-500 hover:text-red-300 active:scale-95 transition-all disabled:opacity-40 font-medium"
          >
            <XIcon /> Pass
          </button>
          <button
            onClick={() => handleSwipeAction("right")}
            disabled={swiping}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-900/30 border border-green-700/40 text-green-400 hover:bg-green-800/50 hover:border-green-500 hover:text-green-300 active:scale-95 transition-all disabled:opacity-40 font-medium"
          >
            <HeartIcon /> Like
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
