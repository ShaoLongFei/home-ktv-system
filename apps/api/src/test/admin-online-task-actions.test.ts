import Fastify from "fastify";
import type { OnlineCandidateTask, Room } from "@home-ktv/domain";
import { registerAdminRoomsRoutes } from "../routes/admin-rooms.js";
import { describe, expect, it, vi } from "vitest";

describe("admin online task actions", () => {
  it("retries, cleans, and promotes online candidate tasks through room-scoped endpoints", async () => {
    const harness = createHarness();
    const server = Fastify({ logger: false });
    await registerAdminRoomsRoutes(server, {
      ...harness.routeDependencies,
      onlineTasks: harness.onlineTasks as never
    });

    const retry = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/online-tasks/task-failed/retry"
    });
    const clean = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/online-tasks/task-stale/clean"
    });
    const promote = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/online-tasks/task-ready/promote"
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      task: {
        id: "task-failed",
        roomId: "living-room",
        status: "selected"
      }
    });
    expect(clean.statusCode).toBe(200);
    expect(clean.json()).toMatchObject({
      task: {
        id: "task-stale",
        roomId: "living-room",
        status: "purged"
      }
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json()).toMatchObject({
      task: {
        id: "task-ready",
        roomId: "living-room",
        status: "promoted"
      }
    });
    expect(harness.onlineTasks.retryTask).toHaveBeenCalledWith({ roomId: "living-room", taskId: "task-failed" });
    expect(harness.onlineTasks.purgeTask).toHaveBeenCalledWith({ roomId: "living-room", taskId: "task-stale" });
    expect(harness.onlineTasks.promoteTask).toHaveBeenCalledWith({ roomId: "living-room", taskId: "task-ready" });
    expect(harness.queueEntries.append).toHaveBeenCalledTimes(0);
    expect(harness.queueEntries.append).not.toHaveBeenCalled();
  });

  it("returns 404 when task actions target another room or missing task", async () => {
    const harness = createHarness({
      retryTask: vi.fn(async () => null)
    });
    const server = Fastify({ logger: false });
    await registerAdminRoomsRoutes(server, {
      ...harness.routeDependencies,
      onlineTasks: harness.onlineTasks as never
    });

    const response = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/online-tasks/task-other-room/retry"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "ONLINE_TASK_NOT_FOUND" });
  });
});

function createHarness(
  overrides: Partial<{
    retryTask: ReturnType<typeof vi.fn>;
    purgeTask: ReturnType<typeof vi.fn>;
    promoteTask: ReturnType<typeof vi.fn>;
  }> = {}
) {
  const room: Room = {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z"
  };
  const queueEntries = {
    append: vi.fn(),
    listEffectiveQueue: vi.fn(async () => []),
    listUndoableRemoved: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findCurrentForRoom: vi.fn(async () => null),
    markRemoved: vi.fn(async () => null),
    undoRemoved: vi.fn(async () => null),
    renumberQueue: vi.fn(async () => []),
    markCompleted: vi.fn(async () => null)
  };
  const onlineTasks = {
    retryTask:
      overrides.retryTask ??
      vi.fn(async ({ roomId, taskId }: { roomId: string; taskId: string }) =>
        createTask({ id: taskId, roomId, status: "selected" })
      ),
    purgeTask:
      overrides.purgeTask ??
      vi.fn(async ({ roomId, taskId }: { roomId: string; taskId: string }) =>
        createTask({ id: taskId, roomId, status: "purged" })
      ),
    promoteTask:
      overrides.promoteTask ??
      vi.fn(async ({ roomId, taskId }: { roomId: string; taskId: string }) =>
        createTask({ id: taskId, roomId, status: "promoted", readyAssetId: "asset-online-ready" })
      )
  };

  return {
    onlineTasks,
    queueEntries,
    routeDependencies: {
      config: { publicBaseUrl: "http://ktv.local" } as never,
      rooms: {
        findBySlug: vi.fn(async (slug: string) => (slug === "living-room" ? room : null)),
        findById: vi.fn(async (roomId: string) => (roomId === "living-room" ? room : null))
      },
      pairingTokens: {} as never,
      playbackSessions: {} as never,
      queueEntries: queueEntries as never,
      assets: {} as never,
      songs: {} as never,
      controlSessions: {} as never,
      assetGateway: {} as never,
      deviceSessions: {} as never
    }
  };
}

function createTask(input: Partial<OnlineCandidateTask>): OnlineCandidateTask {
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
    status: "failed",
    failureReason: null,
    recentEvent: {},
    providerPayload: {},
    readyAssetId: null,
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
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
