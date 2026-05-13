import type { Asset, ControlSession, PlaybackSession, QueueEntry, Room, Song, VocalMode } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";
import {
  QUEUE_DELETE_UNDO_TTL_MS,
  handlePlayerEnded,
  executeRoomCommand
} from "../modules/playback/session-command-service.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import { InMemoryQueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomSessionCommandRecord } from "../modules/playback/repositories/room-session-command-repository.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { ApiConfig } from "../config.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";

const now = new Date("2026-05-01T10:00:00.000Z");
type RoomCommandResult = Awaited<ReturnType<typeof executeRoomCommand>>;

describe("room queue commands", () => {
  it("accepts add, delete, undo, promote, and skip validation with command idempotency", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-queued", 2, "queued")]
    });

    const add = expectAccepted(
      await executeRoomCommand({
      commandId: "command-add",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(add.sessionVersion).toBe(2);
    expect(harness.controlSessions.touchCount).toBe(1);
    const addedQueueEntryId = add.snapshot.queue.find((entry) => entry.songId === "song-ready")?.queueEntryId;
    expect(addedQueueEntryId).toBeDefined();

    const deleted = expectAccepted(
      await executeRoomCommand({
      commandId: "command-delete",
      roomSlug: harness.room.slug,
      sessionVersion: 2,
      type: "delete-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(deleted.undo).toEqual({
      queueEntryId: "queue-queued",
      undoExpiresAt: new Date(now.getTime() + QUEUE_DELETE_UNDO_TTL_MS).toISOString()
    });
    expect(deleted.snapshot.queue.find((entry) => entry.queueEntryId === "queue-queued")?.status).toBe("removed");

    const undone = expectAccepted(
      await executeRoomCommand({
      commandId: "command-undo",
      roomSlug: harness.room.slug,
      sessionVersion: 3,
      type: "undo-delete-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now: new Date(now.getTime() + 5000)
      })
    );

    await expect(harness.queueEntries.findById("queue-queued")).resolves.toMatchObject({ status: "queued" });

    const promoted = expectAccepted(
      await executeRoomCommand({
      commandId: "command-promote",
      roomSlug: harness.room.slug,
      sessionVersion: 4,
      type: "promote-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(promoted.snapshot.queue.map((entry) => entry.queueEntryId)).toEqual([
      "queue-current",
      "queue-queued",
      addedQueueEntryId
    ]);

    const rejectedSkip = expectRejected(
      await executeRoomCommand({
      commandId: "command-skip",
      roomSlug: harness.room.slug,
      sessionVersion: 5,
      type: "skip-current",
      payload: { confirmSkip: false },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(rejectedSkip.code).toBe("SKIP_CONFIRMATION_REQUIRED");
  });

  it("keeps legacy queue commands and switch validation working while real MV assets are present", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-queued", 2, "queued")],
      targetVocalMode: "original"
    });
    await expect(harness.assetRepository.findById("asset-real-mv")).resolves.toMatchObject({
      assetKind: "dual-track-video",
      playbackProfile: { kind: "single_file_audio_tracks" }
    });

    const added = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-add",
        roomSlug: harness.room.slug,
        sessionVersion: 1,
        type: "add-queue-entry",
        payload: { songId: "song-ready" },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    const addedQueueEntryId = added.snapshot.queue.find((entry) => entry.songId === "song-ready")?.queueEntryId;
    expect(addedQueueEntryId).toBeDefined();
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: addedQueueEntryId,
          songId: "song-ready",
          assetId: "asset-ready-instrumental",
          status: "queued"
        })
      ])
    );

    const deleted = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-delete",
        roomSlug: harness.room.slug,
        sessionVersion: added.sessionVersion,
        type: "delete-queue-entry",
        payload: { queueEntryId: addedQueueEntryId },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(deleted.undo?.queueEntryId).toBe(addedQueueEntryId);
    await expect(harness.queueEntries.findById(addedQueueEntryId!)).resolves.toMatchObject({ status: "removed" });

    const undone = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-undo",
        roomSlug: harness.room.slug,
        sessionVersion: deleted.sessionVersion,
        type: "undo-delete-queue-entry",
        payload: { queueEntryId: addedQueueEntryId },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now: new Date(now.getTime() + 1000)
      })
    );
    await expect(harness.queueEntries.findById(addedQueueEntryId!)).resolves.toMatchObject({ status: "queued" });

    const promoted = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-promote",
        roomSlug: harness.room.slug,
        sessionVersion: undone.sessionVersion,
        type: "promote-queue-entry",
        payload: { queueEntryId: addedQueueEntryId },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(promoted.snapshot.queue.map((entry) => entry.queueEntryId)).toEqual([
      "queue-current",
      addedQueueEntryId,
      "queue-queued"
    ]);

    const switched = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-switch-vocal-mode",
        roomSlug: harness.room.slug,
        sessionVersion: promoted.sessionVersion,
        type: "switch-vocal-mode",
        payload: { playbackPositionMs: 12_345 },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(switched.snapshot.targetVocalMode).toBe("original");

    const skipped = expectAccepted(
      await executeRoomCommand({
        commandId: "legacy-command-skip",
        roomSlug: harness.room.slug,
        sessionVersion: switched.sessionVersion,
        type: "skip-current",
        payload: { confirmSkip: true },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(skipped.snapshot.currentTarget?.queueEntryId).toBe(addedQueueEntryId);

    const idleHarness = createHarness({ queueEntries: [] });
    await expect(idleHarness.assetRepository.findById("asset-real-mv")).resolves.toMatchObject({
      assetKind: "dual-track-video"
    });
    const rejectedSwitch = expectRejected(
      await executeRoomCommand({
        commandId: "legacy-command-switch-rejected",
        roomSlug: idleHarness.room.slug,
        sessionVersion: 1,
        type: "switch-vocal-mode",
        payload: { playbackPositionMs: 0 },
        controlSession: idleHarness.controlSession,
        repositories: idleHarness.repositories,
        assetGateway: idleHarness.assetGateway,
        config: idleHarness.config,
        now
      })
    );
    expect(rejectedSwitch.code).toBe("SWITCH_TARGET_NOT_AVAILABLE");
  });

  it("starts playback when a song is added to an idle room", async () => {
    const harness = createHarness({
      queueEntries: []
    });

    const result = expectAccepted(
      await executeRoomCommand({
        commandId: "command-add-idle",
        roomSlug: harness.room.slug,
        sessionVersion: 1,
        type: "add-queue-entry",
        payload: { songId: "song-ready" },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    const currentQueueEntryId = result.snapshot.currentTarget?.queueEntryId;
    expect(currentQueueEntryId).toBeDefined();
    expect(result.snapshot.state).toBe("loading");
    expect(result.sessionVersion).toBe(2);
    expect(result.snapshot.queue.find((entry) => entry.queueEntryId === currentQueueEntryId)).toMatchObject({
      songTitle: "Ready Song",
      status: "loading"
    });
  });

  it("queues the selected ready assetId when add-queue-entry includes a version", async () => {
    const harness = createHarness({
      queueEntries: []
    });

    const result = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-selected-asset",
        payload: { songId: "song-ready", assetId: "asset-ready-alt-instrumental" }
      })
    );

    expect(result.snapshot.currentTarget?.assetId).toBe("asset-ready-alt-instrumental");
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toMatchObject([
      {
        songId: "song-ready",
        assetId: "asset-ready-alt-instrumental"
      }
    ]);
  });

  it("accepts a ready verified online cached asset while preserving supplement source semantics", async () => {
    const harness = createHarness({
      queueEntries: []
    });

    const result = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-online-cached",
        payload: { songId: "song-ready", assetId: "asset-ready-online-cached-instrumental" }
      })
    );

    expect(result.snapshot.currentTarget?.assetId).toBe("asset-ready-online-cached-instrumental");
    await expect(harness.assetRepository.findById("asset-ready-online-cached-instrumental")).resolves.toMatchObject({
      sourceType: "online_cached",
      status: "ready",
      switchQualityStatus: "verified"
    });
  });

  it("defaults real MV queueing to accompaniment when no current playback mode exists", async () => {
    const harness = createHarness({
      queueEntries: [],
      targetVocalMode: "unknown"
    });

    const result = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-real-mv-default-instrumental",
        payload: { songId: "song-real-mv", assetId: "asset-real-mv" }
      })
    );

    expect(result.snapshot.currentTarget).toMatchObject({
      assetId: "asset-real-mv",
      vocalMode: "instrumental",
      selectedTrackRef: { id: "0x1101" }
    });
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toMatchObject([
      {
        songId: "song-real-mv",
        assetId: "asset-real-mv",
        playbackOptions: {
          preferredVocalMode: "instrumental"
        }
      }
    ]);
  });

  it("queues real MV original when the room target mode is original", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")],
      targetVocalMode: "original"
    });

    expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-real-mv-original",
        payload: { songId: "song-real-mv", assetId: "asset-real-mv" }
      })
    );

    const queue = await harness.queueEntries.listEffectiveQueue(harness.room.id);
    expect(queue.find((entry) => entry.songId === "song-real-mv")).toMatchObject({
      assetId: "asset-real-mv",
      status: "queued",
      playbackOptions: {
        preferredVocalMode: "original"
      }
    });
  });

  it("rejects real MV queueing when the selected role is missing", async () => {
    const harness = createHarness({
      queueEntries: [],
      targetVocalMode: "unknown",
      realMvAssetOverrides: {
        trackRoles: {
          original: { index: 0, id: "0x1100", label: "Original" },
          instrumental: null
        }
      }
    });

    const result = expectRejected(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-real-mv-missing-role",
        payload: { songId: "song-real-mv", assetId: "asset-real-mv" }
      })
    );

    expect(result.code).toBe("SONG_NOT_QUEUEABLE");
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toEqual([]);
  });


  it("falls back to the song default assetId when add-queue-entry omits assetId", async () => {
    const harness = createHarness({
      queueEntries: []
    });

    const result = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-default-asset",
        payload: { songId: "song-ready" }
      })
    );

    expect(result.snapshot.currentTarget?.assetId).toBe("asset-ready-instrumental");
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toMatchObject([
      {
        songId: "song-ready",
        assetId: "asset-ready-instrumental"
      }
    ]);
  });

  it.each([
    ["another song", "asset-other-instrumental"],
    ["unready", "asset-ready-unready-instrumental"],
    ["online ephemeral", "asset-ready-online-ephemeral-instrumental"],
    ["unverified", "asset-ready-unverified-instrumental"],
    ["missing counterpart", "asset-ready-solo-instrumental"]
  ])("rejects add-queue-entry when the selected asset is %s", async (_caseName, assetId) => {
    const harness = createHarness({
      queueEntries: []
    });

    const result = expectRejected(
      await executeAddQueueEntry(harness, {
        commandId: `command-add-reject-${assetId}`,
        payload: { songId: "song-ready", assetId }
      })
    );

    expect(result.code).toBe("SONG_NOT_QUEUEABLE");
    await expect(harness.queueEntries.listEffectiveQueue(harness.room.id)).resolves.toEqual([]);
  });

  it("loads playback from the promoted head when the room is idle", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-one", 1, "queued"), createQueueEntry("queue-two", 2, "queued")]
    });

    const result = expectAccepted(
      await executeRoomCommand({
        commandId: "command-promote-idle",
        roomSlug: harness.room.slug,
        sessionVersion: 1,
        type: "promote-queue-entry",
        payload: { queueEntryId: "queue-two" },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(result.snapshot.queue.map((entry) => entry.queueEntryId)).toEqual(["queue-two", "queue-one"]);
    expect(result.snapshot.currentTarget?.queueEntryId).toBe("queue-two");
    expect(result.snapshot.state).toBe("loading");
    expect(result.snapshot.queue.find((entry) => entry.queueEntryId === "queue-two")).toMatchObject({
      status: "loading"
    });
    expect(result.sessionVersion).toBe(2);
  });

  it("publishes the requested vocal mode in the snapshot after a vocal switch command", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")],
      targetVocalMode: "original"
    });

    const result = expectAccepted(
      await executeRoomCommand({
        commandId: "command-switch-vocal-mode",
        roomSlug: harness.room.slug,
        sessionVersion: 1,
        type: "switch-vocal-mode",
        payload: { playbackPositionMs: 12_345 },
        controlSession: harness.controlSession,
        repositories: harness.repositories,
        assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(result.snapshot.currentTarget?.vocalMode).toBe("instrumental");
    expect(result.snapshot.targetVocalMode).toBe("original");
  });

  it("returns duplicate for repeated command ids and conflict for stale versions", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")]
    });

    const first = expectAccepted(
      await executeRoomCommand({
      commandId: "command-duplicate",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    const second = await executeRoomCommand({
      commandId: "command-duplicate",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(second.status).toBe("duplicate");
    expect(harness.controlSessions.touchCount).toBe(1);

    const conflict = expectConflict(
      await executeRoomCommand({
      commandId: "command-conflict",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(conflict.code).toBe("SESSION_VERSION_CONFLICT");
    expect(conflict.latestSessionVersion).toBe(first.sessionVersion);
  });

  it("includes undoable removed entries in the control snapshot only while they are undoable", async () => {
    const harness = createHarness({
      queueEntries: [
        createQueueEntry("queue-current", 1, "playing"),
        createQueueEntry("queue-queued", 2, "queued"),
        createQueueEntry("queue-removed", 3, "removed", {
          removedAt: "2026-05-01T10:00:05.000Z",
          undoExpiresAt: "2026-05-01T10:00:12.000Z"
        }),
        createQueueEntry("queue-expired", 4, "removed", {
          removedAt: "2026-05-01T09:59:55.000Z",
          undoExpiresAt: "2026-05-01T10:00:01.000Z"
        })
      ]
    });

    const snapshot = await buildRoomControlSnapshot({
      roomSlug: harness.room.slug,
      config: harness.config,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      now: new Date("2026-05-01T10:00:06.000Z")
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.queue.map((entry) => entry.queueEntryId)).toEqual([
      "queue-current",
      "queue-queued",
      "queue-removed"
    ]);
    expect(snapshot?.queue.find((entry) => entry.queueEntryId === "queue-removed")).toMatchObject({
      status: "removed",
      canDelete: false,
      canPromote: false,
      undoExpiresAt: "2026-05-01T10:00:12.000Z"
    });
    expect(snapshot?.queue.some((entry) => entry.queueEntryId === "queue-expired")).toBe(false);
  });

  it("advances to the next queue entry when TV ended telemetry arrives", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-queued", 2, "queued")]
    });

    const result = await handlePlayerEnded({
      roomSlug: harness.room.slug,
      deviceId: "tv-1",
      queueEntryId: "queue-current",
      assetId: "asset-current-instrumental",
      playbackPositionMs: 179000,
      sessionVersion: 1,
      playbackEvents: harness.playbackEvents,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(result.status).toBe("accepted");
    expect(result.snapshot?.currentTarget?.queueEntryId).toBe("queue-queued");
    expect(result.snapshot?.state).toBe("loading");
    expect(result.snapshot?.queue.find((entry) => entry.queueEntryId === "queue-queued")).toMatchObject({
      status: "loading"
    });
    expect(result.snapshot?.sessionVersion).toBe(2);
  });

  it("returns idle when TV ended telemetry arrives with no next queue entry", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")]
    });

    const result = await handlePlayerEnded({
      roomSlug: harness.room.slug,
      deviceId: "tv-1",
      queueEntryId: "queue-current",
      assetId: "asset-current-instrumental",
      playbackPositionMs: 179000,
      sessionVersion: 1,
      playbackEvents: harness.playbackEvents,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(result.status).toBe("accepted");
    expect(result.snapshot?.currentTarget).toBeNull();
    expect(result.snapshot?.state).toBe("idle");
  });
});

function createHarness(options: { queueEntries: readonly QueueEntry[]; targetVocalMode?: VocalMode; realMvAssetOverrides?: Partial<Asset> }) {
  const room = createRoom();
  const songs = new Map<string, Song>([
    ["song-current", createSong("song-current", "Current", "Artist A", "asset-current-instrumental")],
    ["song-queued", createSong("song-queued", "Queued", "Artist B", "asset-queued-instrumental")],
    ["song-ready", createSong("song-ready", "Ready Song", "Artist Ready", "asset-ready-instrumental")],
    ["song-other", createSong("song-other", "Other Song", "Artist Other", "asset-other-instrumental")],
    ["song-real-mv", createSong("song-real-mv", "Real MV", "Artist MV", "asset-real-mv")]
  ]);
  const assets = new Map<string, Asset>([
    ["asset-current-instrumental", createAsset("asset-current-instrumental", "song-current", "instrumental", "family-current")],
    ["asset-current-original", createAsset("asset-current-original", "song-current", "original", "family-current")],
    ["asset-queued-instrumental", createAsset("asset-queued-instrumental", "song-queued", "instrumental", "family-queued")],
    ["asset-queued-original", createAsset("asset-queued-original", "song-queued", "original", "family-queued")],
    ["asset-ready-instrumental", createAsset("asset-ready-instrumental", "song-ready", "instrumental", "family-ready")],
    ["asset-ready-original", createAsset("asset-ready-original", "song-ready", "original", "family-ready")],
    ["asset-ready-alt-instrumental", createAsset("asset-ready-alt-instrumental", "song-ready", "instrumental", "family-ready-alt")],
    ["asset-ready-alt-original", createAsset("asset-ready-alt-original", "song-ready", "original", "family-ready-alt")],
    ["asset-other-instrumental", createAsset("asset-other-instrumental", "song-other", "instrumental", "family-other")],
    ["asset-other-original", createAsset("asset-other-original", "song-other", "original", "family-other")],
    [
      "asset-ready-unready-instrumental",
      createAsset("asset-ready-unready-instrumental", "song-ready", "instrumental", "family-ready-unready", {
        status: "caching"
      })
    ],
    ["asset-ready-unready-original", createAsset("asset-ready-unready-original", "song-ready", "original", "family-ready-unready")],
    [
      "asset-ready-online-ephemeral-instrumental",
      createAsset("asset-ready-online-ephemeral-instrumental", "song-ready", "instrumental", "family-ready-online", {
        sourceType: "online_ephemeral"
      })
    ],
    ["asset-ready-online-original", createAsset("asset-ready-online-original", "song-ready", "original", "family-ready-online")],
    [
      "asset-ready-online-cached-instrumental",
      createAsset("asset-ready-online-cached-instrumental", "song-ready", "instrumental", "family-ready-online-cached", {
        sourceType: "online_cached"
      })
    ],
    [
      "asset-ready-online-cached-original",
      createAsset("asset-ready-online-cached-original", "song-ready", "original", "family-ready-online-cached", {
        sourceType: "online_cached"
      })
    ],
    [
      "asset-ready-unverified-instrumental",
      createAsset("asset-ready-unverified-instrumental", "song-ready", "instrumental", "family-ready-unverified", {
        switchQualityStatus: "review_required"
      })
    ],
    ["asset-ready-unverified-original", createAsset("asset-ready-unverified-original", "song-ready", "original", "family-ready-unverified")],
    ["asset-ready-solo-instrumental", createAsset("asset-ready-solo-instrumental", "song-ready", "instrumental", "family-ready-solo")],
    ["asset-real-mv", createRealMvAsset(options.realMvAssetOverrides)]
  ]);
  const playbackSession = new FakePlaybackSessionRepository({
    roomId: room.id,
    currentQueueEntryId: options.queueEntries.find((entry) => entry.status === "playing")?.id ?? null,
    nextQueueEntryId: null,
    activeAssetId: options.queueEntries.find((entry) => entry.status === "playing")?.assetId ?? null,
    targetVocalMode: options.targetVocalMode ?? "instrumental",
    playerState: options.queueEntries.some((entry) => entry.status === "playing") ? "playing" : "idle",
    playerPositionMs: 0,
    mediaStartedAt: null,
    version: 1,
    updatedAt: now.toISOString()
  });
  const queueEntries = new InMemoryQueueEntryRepository(options.queueEntries);
  const controlSessions = new TrackingControlSessionRepository([
    {
      id: "control-session-1",
      roomId: room.id,
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ]);
  const roomPairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: room.id,
      tokenValue: "token-1",
      tokenHash: "hash-1",
      tokenExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      rotatedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ]);
  const commandRepo = new FakeRoomSessionCommandRepository();
  const playbackEvents = new FakePlaybackEventRepository();
  const assetRepository = new FakeAssetRepository(assets);
  const songRepository = new FakeSongRepository(songs);
  const roomRepository = new FakeRoomRepository(room);
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
  const config = createConfig();
  const controlSession: ControlSessionInfo = {
    id: "control-session-1",
    roomId: room.id,
    roomSlug: room.slug,
    deviceId: "phone-1",
    deviceName: "Mobile Controller",
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    lastSeenAt: now.toISOString()
  };

  return {
    room,
    queueEntries,
    controlSessions,
    assetRepository,
    songRepository,
    roomRepository,
    assetGateway,
    config,
    controlSession,
    commandRepo,
    playbackEvents,
    repositories: {
      rooms: roomRepository,
      playbackSessions: playbackSession,
      queueEntries,
      assets: assetRepository,
      songs: songRepository,
      pairingTokens: roomPairingTokens,
      controlSessions,
      controlCommands: commandRepo,
      deviceSessions: new FakeDeviceSessionRepository(),
      playbackEvents
    }
  };
}

class FakePlaybackSessionRepository implements PlaybackSessionRepository {
  constructor(public session: PlaybackSession) {}

  async findByRoomId(roomId: string): Promise<PlaybackSession | null> {
    return roomId === this.session.roomId ? { ...this.session } : null;
  }

  async startQueueEntry(input: Parameters<PlaybackSessionRepository["startQueueEntry"]>[0]): Promise<PlaybackSession | null> {
    if (input.roomId !== this.session.roomId) {
      return null;
    }

    this.session = {
      ...this.session,
      currentQueueEntryId: input.queueEntryId,
      activeAssetId: input.activeAssetId,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode,
      playerState: input.playerState ?? "playing",
      playerPositionMs: input.playerPositionMs ?? 0,
      nextQueueEntryId: input.nextQueueEntryId ?? null,
      mediaStartedAt: input.mediaStartedAt?.toISOString() ?? this.session.mediaStartedAt,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async setIdle(roomId: string): Promise<PlaybackSession | null> {
    if (roomId !== this.session.roomId) {
      return null;
    }

    this.session = {
      ...this.session,
      currentQueueEntryId: null,
      nextQueueEntryId: null,
      activeAssetId: null,
      playerState: "idle",
      playerPositionMs: 0,
      mediaStartedAt: null,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async requestSwitchTarget(input: Parameters<PlaybackSessionRepository["requestSwitchTarget"]>[0]): Promise<PlaybackSession | null> {
    if (input.roomId !== this.session.roomId) {
      return null;
    }

    this.session = {
      ...this.session,
      targetVocalMode: input.targetVocalMode,
      playerPositionMs: input.playerPositionMs ?? this.session.playerPositionMs,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async bumpVersion(roomId: string): Promise<PlaybackSession | null> {
    if (roomId !== this.session.roomId) {
      return null;
    }

    this.session = {
      ...this.session,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async updatePlayerPosition(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }

  async updatePlaybackFacts(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }
}

class FakeRoomRepository implements RoomRepository {
  constructor(private readonly room: Room) {}

  async findById(roomId: string): Promise<Room | null> {
    return roomId === this.room.id ? { ...this.room } : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return slug === this.room.slug ? { ...this.room } : null;
  }
}

class FakeSongRepository implements SongRepository {
  constructor(private readonly songs: Map<string, Song>) {}

  async findById(songId: string): Promise<Song | null> {
    return this.songs.get(songId) ? { ...this.songs.get(songId)! } : null;
  }
}

class FakeAssetRepository implements AssetRepository {
  constructor(private readonly assets: Map<string, Asset>) {}

  async findById(assetId: string): Promise<Asset | null> {
    const asset = this.assets.get(assetId);
    return asset ? { ...asset } : null;
  }

  async findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]> {
    return [...this.assets.values()].filter(
      (candidate) =>
        candidate.songId === asset.songId &&
        candidate.switchFamily === asset.switchFamily &&
        candidate.vocalMode !== asset.vocalMode &&
        candidate.status === "ready" &&
        candidate.switchQualityStatus === "verified"
    );
  }
}

class TrackingControlSessionRepository extends InMemoryControlSessionRepository {
  touchCount = 0;

  async touch(input: Parameters<InMemoryControlSessionRepository["touch"]>[0]) {
    this.touchCount += 1;
    return super.touch(input);
  }
}

class FakeRoomSessionCommandRepository {
  private readonly records = new Map<string, RoomSessionCommandRecord>();

  async findCommand(commandId: string): Promise<RoomSessionCommandRecord | null> {
    return this.records.get(commandId) ?? null;
  }

  async insertCommandAttempt(input: RoomSessionCommandRecord): Promise<RoomSessionCommandRecord> {
    this.records.set(input.commandId, { ...input });
    return { ...input };
  }

  async updateCommandResult(input: { commandId: string; resultStatus: RoomSessionCommandRecord["resultStatus"]; resultPayload?: Record<string, unknown> }) {
    const existing = this.records.get(input.commandId);
    if (!existing) {
      return null;
    }

    const updated: RoomSessionCommandRecord = {
      ...existing,
      resultStatus: input.resultStatus,
      resultPayload: input.resultPayload ?? {}
    };
    this.records.set(input.commandId, updated);
    return { ...updated };
  }
}

class FakePlaybackEventRepository {
  async append(): Promise<null> {
    return null;
  }
}

class FakeDeviceSessionRepository implements PlayerDeviceSessionRepository {
  async findActiveTvPlayer(roomId: string, activeAfter: Date) {
    if (roomId !== "living-room") {
      return null;
    }

    const lastSeenAt = new Date(activeAfter.getTime() + 1000).toISOString();
    return {
      id: "tv-1",
      roomId: "living-room",
      deviceType: "tv",
      deviceName: "Living Room TV",
      lastSeenAt,
      capabilities: { videoPool: "dual-video" },
      pairingToken: "token-1",
      createdAt: now.toISOString(),
      updatedAt: lastSeenAt
    } as any;
  }

  async upsertTvPlayer() {
    return null as any;
  }

  async updateTvHeartbeat() {
    return null;
  }
}

function createConfig(): ApiConfig {
  return {
    corsAllowedOrigins: [],
    databaseUrl: "",
    mediaRoot: "/media-root",
    onlineDemoReadyAssetId: "",
    onlineProviderIds: [],
    onlineProviderKillSwitchIds: [],
    publicBaseUrl: "http://ktv.local",
    roomSlug: "living-room",
    port: 4000,
    host: "0.0.0.0",
    scanIntervalMinutes: 360
  };
}

function createRoom(): Room {
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createSong(id: string, title: string, artistName: string, defaultAssetId: string | null): Song {
  return {
    id,
    title,
    normalizedTitle: title,
    titlePinyin: "",
    titleInitials: "",
    artistId: `artist-${id}`,
    artistName,
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: null,
    canonicalDurationMs: 180000,
    searchWeight: 0,
    defaultAssetId,
    capabilities: { canSwitchVocalMode: true },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAsset(
  id: string,
  songId: string,
  vocalMode: Asset["vocalMode"],
  switchFamily: string,
  overrides: Partial<Asset> = {}
): Asset {
  return {
    id,
    songId,
    sourceType: "local",
    assetKind: "video",
    displayName: id,
    filePath: `${id}.mp4`,
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode,
    status: "ready",
    switchFamily,
    switchQualityStatus: "verified",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createRealMvAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-real-mv",
    songId: "song-real-mv",
    sourceType: "local",
    assetKind: "dual-track-video",
    displayName: "Real MV",
    filePath: "real-mv.mkv",
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode: "dual",
    status: "ready",
    switchFamily: null,
    switchQualityStatus: "review_required",
    compatibilityStatus: "playable",
    trackRoles: {
      original: { index: 0, id: "0x1100", label: "Original" },
      instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
    },
    playbackProfile: {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac", "aac"],
      requiresAudioTrackSelection: true
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createQueueEntry(
  id: string,
  queuePosition: number,
  status: QueueEntry["status"],
  timestamps: { removedAt: string; undoExpiresAt: string } | null = null
): QueueEntry {
  return {
    id,
    roomId: "living-room",
    songId: id === "queue-current" ? "song-current" : "song-queued",
    assetId: id === "queue-current" ? "asset-current-instrumental" : "asset-queued-instrumental",
    requestedBy: "phone-1",
    queuePosition,
    status,
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "instrumental",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: now.toISOString(),
    startedAt: status === "playing" ? now.toISOString() : null,
    endedAt: null,
    removedAt: timestamps?.removedAt ?? null,
    removedByControlSessionId: timestamps ? "control-session-1" : null,
    undoExpiresAt: timestamps?.undoExpiresAt ?? null
  };
}

function expectAccepted(result: RoomCommandResult): Extract<RoomCommandResult, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") {
    throw new Error(`Expected accepted, got ${result.status}`);
  }

  return result;
}

function expectRejected(result: RoomCommandResult): Extract<RoomCommandResult, { status: "rejected" }> {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") {
    throw new Error(`Expected rejected, got ${result.status}`);
  }

  return result;
}

function expectConflict(result: RoomCommandResult): Extract<RoomCommandResult, { status: "conflict" }> {
  expect(result.status).toBe("conflict");
  if (result.status !== "conflict") {
    throw new Error(`Expected conflict, got ${result.status}`);
  }

  return result;
}

function executeAddQueueEntry(
  harness: ReturnType<typeof createHarness>,
  input: { commandId: string; payload: { songId: string; assetId?: string } }
): Promise<RoomCommandResult> {
  return executeRoomCommand({
    commandId: input.commandId,
    roomSlug: harness.room.slug,
    sessionVersion: 1,
    type: "add-queue-entry",
    payload: input.payload,
    controlSession: harness.controlSession,
    repositories: harness.repositories,
    assetGateway: harness.assetGateway,
    config: harness.config,
    now
  });
}
