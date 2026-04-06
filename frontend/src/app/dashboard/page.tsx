"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Profile, AgentAnalysis, Notification } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import Navbar from "@/components/Navbar";

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analyses, setAnalyses] = useState<AgentAnalysis[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisRunAt, setAnalysisRunAt] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }
    const idFromQuery = searchParams.get("profile_id");
    const idFromStorage = localStorage.getItem("profile_id");
    const id = idFromQuery ?? idFromStorage;
    if (!id) {
      router.push("/profile/create");
      return;
    }
    setProfileId(id);
    localStorage.setItem("profile_id", id);
  }, [searchParams, router]);

  useEffect(() => {
    if (!profileId) return;
    setLoadingProfile(true);
    Promise.all([
      api.profiles.get(profileId),
      api.agents.getAnalyses(profileId),
      api.notifications.list(profileId),
    ])
      .then(([prof, saved, savedNotifs]) => {
        setProfile(prof);
        if (saved.length > 0) {
          setAnalyses(saved);
          setAnalysisRunAt(saved[0].created_at);
        }
        setNotifications(savedNotifs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load profile"))
      .finally(() => setLoadingProfile(false));
  }, [profileId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const refreshNotifications = async (pid: string) => {
    const notifs = await api.notifications.list(pid);
    setNotifications(notifs);
  };

  const runAnalysis = async () => {
    if (!profileId) return;
    setLoadingAnalysis(true);
    setError(null);
    try {
      const results = await api.agents.analyze(profileId);
      setAnalyses(results);
      setAnalysisRunAt(results[0]?.created_at ?? new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const updated = await api.notifications.markRead(notificationId);
      setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch {
      // silently ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loadingProfile) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
          Profile not found.{" "}
          <Link href="/profile/create" className="text-blue-400 ml-1 underline">
            Create one
          </Link>
        </div>
      </>
    );
  }

  const analystResult = analyses.find((a) => a.agent_type === "profile_analyst");
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-end mb-6">
          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="relative p-2 rounded-full hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
              aria-label="Notifications"
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-xs text-gray-400">{unreadCount} unread</span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <NotificationItem
                        key={notif.id}
                        notification={notif}
                        onMarkRead={handleMarkRead}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <span />
            <Link
              href="/profile/edit"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Edit Profile
            </Link>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                <ProfileTypeBadge type={profile.profile_type} />
                {profile.secondary_role && <ProfileTypeBadge type={profile.secondary_role} />}
              </div>
              <p className="text-gray-400 text-sm mt-0.5">{profile.title}</p>
              <p className="text-gray-500 text-xs mt-0.5">{profile.location}</p>
            </div>
          </div>
          <p className="text-gray-300 text-sm mt-4 leading-relaxed">{profile.bio}</p>
          {profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {profile.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 text-xs border border-gray-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
            <span className="font-medium text-gray-300">Looking for: </span>
            {profile.looking_for}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={runAnalysis}
          disabled={loadingAnalysis}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-6 py-4 font-semibold text-white transition-colors mb-8"
        >
          {loadingAnalysis ? (
            <>
              <Spinner />
              Analyzing...
            </>
          ) : (
            "Analyze My Profile"
          )}
        </button>

        {analyses.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Analysis Results</h3>
              {analysisRunAt && (
                <span className="text-xs text-gray-500">
                  Last run {new Date(analysisRunAt).toLocaleString()}
                </span>
              )}
            </div>

            {analystResult && <ProfileAnalystCard result={analystResult.result} />}
          </div>
        )}
      </div>
    </main>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isMatch = notification.type === "mutual_match";
  return (
    <button
      onClick={() => !notification.is_read && onMarkRead(notification.id)}
      className={`w-full text-left px-4 py-3 border-b border-gray-800 last:border-0 transition-colors ${
        notification.is_read
          ? "opacity-50 cursor-default"
          : "hover:bg-gray-800/60 cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">{isMatch ? "✨" : "☕"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-snug">{notification.message}</p>
          {notification.related_profile && (
            <p className="text-xs text-gray-500 mt-0.5">
              {notification.related_profile.name}
            </p>
          )}
          <p className="text-xs text-gray-600 mt-1">
            {new Date(notification.created_at).toLocaleString()}
          </p>
        </div>
        {!notification.is_read && (
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
        )}
      </div>
    </button>
  );
}

function ProfileTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    job_seeker: "Job Seeker",
    employer: "Employer",
    mentor: "Mentor",
    mentee: "Mentee",
  };
  return (
    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-xs font-medium border border-blue-500/25">
      {labels[type] ?? type}
    </span>
  );
}

function ProfileAnalystCard({ result }: { result: Record<string, unknown> }) {
  const score = result.completeness_score as number | undefined;
  const strengths = (result.strengths as string[]) ?? [];
  const gaps = (result.gaps as string[]) ?? [];
  const summary = result.summary as string | undefined;
  const raw = result.raw_output as string | undefined;

  return (
    <div className="rounded-xl border border-blue-800 bg-blue-950/20 p-5 space-y-4">
      <h4 className="font-semibold text-blue-300 text-base">Profile Analysis</h4>

      {raw ? (
        <p className="text-sm text-gray-300 leading-relaxed">{raw}</p>
      ) : (
        <>
          {score !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Completeness</span>
                <span className="text-sm font-bold text-blue-300">{score}/100</span>
              </div>
              <div className="h-2 rounded-full bg-gray-800">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-300 transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          )}

          {summary && (
            <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {strengths.length > 0 && (
              <div className="rounded-lg bg-green-950/30 border border-green-800/50 p-3">
                <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Strengths</p>
                <ul className="space-y-1.5">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-green-400 flex-shrink-0">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gaps.length > 0 && (
              <div className="rounded-lg bg-orange-950/30 border border-orange-800/50 p-3">
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">Gaps</p>
                <ul className="space-y-1.5">
                  {gaps.map((g, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-orange-400 flex-shrink-0">-</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "h-8 w-8" : "h-4 w-4";
  return (
    <svg className={`animate-spin ${sz}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
