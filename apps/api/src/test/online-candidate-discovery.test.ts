import Fastify from "fastify";
import type { ControlSession, OnlineCandidateCard, OnlineCandidateTask, OnlineCandidateTaskState, RoomId } from "@home-ktv/domain";
import type { ApiConfig } from "../config.js";
import { CONTROL_SESSION_COOKIE } from "../modules/controller/control-session-service.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import {
  CandidateTaskService,
  type CandidateTaskServiceRepository
} from "../modules/online/candidate-task-service.js";
import { createProviderRegistry, type OnlineCandidateProvider } from "../modules/online/provider-registry.js";
import { registerControlCommandRoutes } from "../routes/control-commands.js";
import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-07T00:00:00.000Z").toISOString();

describe("online candidate discovery", () => {
  it("discovers candidates from enabled providers and persists them as discovered tasks", async () => {
    const repository = new FakeCandidateTaskRepository();
    const registry = createProviderRegistry({
      enabledProviderIds: ["demo-provider"],
      killSwitchProviderIds: [],
      providers: [
        createProvider({
          id: "demo-provider",
          sourceLabel: "Demo Provider",
          candidates: [createCandidate({ providerCandidateId: "remote-qilixiang" })]
        }),
        createProvider({
          id: "disabled-provider",
          sourceLabel: "Disabled Provider",
          candidates: [createCandidate({ provider: "disabled-provider", providerCandidateId: "remote-disabled" })]
        })
      ]
    });
    const service = new CandidateTaskService({ registry, repository });

    const candidates = await service.discoverCandidates({ roomId: "living-room", query: "七里香" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      provider: "demo-provider",
      providerCandidateId: "remote-qilixiang",
      sourceLabel: "Demo Provider",
      taskState: "discovered",
      taskId: "task-demo-provider-remote-qilixiang"
    });
    expect(repository.upsertCalls).toHaveLength(1);
    expect(repository.upsertCalls[0]?.roomId).toBe("living-room");
    expect(repository.upsertCalls[0]?.candidate.providerCandidateId).toBe("remote-qilixiang");
  });

  it("honors provider kill-switches and cache capability flags for supplement selection", async () => {
    const repository = new FakeCandidateTaskRepository([
      createTask({
        provider: "safe-provider",
        providerCandidateId: "safe-candidate",
        riskLabel: "normal",
        reliabilityLabel: "high"
      }),
      createTask({
        provider: "risky-provider",
        providerCandidateId: "risky-candidate",
        riskLabel: "risky",
        reliabilityLabel: "low"
      }),
      createTask({
        provider: "discovery-only",
        providerCandidateId: "readonly-candidate",
        riskLabel: "normal",
        reliabilityLabel: "medium"
      })
    ]);
    const registry = createProviderRegistry({
      enabledProviderIds: ["safe-provider", "risky-provider", "discovery-only"],
      killSwitchProviderIds: ["disabled-provider"],
      providers: [
        createProvider({ id: "safe-provider", sourceLabel: "Safe Provider", canCache: true }),
        createProvider({ id: "risky-provider", sourceLabel: "Risky Provider", canCache: true }),
        createProvider({ id: "discovery-only", sourceLabel: "Discovery Only", canCache: false }),
        createProvider({ id: "disabled-provider", sourceLabel: "Disabled Provider", canCache: true })
      ]
    });
    const service = new CandidateTaskService({ registry, repository });

    await expect(
      service.requestSupplement({
        roomId: "living-room",
        provider: "safe-provider",
        providerCandidateId: "safe-candidate"
      })
    ).resolves.toMatchObject({ status: "selected" });
    await expect(
      service.requestSupplement({
        roomId: "living-room",
        provider: "risky-provider",
        providerCandidateId: "risky-candidate"
      })
    ).resolves.toMatchObject({ status: "review_required" });
    await expect(
      service.requestSupplement({
        roomId: "living-room",
        provider: "discovery-only",
        providerCandidateId: "readonly-candidate"
      })
    ).resolves.toMatchObject({ status: "review_required" });

    expect(registry.getCacheCapableProvider("disabled-provider")).toBeNull();
    expect(repository.transitionCalls.map((call) => call.status)).toEqual([
      "selected",
      "review_required",
      "review_required"
    ]);
  });

  it("handles supplement request commands by selecting a task without enqueueing playback", async () => {
    const server = Fastify({ logger: false });
    const online = {
      requestSupplement: vi.fn(async () => createTask({ id: "task-selected", status: "selected" }))
    };
    const queueEntries = {
      append: vi.fn()
    };

    await registerControlCommandRoutes(server, {
      config: createConfig(),
      assetGateway: {} as never,
      repositories: {
        rooms: {
          findBySlug: async (slug: string) => (slug === "living-room" ? createRoom() : null),
          findById: async (roomId: string) => (roomId === "living-room" ? createRoom() : null)
        },
        controlSessions: new InMemoryControlSessionRepository([createControlSession()]),
        controlCommands: {} as never,
        playbackSessions: {} as never,
        queueEntries: queueEntries as never,
        assets: {} as never,
        songs: {} as never,
        pairingTokens: {} as never,
        deviceSessions: {} as never
      },
      online: online as never
    });

    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/commands/request-supplement",
      headers: {
        cookie: `${CONTROL_SESSION_COOKIE}=control-session-1`
      },
      payload: {
        commandId: "command-online",
        sessionVersion: 1,
        deviceId: "phone-a",
        provider: "demo-provider",
        providerCandidateId: "remote-qilixiang"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "accepted",
      task: {
        id: "task-selected",
        status: "selected"
      }
    });
    expect(online.requestSupplement).toHaveBeenCalledWith({
      roomId: "living-room",
      provider: "demo-provider",
      providerCandidateId: "remote-qilixiang"
    });
    expect(queueEntries.append).not.toHaveBeenCalled();
  });
});

