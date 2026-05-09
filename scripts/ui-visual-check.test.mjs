import assert from "node:assert/strict";
import test from "node:test";
import { buildVisualConfig, resolveMobileVisualUrl } from "./ui-visual-check.mjs";

test("resolveMobileVisualUrl uses MOBILE_VISUAL_URL override without fetch", async () => {
  const config = buildVisualConfig({
    MOBILE_VISUAL_URL: "http://phone.local/controller?room=test-room"
  });

  const url = await resolveMobileVisualUrl({
    config,
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(url, "http://phone.local/controller?room=test-room");
});

test("resolveMobileVisualUrl refreshes a pairing token when no override exists", async () => {
  const requests = [];
  const config = buildVisualConfig({
    API_VISUAL_URL: "http://127.0.0.1:4000",
    TV_ROOM_SLUG: "living-room"
  });

  const url = await resolveMobileVisualUrl({
    config,
    fetchImpl: async (requestUrl, init = {}) => {
      requests.push({ method: init.method, url: String(requestUrl) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pairing: {
            controllerUrl: "http://127.0.0.1:5176/controller?room=living-room&token=token-visual"
          }
        })
      };
    }
  });

  assert.deepEqual(requests, [
    {
      method: "POST",
      url: "http://127.0.0.1:4000/admin/rooms/living-room/pairing-token/refresh"
    }
  ]);
  assert.match(url, /token=token-visual/u);
});

test("resolveMobileVisualUrl reports unavailable pairing endpoint clearly", async () => {
  const config = buildVisualConfig({
    API_VISUAL_URL: "http://127.0.0.1:4000",
    TV_ROOM_SLUG: "living-room"
  });

  await assert.rejects(
    () =>
      resolveMobileVisualUrl({
        config,
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          text: async () => "database unavailable"
        })
      }),
    (error) => {
      assert.match(error.message, /POST \/admin\/rooms\/living-room\/pairing-token\/refresh/u);
      assert.match(error.message, /500/u);
      assert.match(error.message, /database unavailable/u);
      assert.match(error.message, /pnpm dev:local restart/u);
      return true;
    }
  );
});

test("resolveMobileVisualUrl rejects malformed pairing payload", async () => {
  const config = buildVisualConfig({
    API_VISUAL_URL: "http://127.0.0.1:4000",
    TV_ROOM_SLUG: "living-room"
  });

  await assert.rejects(
    () =>
      resolveMobileVisualUrl({
        config,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ pairing: {} })
        })
      }),
    /pairing\.controllerUrl/u
  );
});
