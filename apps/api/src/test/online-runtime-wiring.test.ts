import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { loadConfig, normalizeApiConfig } from "../config.js";
import { createDemoOnlineProvider } from "../modules/online/demo-provider.js";
import type { OnlineCandidateCard, OnlineCandidateTask } from "@home-ktv/domain";
import { createServer } from "../server.js";
import type { OnlineCandidateProvider } from "../modules/online/provider-registry.js";

const now = new Date("2026-05-07T00:00:00.000Z").toISOString();
const websocketRequire = createRequire(import.meta.url).resolve("@fastify/websocket");
const WebSocket = createRequire(websocketRequire)("ws") as any;

describe("runtime online provider configuration", () => {
  it("parses enabled providers, kill-switches, and demo ready asset config", () => {
    const config = loadConfig({
      ONLINE_PROVIDER_IDS: "demo-local, future-provider",
      ONLINE_PROVIDER_KILL_SWITCH_IDS: "future-provider",
      ONLINE_DEMO_READY_ASSET_ID: "asset-online-ready"
    });

    expect(config.onlineProviderIds).toEqual(["demo-local", "future-provider"]);
    expect(config.onlineProviderKillSwitchIds).toEqual(["future-provider"]);
    expect(config.onlineDemoReadyAssetId).toBe("asset-online-ready");
  });

  it("keeps runtime online providers disabled by default", () => {
    const config = normalizeApiConfig({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });

    expect(config.onlineProviderIds).toEqual([]);
    expect(config.onlineProviderKillSwitchIds).toEqual([]);
    expect(config.onlineDemoReadyAssetId).toBe("");
  });
});

describe("demo online provider", () => {
  it("returns deterministic local-only candidates without direct playback URLs", async () => {
    const provider = createDemoOnlineProvider({ readyAssetId: "" });

    const [candidate] = await provider.search({ query: "七里香", limit: 1 });

    expect(provider.id).toBe("demo-local");
    expect(provider.sourceLabel).toBe("Local Demo Provider");
    expect(provider.capabilities).toEqual({ canDiscover: true, canCache: true });
    expect(candidate).toMatchObject({
      provider: "demo-local",
      providerCandidateId: "demo-local-七里香",
      title: "七里香",
      artistName: "Local Demo Artist",
      sourceLabel: "Local Demo Provider",
      candidateType: "mv",
      reliabilityLabel: "high",
      riskLabel: "normal",
      taskState: "discovered",
      taskId: null
    });
    expect(candidate).not.toHaveProperty("playbackUrl");
  });

  it("only verifies ready when an explicit demo ready asset is configured", async () => {
    const unconfigured = createDemoOnlineProvider({ readyAssetId: "" });
    const configured = createDemoOnlineProvider({ readyAssetId: "asset-online-ready" });
    const task = createTask();
    const fetchResult = await configured.prepareFetch!({ task });

    await expect(unconfigured.verify!({ task, fetchResult })).resolves.toEqual({
      status: "review_required",
      reason: "demo-ready-asset-not-configured"
    });
    await expect(configured.verify!({ task, fetchResult })).resolves.toEqual({
      status: "ready",
      readyAssetId: "asset-online-ready",
      metadata: {
        provider: "demo-local"
      }
    });
  });
});

