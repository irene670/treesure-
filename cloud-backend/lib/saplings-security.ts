export const PUBLIC_ORIGINS = new Set([
  "https://irene670.github.io",
  "http://127.0.0.1:4310",
]);

export function resolvePublicOrigin(requestUrl: string, origin: string | null) {
  if (!origin) return null;
  if (origin === new URL(requestUrl).origin || PUBLIC_ORIGINS.has(origin)) return origin;
  return null;
}

export function isAdminEmail(email: string, configuredEmails: string) {
  const allowed = new Set(configuredEmails.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return allowed.has(email.trim().toLowerCase());
}
