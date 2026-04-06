/**
 * Returns the frontend base URL, respecting environment overrides.
 * - APP_BASE_URL takes top priority (the canonical Phoebe domain)
 * - FRONTEND_URL is a legacy alias
 * - REPLIT_DEV_DOMAIN is used when running on Replit
 * - Falls back to localhost:23896 for local development
 */
export function getFrontendUrl(): string {
  if (process.env["APP_BASE_URL"]) return process.env["APP_BASE_URL"];
  if (process.env["FRONTEND_URL"]) return process.env["FRONTEND_URL"];
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "http://localhost:23896";
}