describe("createServer online runtime wiring", () => {
  it("discovers candidates and persists supplement requests without queueing playback", async () => {
    const server = await createServer(createRuntimeConfig({ onlineProviderIds: ["demo-local"] }));

    try {
      const search = await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=missing"
      });

      expect(search.statusCode).toBe(200);
      expect(search.json().online).toMatchObject({
        status: "available",
        candidates: [
          {
            provider: "demo-local",
            providerCandidateId: "demo-local-missing",
            taskState: "discovered"
          }
        ]
      });

      const pairingToken = await seedPairingToken(server);
      const createdSession = await server.inject({
        method: "POST",
        url: "/rooms/living-room/control-sessions",
        payload: {
          pairingToken,
          deviceId: "phone-a",
          deviceName: "Phone A"
        }
      });
      const cookie = extractControlSessionCookie(createdSession.headers["set-cookie"]);
      const supplement = await server.inject({
        method: "POST",
        url: "/rooms/living-room/commands/request-supplement",
        headers: { cookie },
        payload: {
          commandId: "command-request-supplement",
          sessionVersion: 1,
          deviceId: "phone-a",
          provider: "demo-local",
          providerCandidateId: "demo-local-missing"
        }
      });

      expect(supplement.statusCode).toBe(200);
      expect(supplement.json()).toMatchObject({
        status: "accepted",
        task: {
          provider: "demo-local",
          providerCandidateId: "demo-local-missing",
          status: "review_required",
          failureReason: "demo-ready-asset-not-configured"
        }
      });

      const admin = await server.inject({
        method: "GET",
        url: "/admin/rooms/living-room"
      });
      expect(admin.statusCode).toBe(200);
      expect(admin.json().queue).toEqual([]);
      expect(admin.json().onlineTasks.tasks).toEqual([
        expect.objectContaining({
          provider: "demo-local",
          providerCandidateId: "demo-local-missing",
          status: "review_required",
          failureReason: "demo-ready-asset-not-configured"
        })
      ]);

      const snapshot = await server.inject({
        method: "GET",
        url: "/rooms/living-room/snapshot"
      });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().currentTarget).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("runs the cache worker for selected demo tasks and keeps playback explicit", async () => {
    const server = await createServer(
      createRuntimeConfig({
        onlineDemoReadyAssetId: "asset-online-ready",
        onlineProviderIds: ["demo-local"]
      })
    );

    try {
      await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=ready-demo"
      });
      const cookie = await createControlSessionCookie(server);
      const supplement = await requestSupplement(server, cookie, {
        provider: "demo-local",
        providerCandidateId: "demo-local-ready-demo"
      });

      expect(supplement.statusCode).toBe(200);
      expect(supplement.json().task).toMatchObject({
        status: "ready",
        readyAssetId: "asset-online-ready",
        recentEvent: {
          type: "ready",
          provider: "demo-local"
        }
      });

      const admin = await server.inject({ method: "GET", url: "/admin/rooms/living-room" });
      expect(admin.json().queue).toEqual([]);
      expect(admin.json().onlineTasks.tasks).toEqual([
        expect.objectContaining({
          provider: "demo-local",
          status: "ready",
          readyAssetId: "asset-online-ready"
        })
      ]);
      const snapshot = await server.inject({ method: "GET", url: "/rooms/living-room/snapshot" });
      expect(snapshot.json().currentTarget).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("broadcasts online task updates after mobile supplement requests", async () => {
    const server = await createServer(
      createRuntimeConfig({
        onlineDemoReadyAssetId: "asset-online-ready",
        onlineProviderIds: ["demo-local"]
      })
    );
    const messages: unknown[] = [];

    try {
      await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=ready-demo"
      });
      const cookie = await createControlSessionCookie(server);
      const socket = await server.injectWS(
        "/rooms/living-room/realtime?deviceId=phone-a&client=mobile",
        { headers: { cookie } },
        { onInit: collectJsonMessages(messages) }
      );
      await waitFor(() => messages.some((message) => isSnapshotUpdated(message)));
      messages.length = 0;

      const supplement = await requestSupplement(server, cookie, {
        provider: "demo-local",
        providerCandidateId: "demo-local-ready-demo"
      });

      expect(supplement.statusCode).toBe(200);
      await waitFor(() =>
        messages.some(
          (message) =>
            isSnapshotUpdated(message) &&
            (message as any).payload?.onlineTasks?.tasks?.some(
              (task: any) => task.providerCandidateId === "demo-local-ready-demo" && task.status === "ready"
            )
        )
      );

      socket.close();
    } finally {
      await server.close();
    }
  });

  it("includes online task summary in fresh realtime snapshots after supplement requests", async () => {
    const server = await createServer(
      createRuntimeConfig({
        onlineDemoReadyAssetId: "asset-online-ready",
        onlineProviderIds: ["demo-local"]
      })
    );
    const messages: unknown[] = [];

    try {
      await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=ready-demo"
      });
      const cookie = await createControlSessionCookie(server);
      const supplement = await requestSupplement(server, cookie, {
        provider: "demo-local",
        providerCandidateId: "demo-local-ready-demo"
      });

      expect(supplement.statusCode).toBe(200);

      const socket = await server.injectWS(
        "/rooms/living-room/realtime?deviceId=phone-a&client=mobile",
        { headers: { cookie } },
        { onInit: collectJsonMessages(messages) }
      );
      await waitFor(() => messages.length >= 1);

      expect(messages[0]).toMatchObject({
        type: "room.control.snapshot.updated",
        payload: {
          onlineTasks: {
            counts: {
              total: 1,
              ready: 1
            },
            tasks: [
              expect.objectContaining({
                providerCandidateId: "demo-local-ready-demo",
                status: "ready"
              })
            ]
          }
        }
      });

      socket.close();
    } finally {
      await server.close();
    }
  });

  it("broadcasts promoted online task removal to admin realtime subscribers", async () => {
    const server = await createServer(
      createRuntimeConfig({
        onlineDemoReadyAssetId: "asset-online-ready",
        onlineProviderIds: ["demo-local"]
      })
    );
    const messages: unknown[] = [];

    try {
      await server.listen({ host: "127.0.0.1", port: 0 });
      const port = getListeningPort(server);

      await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=ready-demo"
      });
      const cookie = await createControlSessionCookie(server);

      const socket = await connectRealtimeSocket(
        `ws://127.0.0.1:${port}/rooms/living-room/realtime?deviceId=admin-a&client=admin`,
        messages
      );
      await waitFor(() => messages.some((message) => isSnapshotUpdated(message)));
      messages.length = 0;

      const supplement = await requestSupplement(server, cookie, {
        provider: "demo-local",
        providerCandidateId: "demo-local-ready-demo"
      });

      expect(supplement.statusCode).toBe(200);
      const promotedTaskId = (supplement.json() as { task: { id: string } }).task.id;
      await waitFor(() =>
        messages.some(
          (message) =>
            isSnapshotUpdated(message) &&
            (message as any).payload?.onlineTasks?.tasks?.some(
              (task: any) => task.providerCandidateId === "demo-local-ready-demo" && task.status === "ready"
            )
        )
      );
      messages.length = 0;

      const promote = await server.inject({
        method: "POST",
        url: `/admin/rooms/living-room/online-tasks/${promotedTaskId}/promote`
      });

      expect(promote.statusCode).toBe(200);
      await waitFor(() =>
        messages.some(
          (message) =>
            isSnapshotUpdated(message) &&
            (message as any).payload?.onlineTasks?.counts?.total === 0 &&
            (message as any).payload?.onlineTasks?.tasks?.length === 0
        )
      );

      socket.close();
    } finally {
      await server.close();
    }
  });

  it("runs the cache worker again when an admin retries a failed online task", async () => {
    const provider = createFailThenReadyProvider();
    const server = await createServer(
      createRuntimeConfig({
        onlineProviderIds: [provider.id]
      }),
      { onlineProviders: [provider] }
    );

    try {
      await server.inject({
        method: "GET",
        url: "/rooms/living-room/songs/search?q=flaky"
      });
      const cookie = await createControlSessionCookie(server);
      const supplement = await requestSupplement(server, cookie, {
        provider: provider.id,
        providerCandidateId: "flaky-candidate"
      });

      expect(supplement.statusCode).toBe(200);
      expect(supplement.json().task).toMatchObject({
        status: "failed",
        failureReason: "provider-temporary-failure"
      });

      const retry = await server.inject({
        method: "POST",
        url: `/admin/rooms/living-room/online-tasks/${supplement.json().task.id}/retry`
      });

      expect(retry.statusCode).toBe(200);
      expect(retry.json().task).toMatchObject({
        status: "ready",
        readyAssetId: "asset-flaky-ready"
      });
      const admin = await server.inject({ method: "GET", url: "/admin/rooms/living-room" });
      expect(admin.json().queue).toEqual([]);
      expect(admin.json().onlineTasks.tasks).toEqual([
        expect.objectContaining({
          provider: provider.id,
          status: "ready",
          readyAssetId: "asset-flaky-ready"
        })
      ]);
      const snapshot = await server.inject({ method: "GET", url: "/rooms/living-room/snapshot" });
      expect(snapshot.json().currentTarget).toBeNull();
    } finally {
      await server.close();
    }
  });
});

