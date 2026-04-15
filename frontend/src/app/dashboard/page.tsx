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
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center text-stone-500">
          Profile not found.{" "}
          <Link href="/profile/create" className="text-amber-600 ml-1 underline">
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
      <main className="min-h-screen bg-[#faf8f5] px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-end mb-6">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-700"
                aria-label="Notifications"
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-stone-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                    <span className="font-semibold text-stone-800 text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-xs text-stone-400">{unreadCount} unread</span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-stone-400 text-sm">
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

          <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <span />
              <Link
                href="/profile/edit"
                className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Edit Profile
              </Link>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-stone-900">{profile.name}</h2>
                  <ProfileTypeBadge type={profile.profile_type} />
                  {profile.secondary_role && <ProfileTypeBadge type={profile.secondary_role} />}
                </div>
                <p className="text-stone-500 text-sm mt-0.5">{profile.title}</p>
                <p className="text-stone-400 text-xs mt-0.5">{profile.location}</p>
              </div>
            </div>
            <p className="text-stone-700 text-sm mt-4 leading-relaxed">{profile.bio}</p>
            {profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-xs border border-stone-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-stone-100 text-sm text-stone-500">
              <span className="font-medium text-stone-700">Looking for: </span>
              {profile.looking_for}
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 mb-8">
            <button
              onClick={runAnalysis}
              disabled={loadingAnalysis}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 px-6 py-4 font-semibold text-white transition-colors"
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
            <a
              href="/matches"
              className="flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 px-6 py-4 font-semibold text-stone-700 transition-colors"
            >
              View Matches
            </a>
          </div>

          {analyses.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-stone-800">Analysis Results</h3>
                {analysisRunAt && (
                  <span className="text-xs text-stone-400">
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
        <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center">
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
  return (
    <button
      onClick={() => !notification.is_read && onMarkRead(notification.id)}
      className={`w-full text-left px-4 py-3 border-b border-stone-100 last:border-0 transition-colors ${
        notification.is_read
          ? "opacity-50 cursor-default"
          : "hover:bg-stone-50 cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">
          {notification.type === "introduction" ? "🤝" : notification.type === "connection_request" ? "👋" : "✨"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-stone-700 leading-snug">{notification.message}</p>
          {notification.related_profile && (
            <p className="text-xs text-stone-400 mt-0.5">
              {notification.related_profile.name}
            </p>
          )}
          <p className="text-xs text-stone-400 mt-1">
            {new Date(notification.created_at).toLocaleString()}
          </p>
        </div>
        {!notification.is_read && (
          <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
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
  const styles: Record<string, string> = {
    job_seeker: "bg-blue-50 text-blue-700 border-blue-200",
    employer: "bg-purple-50 text-purple-700 border-purple-200",
    mentor: "bg-amber-50 text-amber-700 border-amber-200",
    mentee: "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[type] ?? "bg-stone-100 text-stone-600 border-stone-200"}`}>
      {labels[type] ?? type}
    </span>
  );
}

function ProfileAnalystCard({ result }: { result: Record<string, unknown> }) {
  const score = result.clarity_score as number | undefined;
  const standsOut = (result.what_stands_out as string[]) ?? [];
  const couldBeClearer = (result.what_could_be_clearer as string[]) ?? [];
  const impression = result.impression as string | undefined;
  const raw = result.raw_output as string | undefined;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 space-y-4">
      <h4 className="font-semibold text-amber-800 text-base">Profile Feedback</h4>

      {raw ? (
        <p className="text-sm text-stone-700 leading-relaxed">{raw}</p>
      ) : (
        <>
          {score !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-stone-500 uppercase tracking-wide">Clarity</span>
                <span className="text-sm font-bold text-amber-700">{score}/100</span>
              </div>
              <div className="h-2 rounded-full bg-stone-200">
                <div
                  className="h-2 rounded-full bg-amber-500 transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          )}

          {impression && (
            <p className="text-sm text-stone-700 leading-relaxed">{impression}</p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {standsOut.length > 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">What stands out</p>
                <ul className="space-y-1.5">
                  {standsOut.map((s, i) => (
                    <li key={i} className="text-sm text-stone-700 flex gap-2">
                      <span className="text-green-500 flex-shrink-0">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {couldBeClearer.length > 0 && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Could be clearer</p>
                <ul className="space-y-1.5">
                  {couldBeClearer.map((g, i) => (
                    <li key={i} className="text-sm text-stone-700 flex gap-2">
                      <span className="text-orange-500 flex-shrink-0">-</span>
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
