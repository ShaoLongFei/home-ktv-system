import type { SourceDefinition } from "../contracts.js";

export type FetchText = (url: string, timeoutMs: number) => Promise<string>;

export async function fetchText(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<string> {
  const response = await fetchWithDiagnostics(url, timeoutMs, {
    headers
  });

  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }

  try {
    return await response.text();
  } catch (error) {
    throw wrapFetchError("GET", url, error, "reading response text");
  }
}

export async function fetchJson(
  url: string,
  timeoutMs: number,
  options: FetchRequestOptions = {}
): Promise<unknown> {
  const response = await fetchWithDiagnostics(url, timeoutMs, options);

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} -> ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw wrapFetchError(
      options.method ?? "GET",
      url,
      error,
      "parsing response JSON"
    );
  }
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

type FetchRequestOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: BodyInit;
};

async function fetchWithDiagnostics(
  url: string,
  timeoutMs: number,
  options: FetchRequestOptions = {}
): Promise<Response> {
  try {
    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "home-ktv-hot-songs/0.1 (+public metadata only)",
        ...(options.headers ?? {})
      }
    };

    if (options.body !== undefined) {
      requestInit.body = options.body;
    }

    return await fetch(url, requestInit);
  } catch (error) {
    throw wrapFetchError(options.method ?? "GET", url, error, "requesting");
  }
}

function wrapFetchError(
  method: string,
  url: string,
  error: unknown,
  phase: string
): Error {
  return new Error(
    `${method} ${url} failed while ${phase}: ${describeError(error)}`,
    {
      cause: error
    }
  );
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const base = [error.name, error.message]
    .filter((part) => part.length > 0)
    .join(": ");
  const cause = (error as { cause?: unknown }).cause;
  if (cause === undefined) {
    return base;
  }

  return `${base}; cause: ${describeCause(cause)}`;
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const codeValue = (cause as { code?: unknown }).code;
    const code = typeof codeValue === "string" ? ` [${codeValue}]` : "";
    return (
      [cause.name, cause.message]
        .filter((part) => part.length > 0)
        .join(": ") + code
    );
  }

  if (typeof cause === "object" && cause !== null) {
    const namedCause = cause as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
    };
    const name = typeof namedCause.name === "string" ? namedCause.name : "Error";
    const message = typeof namedCause.message === "string" ? namedCause.message : "";
    const code = typeof namedCause.code === "string" ? ` [${namedCause.code}]` : "";
    return [name, message].filter((part) => part.length > 0).join(": ") + code;
  }

  return String(cause);
}