function createTask(input: Partial<OnlineCandidateTask> = {}): OnlineCandidateTask {
  return {
    id: "task-demo-local",
    roomId: "living-room",
    provider: "demo-local",
    providerCandidateId: "demo-local-七里香",
    title: "七里香",
    artistName: "Local Demo Artist",
    sourceLabel: "Local Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    status: "selected",
    failureReason: null,
    recentEvent: {},
    providerPayload: {},
    readyAssetId: null,
    createdAt: now,
    updatedAt: now,
    selectedAt: now,
    reviewRequiredAt: null,
    fetchingAt: null,
    fetchedAt: null,
    readyAt: null,
    failedAt: null,
    staleAt: null,
    promotedAt: null,
    purgedAt: null,
    ...input
  };
}

function createRuntimeConfig(input: {
  onlineDemoReadyAssetId?: string;
  onlineProviderIds?: readonly string[];
  onlineProviderKillSwitchIds?: readonly string[];
} = {}) {
  return {
    corsAllowedOrigins: [],
    databaseUrl: "",
    host: "0.0.0.0",
    mediaRoot: "/media-root",
    onlineDemoReadyAssetId: input.onlineDemoReadyAssetId ?? "",
    onlineProviderIds: input.onlineProviderIds ?? [],
    onlineProviderKillSwitchIds: input.onlineProviderKillSwitchIds ?? [],
    port: 4000,
    publicBaseUrl: "http://ktv.local",
    roomSlug: "living-room"
  };
}

