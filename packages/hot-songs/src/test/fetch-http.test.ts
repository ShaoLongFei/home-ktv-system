import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, fetchText } from "../fetch/http.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchText", () => {
  it("wraps request failures with the URL and nested cause", async () => {
    const fetchError = new TypeError("fetch failed") as TypeError & {
      cause?: Error;
    };
    fetchError.cause = new Error("redirect count exceeded");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw fetchError;
      }) as unknown as typeof fetch
    );

    await expect(fetchText("https://example.com/toplist", 1000)).rejects.toThrow(
      "GET https://example.com/toplist failed while requesting"
    );
    await expect(fetchText("https://example.com/toplist", 1000)).rejects.toThrow(
      "redirect count exceeded"
    );
  });
});

describe("fetchJson", () => {
  it("wraps JSON parse failures with the URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })) as unknown as typeof fetch
    );

    await expect(fetchJson("https://example.com/api", 1000)).rejects.toThrow(
      "GET https://example.com/api failed while parsing response JSON"
    );
  });
});
