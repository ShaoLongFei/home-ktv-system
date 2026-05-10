export type FetchText = (url: string, timeoutMs: number) => Promise<string>;

export async function fetchText(
  url: string,
  timeoutMs: number
): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "home-ktv-hot-songs/0.1 (+public metadata only)"
    }
  });

  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }

  return response.text();
}