async function seedPairingToken(server: Awaited<ReturnType<typeof createServer>>): Promise<string> {
  const response = await server.inject({
    method: "GET",
    url: "/rooms/living-room/snapshot"
  });

  return response.json().pairing.token;
}

async function createControlSessionCookie(server: Awaited<ReturnType<typeof createServer>>): Promise<string> {
  const pairingToken = await seedPairingToken(server);
  const createdSession = await server.inject({
    method: "POST",
    url: "/rooms/living-room/control-sessions",
    payload: {
      pairingToken,
      deviceId: "phone-a",
      deviceName: "Phone A"
    }
  });
  return extractControlSessionCookie(createdSession.headers["set-cookie"]);
}

async function requestSupplement(
  server: Awaited<ReturnType<typeof createServer>>,
  cookie: string,
  input: { provider: string; providerCandidateId: string }
) {
  return server.inject({
    method: "POST",
    url: "/rooms/living-room/commands/request-supplement",
    headers: { cookie },
    payload: {
      commandId: `command-request-${input.providerCandidateId}`,
      sessionVersion: 1,
      deviceId: "phone-a",
      provider: input.provider,
      providerCandidateId: input.providerCandidateId
    }
  });
}

function extractControlSessionCookie(setCookie: unknown): string {
  if (Array.isArray(setCookie)) {
    return String(setCookie[0] ?? "");
  }

  return String(setCookie ?? "");
}

function isSnapshotUpdated(message: unknown): boolean {
  return Boolean(message && typeof message === "object" && (message as { type?: string }).type === "room.control.snapshot.updated");
}

function collectJsonMessages(messages: unknown[]) {
  return (socket: any) => {
    socket.on("message", (buffer: Buffer) => {
      messages.push(JSON.parse(buffer.toString()));
    });
  };
}

async function connectRealtimeSocket(url: string, messages: unknown[]) {
  const socket = new WebSocket(url);
  socket.on("message", (buffer: Buffer) => {
    messages.push(JSON.parse(buffer.toString()));
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error: Error) => reject(error));
  });

  return socket;
}

function getListeningPort(server: Awaited<ReturnType<typeof createServer>>): number {
  const address = server.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not bind to a listening port");
  }

  return address.port;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createFailThenReadyProvider(): OnlineCandidateProvider {
  let verifyCalls = 0;
  const candidate: OnlineCandidateCard = {
    provider: "flaky-provider",
    providerCandidateId: "flaky-candidate",
    title: "flaky",
    artistName: "Remote Artist",
    sourceLabel: "Flaky Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "medium",
    riskLabel: "normal",
    taskState: "discovered",
    taskId: null
  };

  return {
    id: "flaky-provider",
    sourceLabel: "Flaky Provider",
    capabilities: {
      canDiscover: true,
      canCache: true
    },
    search: async () => [candidate],
    prepareFetch: async ({ task }) => ({
      cacheKey: `flaky-provider/${task.providerCandidateId}`,
      metadata: {
        provider: "flaky-provider"
      }
    }),
    verify: async () => {
      verifyCalls += 1;
      if (verifyCalls === 1) {
        return {
          status: "failed",
          reason: "provider-temporary-failure"
        };
      }
      return {
        status: "ready",
        readyAssetId: "asset-flaky-ready",
        metadata: {
          provider: "flaky-provider"
        }
      };
    }
  };
}
