import type {
  OnlineCandidateCard,
  OnlineCandidateTask,
  OnlineCandidateTaskState,
  SongSearchOnlineResult
} from "@home-ktv/domain";
import { onlineCandidateTaskStates } from "@home-ktv/domain";
import {
  InMemoryCandidateTaskRepository,
  mapCandidateTaskRow,
  PgCandidateTaskRepository
} from "../modules/online/repositories/candidate-task-repository.js";
import { CandidateTaskService } from "../modules/online/candidate-task-service.js";
import { createProviderRegistry, type OnlineCandidateProvider } from "../modules/online/provider-registry.js";
import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-07T00:00:00.000Z");

describe("online candidate task contracts", () => {
  it("exports every lifecycle state required for online supplement recovery", () => {
    const states = [...onlineCandidateTaskStates] satisfies OnlineCandidateTaskState[];

    expect(states).toEqual([
      "discovered",
      "selected",
      "review_required",
      "fetching",
      "fetched",
      "ready",
      "failed",
      "stale",
      "promoted",
      "purged"
    ]);
  });

  it("allows search responses to carry candidate cards and a request-supplement entry", () => {
    const candidate: OnlineCandidateCard = {
      provider: "demo-provider",
      providerCandidateId: "remote-七里香",
      title: "七里香",
      artistName: "周杰伦",
      sourceLabel: "Demo Provider",
      durationMs: 180000,
      candidateType: "mv",
      reliabilityLabel: "high",
      riskLabel: "normal",
      taskState: "discovered",
      taskId: null
    };

    const online = {
      status: "available",
      message: "找到在线补歌候选",
      requestSupplement: {
        visible: false,
        label: "请求补歌"
      },
      candidates: [candidate]
    } satisfies SongSearchOnlineResult;

    expect(online.candidates[0]?.sourceLabel).toBe("Demo Provider");
    expect(online.candidates[0]?.taskState).toBe("discovered");
  });
});

describe("candidate task repository", () => {
  it("maps candidate task rows with lifecycle, provider labels, failure reason, and timestamps", () => {
    const task = mapCandidateTaskRow(createCandidateTaskRow({ status: "review_required" }));

    expect(task).toMatchObject({
      id: "task-1",
      roomId: "living-room",
      provider: "demo-provider",
      providerCandidateId: "remote-七里香",
      status: "review_required",
      riskLabel: "risky",
      reliabilityLabel: "medium",
      failureReason: "provider requires review",
      readyAt: null,
      promotedAt: null,
      purgedAt: null
    } satisfies Partial<OnlineCandidateTask>);
  });

  it("upserts discovered candidates by room, provider, and candidate identity", async () => {
    const db = new RecordingQueryExecutor([
      createCandidateTaskRow({
        id: "task-existing",
        room_id: "living-room",
        provider: "demo-provider",
        provider_candidate_id: "remote-七里香"
      })
    ]);
    const repository = new PgCandidateTaskRepository(db);

    const task = await repository.upsertDiscovered({
      roomId: "living-room",
      candidate: {
        provider: "demo-provider",
        providerCandidateId: "remote-七里香",
        title: "七里香",
        artistName: "周杰伦",
        sourceLabel: "Demo Provider",
        durationMs: 180000,
        candidateType: "mv",
        reliabilityLabel: "high",
        riskLabel: "normal",
        taskState: "discovered",
        taskId: null
      }
    });

    expect(task.id).toBe("task-existing");
    expect(db.queries[0]?.text).toContain("ON CONFLICT(room_id, provider, provider_candidate_id)");
    expect(db.queries[0]?.values.slice(0, 3)).toEqual(["living-room", "demo-provider", "remote-七里香"]);
  });

  it("lists active tasks scoped to a room and transitions selected candidates", async () => {
    const db = new RecordingQueryExecutor([
      createCandidateTaskRow({ id: "task-1", room_id: "living-room", status: "discovered" }),
      createCandidateTaskRow({ id: "task-1", room_id: "living-room", status: "selected" })
    ]);
    const repository = new PgCandidateTaskRepository(db);

    const tasks = await repository.listActiveForRoom("living-room");
    const selected = await repository.transition("task-1", {
      status: "selected",
      recentEvent: { type: "supplement-selected", message: "Queued for cache flow" }
    });

    expect(tasks).toHaveLength(1);
    expect(selected?.status).toBe("selected");
    expect(db.queries[0]?.text).toContain("WHERE room_id = $1");
    expect(db.queries[1]?.text).toContain("UPDATE candidate_tasks");
    expect(db.queries[1]?.values).toContain("selected");
  });
});

