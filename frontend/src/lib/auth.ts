export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

export function getAuthEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_email");
}

export function isAdminSession(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("auth_is_admin") === "true";
}

export function setSession(token: string, email: string, profileId: string | null, isAdmin: boolean): void {
  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_email", email);
  localStorage.setItem("auth_is_admin", isAdmin ? "true" : "false");
  if (profileId) localStorage.setItem("profile_id", profileId);
}

export function clearSession(): void {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_email");
  localStorage.removeItem("auth_is_admin");
  localStorage.removeItem("profile_id");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
