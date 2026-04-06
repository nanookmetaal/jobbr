const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ProfileType = "job_seeker" | "employer" | "mentor" | "mentee";

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  profile_type: ProfileType;
  secondary_role: "mentor" | "mentee" | null;
  title: string;
  bio: string;
  skills: string[];
  experience_years: number;
  location: string;
  looking_for: string;
  work_history: string | null;
  education: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileCreate {
  name: string;
  email: string;
  avatar_url?: string;
  profile_type: ProfileType;
  secondary_role?: "mentor" | "mentee" | null;
  title: string;
  bio: string;
  skills: string[];
  experience_years: number;
  location: string;
  looking_for: string;
  work_history?: string;
  education?: string;
  linkedin_url?: string;
  website_url?: string;
}

export interface AgentAnalysis {
  id: string;
  profile_id: string;
  agent_type: string;
  result: Record<string, unknown>;
  created_at: string;
}

export interface Match {
  id: string;
  profile_id_a: string;
  profile_id_b: string;
  compatibility_score: number;
  created_at: string;
  matched_profile: Profile | null;
}

export interface Notification {
  id: string;
  profile_id: string;
  type: "mutual_match" | "coffee_invite";
  related_profile_id: string;
  related_profile: Profile | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ConnectionRequest {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  message: string;
  created_at: string;
}

export interface SuggestedIntroduction {
  profile_a: Profile;
  profile_b: Profile;
  score: number;
  previous_introduction?: {
    introduced_by: string;
    introduced_at: string;
    message: string | null;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    requestMagicLink: (email: string, firstName?: string, lastName?: string) =>
      request<{ message: string }>("/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName }),
      }),
    verify: (token: string) =>
      request<{ token: string; email: string; profile_id: string | null; is_admin: boolean }>(
        `/auth/verify?token=${encodeURIComponent(token)}`
      ),
    changeEmail: (newEmail: string) =>
      request<{ message: string }>("/auth/change-email", {
        method: "POST",
        body: JSON.stringify({ new_email: newEmail }),
      }),
  },
  profiles: {
    create: (data: ProfileCreate) =>
      request<Profile>("/profiles", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    list: () => request<Profile[]>("/profiles"),

    findByEmail: (email: string) =>
      request<Profile[]>(`/profiles?email=${encodeURIComponent(email)}`),

    get: (id: string) => request<Profile>(`/profiles/${id}`),

    update: (id: string, data: Partial<ProfileCreate>) =>
      request<Profile>(`/profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/profiles/${id}`, { method: "DELETE" }),
  },

  agents: {
    getAnalyses: (profileId: string) =>
      request<AgentAnalysis[]>(`/agents/analyses/${profileId}`),

    analyze: (profileId: string) =>
      request<AgentAnalysis[]>("/agents/analyze", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
      }),

    getMatches: (profileId: string) =>
      request<Match[]>(`/agents/matches/${profileId}`),

    findMatches: (profileId: string) =>
      request<Match[]>("/agents/matches", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
      }),
  },

  admin: {
    profiles: () => request<Profile[]>("/admin/profiles"),
    waitlist: () => request<{ id: string; email: string; first_name: string | null; last_name: string | null; status: string; created_at: string; approved_at: string | null }[]>("/admin/waitlist"),
    approve: (email: string) =>
      request<{ message: string }>(`/admin/waitlist/${encodeURIComponent(email)}/approve`, { method: "POST" }),
    unapprove: (email: string) =>
      request<{ message: string }>(`/admin/waitlist/${encodeURIComponent(email)}/unapprove`, { method: "POST" }),
    deleteProfile: (profileId: string) =>
      request<{ message: string }>(`/admin/profiles/${profileId}`, { method: "DELETE" }),
    invite: (email: string) =>
      request<{ message: string }>("/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    suggestedIntroductions: () =>
      request<SuggestedIntroduction[]>("/admin/suggested-introductions"),
    sendIntroduction: (profileIdA: string, profileIdB: string, message?: string) =>
      request<{ message: string }>("/admin/introductions", {
        method: "POST",
        body: JSON.stringify({ profile_id_a: profileIdA, profile_id_b: profileIdB, message: message || null }),
      }),
  },

  notifications: {
    list: (profileId: string) => request<Notification[]>(`/notifications/${profileId}`),
    markRead: (notificationId: string) =>
      request<Notification>(`/notifications/${notificationId}/read`, { method: "PATCH" }),
    sendCoffeeInvite: (data: { from_profile_id: string; to_profile_id: string; message: string }) =>
      request<Notification>("/notifications/coffee-invite", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  connections: {
    send: (data: { from_profile_id: string; to_profile_id: string; message: string }) =>
      request<ConnectionRequest>("/connections", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getSent: (profileId: string) =>
      request<ConnectionRequest[]>(`/connections/sent/${profileId}`),
  },
};