describe("candidate task lifecycle service", () => {
  it("moves selected candidates through fetching, fetched, and ready with event metadata", async () => {
    const repository = new InMemoryCandidateTaskRepository();
    const service = new CandidateTaskService({
      repository,
      registry: createProviderRegistry({
        enabledProviderIds: ["demo-provider"],
        killSwitchProviderIds: [],
        providers: [createProvider({ id: "demo-provider" })]
      })
    });
    const [candidate] = await service.discoverCandidates({ roomId: "living-room", query: "七里香" });
    expect(candidate).toBeDefined();
    await service.requestSupplement({
      roomId: "living-room",
      provider: "demo-provider",
      providerCandidateId: "remote-七里香"
    });

    const fetching = await service.markFetching(candidate!.taskId!, {
      source: "worker",
      prepareUrl: "https://example.invalid/video"
    });
    const fetched = await service.markFetched(candidate!.taskId!, {
      cachePath: "online-cache/demo-provider/remote-七里香.mp4"
    });
    const ready = await service.markReady(candidate!.taskId!, {
      readyAssetId: "asset-online-ready",
      metadata: { verifiedBy: "demo-provider" }
    });

    expect(fetching?.status).toBe("fetching");
    expect(fetched?.status).toBe("fetched");
    expect(ready).toMatchObject({
      status: "ready",
      readyAssetId: "asset-online-ready",
      failureReason: null,
      recentEvent: {
        type: "ready",
        verifiedBy: "demo-provider"
      }
    });
  });

  it("retries and purges failed tasks only inside the requested room", async () => {
    const repository = new InMemoryCandidateTaskRepository();
    const service = new CandidateTaskService({
      repository,
      registry: createProviderRegistry({
        enabledProviderIds: ["demo-provider"],
        killSwitchProviderIds: [],
        providers: [createProvider({ id: "demo-provider" })]
      })
    });
    const [livingRoomCandidate] = await service.discoverCandidates({ roomId: "living-room", query: "七里香" });
    const [studioCandidate] = await service.discoverCandidates({ roomId: "studio-room", query: "七里香" });
    await service.markFailed(livingRoomCandidate!.taskId!, {
      reason: "cache checksum mismatch",
      metadata: { stage: "verify" }
    });
    await service.markFailed(studioCandidate!.taskId!, {
      reason: "provider timeout",
      metadata: { stage: "fetch" }
    });

    const crossRoomRetry = await service.retryTask({
      roomId: "studio-room",
      taskId: livingRoomCandidate!.taskId!
    });
    const retried = await service.retryTask({
      roomId: "living-room",
      taskId: livingRoomCandidate!.taskId!
    });
    const purged = await service.purgeTask({
      roomId: "studio-room",
      taskId: studioCandidate!.taskId!
    });

    expect(crossRoomRetry).toBeNull();
    expect(retried).toMatchObject({
      roomId: "living-room",
      status: "selected",
      failureReason: null,
      recentEvent: {
        type: "retry",
        previousStatus: "failed"
      }
    });
    expect(purged).toMatchObject({
      roomId: "studio-room",
      status: "purged",
      recentEvent: {
        type: "purged",
        previousStatus: "failed"
      }
    });
  });

  it("blocks killed providers in the cache worker before fetch begins", async () => {
    const repository = new InMemoryCandidateTaskRepository();
    const provider = createProvider({ id: "demo-provider" });
    const service = new CandidateTaskService({
      repository,
      registry: createProviderRegistry({
        enabledProviderIds: ["demo-provider"],
        killSwitchProviderIds: [],
        providers: [provider]
      })
    });
    const [candidate] = await service.discoverCandidates({ roomId: "living-room", query: "七里香" });
    await service.requestSupplement({
      roomId: "living-room",
      provider: "demo-provider",
      providerCandidateId: "remote-七里香"
    });
    const killedRegistry = createProviderRegistry({
      enabledProviderIds: ["demo-provider"],
      killSwitchProviderIds: ["demo-provider"],
      providers: [provider]
    });
    const { CandidateCacheWorker } = await import("../modules/online/candidate-cache-worker.js");
    const worker = new CandidateCacheWorker({ registry: killedRegistry, service });

    const result = await worker.processTask({ roomId: "living-room", taskId: candidate!.taskId! });

    expect(provider.prepareFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "review_required",
      failureReason: "provider-disabled-or-not-cache-capable",
      recentEvent: {
        type: "review_required",
        reason: "provider-disabled-or-not-cache-capable"
      }
    });
  });
});

type CandidateTaskRow = Parameters<typeof mapCandidateTaskRow>[0];

class RecordingQueryExecutor {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  constructor(private readonly rows: CandidateTaskRow[]) {}

  async query<TRow>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    return { rows: this.rows.splice(0, 1) as TRow[] };
  }
}

function createCandidateTaskRow(input: Partial<CandidateTaskRow> = {}): CandidateTaskRow {
  return {
    id: "task-1",
    room_id: "living-room",
    provider: "demo-provider",
    provider_candidate_id: "remote-七里香",
    title: "七里香",
    artist_name: "周杰伦",
    source_label: "Demo Provider",
    duration_ms: 180000,
    candidate_type: "mv",
    reliability_label: "medium",
    risk_label: "risky",
    status: "discovered",
    failure_reason: "provider requires review",
    recent_event: { type: "discovered", message: "Found candidate" },
    provider_payload: { url: "https://example.invalid/watch" },
    ready_asset_id: null,
    created_at: now,
    updated_at: now,
    selected_at: null,
    review_required_at: null,
    fetching_at: null,
    fetched_at: null,
    ready_at: null,
    failed_at: null,
    stale_at: null,
    promoted_at: null,
    purged_at: null,
    ...input
  };
}

function createProvider(input: { id: string }): OnlineCandidateProvider {
  const candidate: OnlineCandidateCard = {
    provider: input.id,
    providerCandidateId: "remote-七里香",
    title: "七里香",
    artistName: "周杰伦",
    sourceLabel: "Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    taskState: "discovered",
    taskId: null
  };

  return {
    id: input.id,
    sourceLabel: "Demo Provider",
    capabilities: {
      canDiscover: true,
      canCache: true
    },
    search: vi.fn(async () => [candidate]),
    prepareFetch: vi.fn(async () => ({
      cacheKey: "online-cache/demo-provider/remote-七里香.mp4",
      metadata: { prepared: true }
    })),
    verify: vi.fn(async (): Promise<{ status: "ready"; readyAssetId: string; metadata: Record<string, unknown> }> => ({
      status: "ready",
      readyAssetId: "asset-online-ready",
      metadata: { verifiedBy: "demo-provider" }
    }))
  };
}
