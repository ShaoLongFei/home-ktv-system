import { describe, expect, it } from "vitest";
import { loadConfig, normalizeApiConfig } from "../config.js";
import { createDemoOnlineProvider } from "../modules/online/demo-provider.js";
import type { OnlineCandidateTask } from "@home-ktv/domain";

const now = new Date("2026-05-07T00:00:00.000Z").toISOString();

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