class FakeCandidateTaskRepository implements CandidateTaskServiceRepository {
  readonly upsertCalls: Array<{ roomId: RoomId; candidate: OnlineCandidateCard }> = [];
  readonly transitionCalls: Array<{ taskId: string; status: OnlineCandidateTaskState }> = [];
  private readonly tasks = new Map<string, OnlineCandidateTask>();

  constructor(tasks: OnlineCandidateTask[] = []) {
    for (const task of tasks) {
      this.tasks.set(this.key(task.roomId, task.provider, task.providerCandidateId), task);
    }
  }

  async upsertDiscovered(input: { roomId: RoomId; candidate: OnlineCandidateCard }) {
    this.upsertCalls.push(input);
    const task = createTask({
      id: `task-${input.candidate.provider}-${input.candidate.providerCandidateId}`,
      roomId: input.roomId,
      provider: input.candidate.provider,
      providerCandidateId: input.candidate.providerCandidateId,
      title: input.candidate.title,
      artistName: input.candidate.artistName,
      sourceLabel: input.candidate.sourceLabel,
      durationMs: input.candidate.durationMs,
      candidateType: input.candidate.candidateType,
      reliabilityLabel: input.candidate.reliabilityLabel,
      riskLabel: input.candidate.riskLabel,
      status: "discovered"
    });
    this.tasks.set(this.key(task.roomId, task.provider, task.providerCandidateId), task);
    return task;
  }

  async findByProviderCandidate(input: { roomId: RoomId; provider: string; providerCandidateId: string }) {
    return this.tasks.get(this.key(input.roomId, input.provider, input.providerCandidateId)) ?? null;
  }

  async findById(taskId: string) {
    return Array.from(this.tasks.values()).find((candidate) => candidate.id === taskId) ?? null;
  }

  async listActiveForRoom(roomId: RoomId) {
    return Array.from(this.tasks.values()).filter(
      (candidate) => candidate.roomId === roomId && candidate.status !== "promoted" && candidate.status !== "purged"
    );
  }

  async transition(taskId: string, input: { status: OnlineCandidateTaskState }) {
    this.transitionCalls.push({ taskId, status: input.status });
    const task = Array.from(this.tasks.values()).find((candidate) => candidate.id === taskId);
    if (!task) {
      return null;
    }
    const updated = { ...task, status: input.status };
    this.tasks.set(this.key(updated.roomId, updated.provider, updated.providerCandidateId), updated);
    return updated;
  }

  private key(roomId: RoomId, provider: string, providerCandidateId: string): string {
    return `${roomId}:${provider}:${providerCandidateId}`;
  }
}

function createProvider(input: {
  id: string;
  sourceLabel: string;
  canCache?: boolean;
  candidates?: OnlineCandidateCard[];
}): OnlineCandidateProvider {
  return {
    id: input.id,
    sourceLabel: input.sourceLabel,
    capabilities: {
      canDiscover: true,
      canCache: input.canCache ?? true
    },
    search: vi.fn(async () => input.candidates ?? [])
  };
}

function createCandidate(input: Partial<OnlineCandidateCard> = {}): OnlineCandidateCard {
  return {
    provider: "demo-provider",
    providerCandidateId: "remote-qilixiang",
    title: "七里香",
    artistName: "周杰伦",
    sourceLabel: "Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    taskState: "discovered",
    taskId: null,
    ...input
  };
}

function createTask(input: Partial<OnlineCandidateTask> = {}): OnlineCandidateTask {
  return {
    id: "task-1",
    roomId: "living-room",
    provider: "demo-provider",
    providerCandidateId: "remote-qilixiang",
    title: "七里香",
    artistName: "周杰伦",
    sourceLabel: "Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    status: "discovered",
    failureReason: null,
    recentEvent: {},
    providerPayload: {},
    readyAssetId: null,
    createdAt: now,
    updatedAt: now,
    selectedAt: null,
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

function createRoom() {
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active" as const,
    defaultPlayerDeviceId: null,
    createdAt: now,
    updatedAt: now
  };
}

function createControlSession(): ControlSession {
  return {
    id: "control-session-1",
    roomId: "living-room",
    deviceId: "phone-a",
    deviceName: "Phone A",
    lastSeenAt: now,
    expiresAt: new Date("2030-05-07T02:00:00.000Z").toISOString(),
    revokedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function createConfig(): ApiConfig {
  return {
    corsAllowedOrigins: [],
    databaseUrl: "",
    host: "0.0.0.0",
    mediaRoot: "/media-root",
    port: 4000,
    publicBaseUrl: "http://ktv.local",
    roomSlug: "living-room",
    scanIntervalMinutes: 360
  };
}
