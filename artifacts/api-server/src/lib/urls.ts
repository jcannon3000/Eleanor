/**
 * Returns the frontend base URL, respecting environment overrides.
 * - FRONTEND_URL takes top priority (explicit local or production override)
 * - REPLIT_DEV_DOMAIN is used when running on Replit
 * - Falls back to localhost:23896 for local development
 */
export function getFrontendUrl(): string {
  if (process.env["FRONTEND_URL"]) return process.env["FRONTEND_URL"];
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "http://localhost:23896";
}
