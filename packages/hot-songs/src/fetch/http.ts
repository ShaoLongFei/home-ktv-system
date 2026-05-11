import type { SourceDefinition } from "../contracts.js";

export type FetchText = (url: string, timeoutMs: number) => Promise<string>;

export async function fetchText(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "home-ktv-hot-songs/0.1 (+public metadata only)",
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }

  return response.text();
}

export function buildSourceFetchHeaders(
  source: SourceDefinition
): Record<string, string> {
  const headers: Record<string, string> = { ...(source.headers ?? {}) };

  if (source.authCookieEnv !== undefined) {
    const cookieValue = process.env[source.authCookieEnv];
    if (cookieValue !== undefined && cookieValue.length > 0) {
      headers.cookie = cookieValue;
    }
  }

  return headers;
}
