export function sanitizeLinkedInUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Extract the username from any linkedin.com/in/... variant
  const match = trimmed.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/);
  if (match) {
    return `https://www.linkedin.com/in/${match[1]}`;
  }

  // Not recognizable as LinkedIn - still ensure https
  return ensureHttps(trimmed);
}

export function sanitizeWebsiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return ensureHttps(trimmed);
}

function ensureHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `https://${url}`;
}
