/**
 * Configuration resolved from the environment.
 *
 * - `ZEPHYR_API_TOKEN` is required; the server fails fast if it is missing.
 * - The base URL comes from `ZEPHYR_BASE_URL` if set, otherwise it is derived
 *   from `ZEPHYR_REGION` (default `us`).
 */

export const REGION_BASE_URLS: Record<string, string> = {
  us: "https://api.zephyrscale.smartbear.com/v2",
  eu: "https://eu.api.zephyrscale.smartbear.com/v2",
  au: "https://au.api.zephyrscale.smartbear.com/v2",
  de: "https://de.api.zephyrscale.smartbear.com/v2",
};

export const DEFAULT_REGION = "us";

export interface ZephyrConfig {
  token: string;
  baseUrl: string;
}

export class ConfigError extends Error {}

/**
 * Resolve configuration from a plain environment map (defaults to
 * `process.env`). Throws {@link ConfigError} with an actionable message when
 * required values are missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ZephyrConfig {
  const token = env.ZEPHYR_API_TOKEN?.trim();
  if (!token) {
    throw new ConfigError(
      "ZEPHYR_API_TOKEN is not set. Generate a Zephyr Scale API key in Jira " +
        "(profile menu -> 'Zephyr API keys') and expose it as ZEPHYR_API_TOKEN.",
    );
  }

  const baseUrl = resolveBaseUrl(env);
  return { token, baseUrl };
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const explicit = env.ZEPHYR_BASE_URL?.trim();
  if (explicit) {
    return stripTrailingSlash(explicit);
  }

  const region = (env.ZEPHYR_REGION?.trim() || DEFAULT_REGION).toLowerCase();
  const url = REGION_BASE_URLS[region];
  if (!url) {
    const known = Object.keys(REGION_BASE_URLS).join(", ");
    throw new ConfigError(
      `Unknown ZEPHYR_REGION "${region}". Expected one of: ${known}. ` +
        "Alternatively set ZEPHYR_BASE_URL to a full base URL.",
    );
  }
  return url;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
