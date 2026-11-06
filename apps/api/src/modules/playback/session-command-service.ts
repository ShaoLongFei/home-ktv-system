import type { MediaGateway } from "../media/media-gateway.js";
import type { PlayableMediaAsset } from "../media/playable-media-repository.js";
import type { ApiConfig } from "../../config.js";
import type {
  ControlCommandType,
  MediaSourceRef,
  ControlSession,
  PlaybackSession,
  QueueEntry,
  Room,
  VocalMode
} from "@home-ktv/domain";
import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";
import type { PlaybackNotice } from "@home-ktv/player-contracts";
import { SESSION_VERSION_CONFLICT, interleaveQueueByRequester, promoteAfterCurrent } from "@home-ktv/session-engine";
import { serializeControlSessionCookie, touchControlSession } from "../controller/control-session-service.js";
import type { ControlSnapshotRepositories } from "../rooms/build-control-snapshot.js";
import { buildRoomControlSnapshot } from "../rooms/build-control-snapshot.js";
import { buildSwitchTarget } from "./build-switch-target.js";
import type { RoomSessionCommandRepository } from "./repositories/room-session-command-repository.js";
import type { QueueEntryRepository } from "./repositories/queue-entry-repository.js";

export const QUEUE_DELETE_UNDO_TTL_MS = 10 * 1000;

export interface ExecuteRoomCommandInput {
  commandId: string;
  roomSlug: string;
  sessionVersion: number;
  type: ControlCommandType;
  payload: Record<string, unknown>;
  controlSession: ControlSessionInfo;
  controllerUser?: { phone: string; displayName: string } | undefined;
  repositories: CommandRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
  config: ApiConfig;
  now?: Date;
}

export interface HandlePlayerEndedInput {
  roomSlug: string;
  deviceId: string;
  queueEntryId: string;
  assetId: string;
  playbackPositionMs: number;
  sessionVersion: number;
  playbackEvents: {
    append(input: {
      roomId: string;
      queueEntryId: string;
      eventType: string;
      eventPayload: Record<string, unknown>;
    }): Promise<unknown>;
  };
  repositories: CommandRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
  config: ApiConfig;
  now?: Date;
}

export interface HandlePlayerFailedInput extends HandlePlayerEndedInput {
  failureCause: string;
  message?: string | undefined;
  errorCode?: string | undefined;
  stage?: string | undefined;
}

export interface AdvanceToNextInput {
  room: Room;
  repositories: CommandRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
  config: ApiConfig;
  completionStatus: "played" | "skipped" | "failed";
  notice?: PlaybackNotice | null;
  now?: Date;
}

export interface CommandRepositories extends ControlSnapshotRepositories {
  controlCommands: RoomSessionCommandRepository;
  queueEntries: QueueEntryRepository;
}

export type CommandExecutionResult =
  | AcceptedCommandResult
  | DuplicateCommandResult
  | ConflictCommandResult
  | RejectedCommandResult;

export interface AcceptedCommandResult {
  status: "accepted";
  commandId: string;
  sessionVersion: number;
  snapshot: RoomControlSnapshot;
  undo?: { queueEntryId: string; undoExpiresAt: string };
  controlSessionCookie?: string | undefined;
}

export interface DuplicateCommandResult {
  status: "duplicate";
  commandId: string;
  sessionVersion: number;
}

export interface ConflictCommandResult {
  status: "conflict";
  commandId: string;
  code: typeof SESSION_VERSION_CONFLICT;
  latestSessionVersion: number;
  snapshot: RoomControlSnapshot;
}

export interface RejectedCommandResult {
  status: "rejected";
  commandId: string;
  sessionVersion: number;
  code: string;
  message?: string | undefined;
}

interface QueueMutationContext {
  room: Room;
  session: {
    currentQueueEntryId: string | null;
    nextQueueEntryId: string | null;
    version: number;
    playerPositionMs: number;
    targetVocalMode: VocalMode;
    activeAssetId: string | null;
    playerState: string;
  };
  now: Date;
}

export async function executeRoomCommand(input: ExecuteRoomCommandInput): Promise<CommandExecutionResult> {
  const now = input.now ?? new Date();
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return rejected(input.commandId, input.sessionVersion, "ROOM_NOT_FOUND");
  }

  if (!input.commandId.trim()) {
    return rejected(input.commandId, input.sessionVersion, "INVALID_COMMAND_ID");
  }

  if (input.controlSession.roomId !== room.id) {
    return rejected(input.commandId, input.sessionVersion, "CONTROL_SESSION_REQUIRED");
  }

  const existing = await input.repositories.controlCommands.findCommand(input.commandId);
  if (existing) {
    return { status: "duplicate", commandId: input.commandId, sessionVersion: existing.sessionVersion };
  }

  const session = await input.repositories.playbackSessions.findByRoomId(room.id);
  if (!session) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_SESSION_NOT_FOUND");
  }

  if (session.version !== input.sessionVersion) {
    const snapshot = await buildRoomControlSnapshot({
      roomSlug: room.slug,
      config: input.config,
      repositories: input.repositories,
      ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
      now
    });
    if (!snapshot) {
      return rejected(input.commandId, input.sessionVersion, "ROOM_NOT_FOUND");
    }

    await recordCommandResult(input.repositories, {
      commandId: input.commandId,
      roomId: room.id,
      controlSessionId: input.controlSession.id,
      sessionVersion: input.sessionVersion,
      type: input.type,
      payload: input.payload,
      resultStatus: "conflict",
      resultPayload: {
        code: SESSION_VERSION_CONFLICT,
        latestSessionVersion: snapshot.sessionVersion,
        snapshot
      }
    });

    return {
      status: "conflict",
      commandId: input.commandId,
      code: SESSION_VERSION_CONFLICT,
      latestSessionVersion: snapshot.sessionVersion,
      snapshot
    };
  }

  const context: QueueMutationContext = { room, session, now };
  const commandResult = await executeMutatingCommand(input, context);

  if (commandResult.status === "accepted") {
    await recordCommandResult(input.repositories, {
      commandId: input.commandId,
      roomId: room.id,
      controlSessionId: input.controlSession.id,
      sessionVersion: input.sessionVersion,
      type: input.type,
      payload: input.payload,
      resultStatus: "accepted",
      resultPayload: {
        snapshot: commandResult.snapshot,
        undo: commandResult.undo ?? null
      }
    });
  } else if (commandResult.status === "rejected") {
    await recordCommandResult(input.repositories, {
      commandId: input.commandId,
      roomId: room.id,
      controlSessionId: input.controlSession.id,
      sessionVersion: input.sessionVersion,
      type: input.type,
      payload: input.payload,
      resultStatus: "rejected",
      resultPayload: {
        code: commandResult.code,
        message: commandResult.message ?? null
      }
    });
  }

  return commandResult;
}

export async function handlePlayerEnded(input: HandlePlayerEndedInput): Promise<{
  status: "accepted" | "rejected";
  snapshot: RoomControlSnapshot | null;
  sessionVersion: number;
  rejectReason?: string;
}> {
  const now = input.now ?? new Date();
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return { status: "rejected", snapshot: null, sessionVersion: 0, rejectReason: "room_not_found" };
  }

  const currentPlayback = await currentPlaybackTelemetryMatch(input, room);
  await input.playbackEvents.append({
    roomId: room.id,
    queueEntryId: input.queueEntryId,
    eventType: "ended",
    eventPayload: {
      deviceId: input.deviceId,
      sessionVersion: input.sessionVersion,
      assetId: input.assetId,
      playbackPositionMs: input.playbackPositionMs,
      ignored: !currentPlayback.matches,
      ignoreReason: currentPlayback.matches ? null : currentPlayback.reason,
      emittedAt: now.toISOString()
    }
  });

  if (!currentPlayback.matches) {
    return {
      status: "rejected",
      snapshot: null,
      sessionVersion: currentPlayback.sessionVersion,
      rejectReason: currentPlayback.reason
    };
  }

  const result = await advanceToNext({
    room,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    config: input.config,
    completionStatus: "played",
    now
  });

  return {
    status: "accepted",
    snapshot: result.snapshot,
    sessionVersion: result.sessionVersion
  };
}

export async function handlePlayerFailed(input: HandlePlayerFailedInput): Promise<{
  status: "accepted" | "rejected";
  snapshot: RoomControlSnapshot | null;
  sessionVersion: number;
  failureCause: string;
  fallbackResult: "skipped_to_next" | "skipped_to_idle";
  notice: PlaybackNotice;
  rejectReason?: string;
}> {
  const now = input.now ?? new Date();
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return {
      status: "rejected",
      snapshot: null,
      sessionVersion: 0,
      failureCause: input.failureCause,
      fallbackResult: "skipped_to_idle",
      notice: playbackFailedNotice(input.failureCause, "skipped_to_idle"),
      rejectReason: "room_not_found"
    };
  }

  const currentPlayback = await currentPlaybackTelemetryMatch(input, room);
  if (!currentPlayback.matches) {
    await input.playbackEvents.append({
      roomId: room.id,
      queueEntryId: input.queueEntryId,
      eventType: "failed",
      eventPayload: {
        deviceId: input.deviceId,
        sessionVersion: input.sessionVersion,
        assetId: input.assetId,
        playbackPositionMs: input.playbackPositionMs,
        failureCause: input.failureCause,
        fallbackResult: "ignored_stale",
        message: input.message ?? null,
        errorCode: input.errorCode ?? null,
        stage: input.stage ?? null,
        ignored: true,
        ignoreReason: currentPlayback.reason,
        emittedAt: now.toISOString()
      }
    });

    return {
      status: "rejected",
      snapshot: null,
      sessionVersion: currentPlayback.sessionVersion,
      failureCause: input.failureCause,
      fallbackResult: "skipped_to_idle",
      notice: playbackFailedNotice(input.failureCause, "skipped_to_idle"),
      rejectReason: currentPlayback.reason
    };
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(room.id);
  const currentIndex = effectiveQueue.findIndex((entry) => entry.id === input.queueEntryId);
  const fallbackResult = currentIndex >= 0 && effectiveQueue[currentIndex + 1] ? "skipped_to_next" : "skipped_to_idle";
  const notice = playbackFailedNotice(input.failureCause, fallbackResult);

  await input.playbackEvents.append({
    roomId: room.id,
    queueEntryId: input.queueEntryId,
    eventType: "failed",
    eventPayload: {
      deviceId: input.deviceId,
      sessionVersion: input.sessionVersion,
      assetId: input.assetId,
      playbackPositionMs: input.playbackPositionMs,
      failureCause: input.failureCause,
      fallbackResult,
      message: input.message ?? null,
      errorCode: input.errorCode ?? null,
      stage: input.stage ?? null,
      emittedAt: now.toISOString()
    }
  });

  const result = await advanceToNext({
    room,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    config: input.config,
    completionStatus: "failed",
    notice,
    now
  });

  return {
    status: "accepted",
    snapshot: result.snapshot,
    sessionVersion: result.sessionVersion,
    failureCause: input.failureCause,
    fallbackResult,
    notice
  };
}

export async function advanceToNext(input: AdvanceToNextInput): Promise<{
  snapshot: RoomControlSnapshot | null;
  sessionVersion: number;
}> {
  const now = input.now ?? new Date();
  const session = await input.repositories.playbackSessions.findByRoomId(input.room.id);
  if (!session) {
    return { snapshot: null, sessionVersion: 0 };
  }

  const currentQueueEntryId = session.currentQueueEntryId;
  if (!currentQueueEntryId) {
    await input.repositories.playbackSessions.setIdle(input.room.id);
    const snapshot = await buildRoomControlSnapshot({
      roomSlug: input.room.slug,
      config: input.config,
      repositories: input.repositories,
      ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
      ...(input.notice !== undefined ? { notice: input.notice } : {}),
      now
    });
    return { snapshot, sessionVersion: snapshot?.sessionVersion ?? session.version };
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(input.room.id);
  const currentIndex = effectiveQueue.findIndex((entry) => entry.id === currentQueueEntryId);
  const currentEntry = await input.repositories.queueEntries.findById(currentQueueEntryId);

  if (currentEntry) {
    await input.repositories.queueEntries.markCompleted({
      roomId: input.room.id,
      queueEntryId: currentEntry.id,
      status: input.completionStatus,
      endedAt: now
    });
  }

  const nextEntry = currentIndex >= 0 ? effectiveQueue[currentIndex + 1] ?? null : null;
  if (!nextEntry) {
    const idleSession = await input.repositories.playbackSessions.setIdle(input.room.id);
    const snapshot = await buildRoomControlSnapshot({
      roomSlug: input.room.slug,
      config: input.config,
      repositories: input.repositories,
      ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
      ...(input.notice !== undefined ? { notice: input.notice } : {}),
      now
    });
    return { snapshot, sessionVersion: idleSession?.version ?? snapshot?.sessionVersion ?? session.version };
  }

  const nextPlayableMedia = await resolvePlayableMediaForQueueEntry(input.repositories, nextEntry);
  if (!nextPlayableMedia) {
    const idleSession = await input.repositories.playbackSessions.setIdle(input.room.id);
    const snapshot = await buildRoomControlSnapshot({
      roomSlug: input.room.slug,
      config: input.config,
      repositories: input.repositories,
      ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
      ...(input.notice !== undefined ? { notice: input.notice } : {}),
      now
    });
    return { snapshot, sessionVersion: idleSession?.version ?? snapshot?.sessionVersion ?? session.version };
  }

  const nextTargetVocalMode = targetVocalModeForPlayableMedia(nextPlayableMedia, nextEntry);
  // 先把别的残留 playing 收掉，保证任何时刻只有一条在播
  await input.repositories.queueEntries.completeStalePlaying?.({
    roomId: input.room.id,
    keepQueueEntryId: nextEntry.id,
    now
  });
  await markQueueEntryPlaybackState(input.repositories, {
    roomId: input.room.id,
    queueEntryId: nextEntry.id,
    status: "loading",
    startedAt: now
  });
  const updatedSession = await input.repositories.playbackSessions.startQueueEntry({
    roomId: input.room.id,
    queueEntryId: nextEntry.id,
    activeAssetId: null,
    playerState: "loading",
    playerPositionMs: 0,
    nextQueueEntryId: currentIndex >= 0 ? effectiveQueue[currentIndex + 2]?.id ?? null : null,
    mediaStartedAt: null,
    targetVocalMode: nextTargetVocalMode
  });

  const snapshot = await buildRoomControlSnapshot({
    roomSlug: input.room.slug,
    config: input.config,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    ...(input.notice !== undefined ? { notice: input.notice } : {}),
    now
  });

  return {
    snapshot,
    sessionVersion: updatedSession?.version ?? snapshot?.sessionVersion ?? session.version
  };
}

async function currentPlaybackTelemetryMatch(
  input: HandlePlayerEndedInput,
  room: Room
): Promise<{ matches: true; sessionVersion: number } | { matches: false; sessionVersion: number; reason: string }> {
  const session = await input.repositories.playbackSessions.findByRoomId(room.id);
  if (!session) {
    return { matches: false, sessionVersion: 0, reason: "playback_session_missing" };
  }

  if (room.defaultPlayerDeviceId && room.defaultPlayerDeviceId !== input.deviceId) {
    return {
      matches: false,
      sessionVersion: session.version,
      reason: "player_device_not_owner"
    };
  }

  if (session.currentQueueEntryId !== input.queueEntryId) {
    return {
      matches: false,
      sessionVersion: session.version,
      reason: "queue_entry_not_current"
    };
  }

  const currentEntry = await input.repositories.queueEntries.findById(input.queueEntryId);
  if (!currentEntry || currentEntry.roomId !== room.id) {
    return {
      matches: false,
      sessionVersion: session.version,
      reason: "queue_entry_missing"
    };
  }

  if (currentEntry.assetId !== input.assetId) {
    return {
      matches: false,
      sessionVersion: session.version,
      reason: "asset_not_current"
    };
  }

  return { matches: true, sessionVersion: session.version };
}

function playbackFailedNotice(
  failureCause: string,
  fallbackResult: "skipped_to_next" | "skipped_to_idle"
): PlaybackNotice {
  const resultText = fallbackResult === "skipped_to_next" ? "Skipped to next song." : "Skipped and returned to idle.";
  return {
    kind: "playback_failed_skipped" as PlaybackNotice["kind"],
    message: `Playback failed (${failureCause}). ${resultText}`
  };
}

async function executeMutatingCommand(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  switch (input.type) {
    case "add-queue-entry":
      return addQueueEntry(input, context);
    case "delete-queue-entry":
      return deleteQueueEntry(input, context);
    case "undo-delete-queue-entry":
      return undoDeleteQueueEntry(input, context);
    case "promote-queue-entry":
      return promoteQueueEntry(input, context);
    case "shuffle-queue":
      return shuffleQueue(input, context);
    case "skip-current":
      if (input.payload.confirmSkip !== true) {
        return rejected(input.commandId, input.sessionVersion, "SKIP_CONFIRMATION_REQUIRED");
      }
      return runAdvanceCommand(input, context, "skipped");
    case "switch-vocal-mode":
      return switchVocalMode(input, context);
    case "set-volume":
      return setVolume(input, context);
    case "replay-current":
      return replayCurrent(input, context);
    case "toggle-pause":
      return togglePause(input, context);
    case "player-ended":
      return rejected(input.commandId, input.sessionVersion, "PLAYER_ENDED_IS_TELEMETRY_ONLY");
  }
}

async function addQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const sourceType = typeof input.payload.sourceType === "string" ? input.payload.sourceType : "";
  return addSourceQueueEntry(input, context, sourceType);
}

async function addSourceQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext,
  sourceType: string
): Promise<CommandExecutionResult> {
  if (sourceType !== "nas") {
    return rejected(input.commandId, input.sessionVersion, "INVALID_QUEUE_SOURCE");
  }

  const assetId = typeof input.payload.assetId === "string" ? input.payload.assetId : "";
  if (!assetId) {
    return rejected(input.commandId, input.sessionVersion, "INVALID_QUEUE_SOURCE");
  }

  const playableMedia = await input.repositories.playableMedia?.findPlayableBySource({ sourceType: "nas", assetId });
  if (!playableMedia || !isQueueablePlayableMedia(playableMedia)) {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const preferredVocalMode = preferredVocalModeForPlayableMedia(playableMedia, context.session.targetVocalMode);
  if (!preferredVocalMode) {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  // 取最大值而不是"最后一条"：listEffectiveQueue 还会按 priority 排，
  // 结尾那条不一定是 position 最大的，靠它 +1 会把新歌插到前面去
  const queuePosition = effectiveQueue.reduce((max, entry) => Math.max(max, entry.queuePosition), 0);
  await input.repositories.queueEntries.append({
    roomId: context.room.id,
    songId: playableMedia.songId,
    requestedBy: input.controlSession.deviceId,
    requestedByUserPhone: input.controllerUser?.phone ?? null,
    requestedByName: input.controllerUser?.displayName ?? null,
    queuePosition: queuePosition + 1,
    playbackOptions: { preferredVocalMode }
  });

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function deleteQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const queueEntryId = typeof input.payload.queueEntryId === "string" ? input.payload.queueEntryId : "";
  if (!queueEntryId) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_DELETABLE");
  }

  const queueEntry = await input.repositories.queueEntries.findById(queueEntryId);
  if (!queueEntry || queueEntry.roomId !== context.room.id || queueEntry.status !== "queued") {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_DELETABLE");
  }

  const removed = await input.repositories.queueEntries.markRemoved({
    roomId: context.room.id,
    queueEntryId: queueEntry.id,
    removedAt: context.now,
    removedByControlSessionId: input.controlSession.id,
    undoExpiresAt: new Date(context.now.getTime() + QUEUE_DELETE_UNDO_TTL_MS)
  });
  if (!removed) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_DELETABLE");
  }

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    undo: {
      queueEntryId: removed.id,
      undoExpiresAt: removed.undoExpiresAt ?? new Date(context.now.getTime() + QUEUE_DELETE_UNDO_TTL_MS).toISOString()
    },
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function undoDeleteQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const queueEntryId = typeof input.payload.queueEntryId === "string" ? input.payload.queueEntryId : "";
  if (!queueEntryId) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_UNDOABLE");
  }

  const restored = await input.repositories.queueEntries.undoRemoved({
    roomId: context.room.id,
    queueEntryId,
    now: context.now
  });
  if (!restored) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_UNDOABLE");
  }

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function promoteQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const queueEntryId = typeof input.payload.queueEntryId === "string" ? input.payload.queueEntryId : "";
  if (!queueEntryId) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_PROMOTABLE");
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  const target = effectiveQueue.find((entry) => entry.id === queueEntryId);
  if (!target || (target.status !== "queued" && target.status !== "preparing" && target.status !== "loading")) {
    return rejected(input.commandId, input.sessionVersion, "QUEUE_ENTRY_NOT_PROMOTABLE");
  }

  const currentQueueEntryId = context.session.currentQueueEntryId;
  const reordered = currentQueueEntryId
    ? promoteAfterCurrent(effectiveQueue, target.id, currentQueueEntryId)
    : moveEntryToFront(effectiveQueue, target.id);
  await input.repositories.queueEntries.renumberQueue(
    context.room.id,
    reordered.map((entry) => entry.id)
  );

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function shuffleQueue(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  const reordered = interleaveQueueByRequester(effectiveQueue, context.session.currentQueueEntryId);
  await input.repositories.queueEntries.renumberQueue(
    context.room.id,
    reordered.map((entry) => entry.id)
  );

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function switchVocalMode(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const switchTarget = await buildSwitchTarget({
    roomSlug: context.room.slug,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {})
  });

  if (!switchTarget) {
    return rejected(input.commandId, input.sessionVersion, "SWITCH_TARGET_NOT_AVAILABLE");
  }

  await input.repositories.playbackSessions.requestSwitchTarget({
    roomId: context.room.id,
    targetVocalMode: switchTarget.vocalMode,
    playerPositionMs:
      typeof input.payload.playbackPositionMs === "number" && Number.isFinite(input.payload.playbackPositionMs)
        ? Math.max(0, Math.trunc(input.payload.playbackPositionMs))
        : switchTarget.resumePositionMs
  });

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function replayCurrent(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const session = await input.repositories.playbackSessions.findByRoomId(context.room.id);
  if (!session?.currentQueueEntryId) {
    return rejected(input.commandId, input.sessionVersion, "NO_CURRENT_TARGET");
  }
  if (!input.repositories.playbackSessions.replayCurrent) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_CONTROL_UNAVAILABLE");
  }

  const updated = await input.repositories.playbackSessions.replayCurrent(context.room.id);
  if (!updated) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_SESSION_NOT_FOUND");
  }

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function togglePause(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const session = await input.repositories.playbackSessions.findByRoomId(context.room.id);
  if (!session?.currentQueueEntryId) {
    return rejected(input.commandId, input.sessionVersion, "NO_CURRENT_TARGET");
  }
  if (!input.repositories.playbackSessions.setPaused) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_CONTROL_UNAVAILABLE");
  }

  const updated = await input.repositories.playbackSessions.setPaused({
    roomId: context.room.id,
    paused: session.playerState !== "paused"
  });
  if (!updated) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_SESSION_NOT_FOUND");
  }

  const snapshot = await finishAcceptedCommand(input, context);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function setVolume(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const volumePercent = normalizeVolumePercent(input.payload.volumePercent);
  if (volumePercent == null) {
    return rejected(input.commandId, input.sessionVersion, "INVALID_VOLUME");
  }

  if (!input.repositories.playbackSessions.setVolume) {
    return rejected(input.commandId, input.sessionVersion, "VOLUME_CONTROL_UNAVAILABLE");
  }

  const updatedSession = await input.repositories.playbackSessions.setVolume({
    roomId: context.room.id,
    volumePercent
  });
  if (!updatedSession) {
    return rejected(input.commandId, input.sessionVersion, "PLAYBACK_SESSION_NOT_FOUND");
  }

  const snapshot = await finishAcceptedSnapshotCommand(input, context, updatedSession.version);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: snapshot.sessionVersion,
    snapshot: snapshot.snapshot,
    controlSessionCookie: snapshot.controlSessionCookie
  };
}

async function runAdvanceCommand(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext,
  completionStatus: "played" | "skipped"
): Promise<CommandExecutionResult> {
  const result = await advanceToNext({
    room: context.room,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    config: input.config,
    completionStatus,
    now: context.now
  });

  if (!result.snapshot) {
    return rejected(input.commandId, input.sessionVersion, "ROOM_NOT_FOUND");
  }

  const controlSessionCookie = await touchAcceptedControlSession(input, context.now);
  return {
    status: "accepted",
    commandId: input.commandId,
    sessionVersion: result.sessionVersion,
    snapshot: result.snapshot,
    controlSessionCookie
  };
}

async function finishAcceptedSnapshotCommand(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext,
  fallbackSessionVersion: number
): Promise<{ snapshot: RoomControlSnapshot; sessionVersion: number; controlSessionCookie?: string | undefined }> {
  const snapshot = await buildRoomControlSnapshot({
    roomSlug: context.room.slug,
    config: input.config,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    now: context.now
  });
  if (!snapshot) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const controlSessionCookie = await touchAcceptedControlSession(input, context.now);
  return {
    snapshot,
    sessionVersion: snapshot.sessionVersion ?? fallbackSessionVersion,
    controlSessionCookie
  };
}

async function finishAcceptedCommand(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<{ snapshot: RoomControlSnapshot; sessionVersion: number; controlSessionCookie?: string | undefined }> {
  const playbackSession = await syncPlaybackSessionAfterQueueMutation(input, context);
  const sessionVersion = playbackSession?.version ?? context.session.version;
  const snapshot = await buildRoomControlSnapshot({
    roomSlug: context.room.slug,
    config: input.config,
    repositories: input.repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    now: context.now
  });
  if (!snapshot) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const controlSessionCookie = await touchAcceptedControlSession(input, context.now);
  return {
    snapshot,
    sessionVersion: snapshot.sessionVersion ?? sessionVersion,
    controlSessionCookie
  };
}

async function syncPlaybackSessionAfterQueueMutation(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<PlaybackSession | null> {
  const session = await input.repositories.playbackSessions.findByRoomId(context.room.id);
  if (!session) {
    return null;
  }

  const currentQueueEntry =
    session.currentQueueEntryId ? await input.repositories.queueEntries.findById(session.currentQueueEntryId) : null;
  const targetQueueEntry = currentQueueEntry ?? (await input.repositories.queueEntries.findCurrentForRoom(context.room.id));

  if (!targetQueueEntry) {
    return input.repositories.playbackSessions.bumpVersion?.(context.room.id) ?? session;
  }

  const targetPlayableMedia = await resolvePlayableMediaForQueueEntry(input.repositories, targetQueueEntry);
  if (!targetPlayableMedia) {
    return input.repositories.playbackSessions.bumpVersion?.(context.room.id) ?? session;
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  const currentIndex = effectiveQueue.findIndex((entry) => entry.id === targetQueueEntry.id);
  const nextQueueEntryId = currentIndex >= 0 ? effectiveQueue[currentIndex + 1]?.id ?? null : null;
  const shouldPreservePlaybackState = Boolean(session.currentQueueEntryId);
  if (!shouldPreservePlaybackState) {
    await markQueueEntryPlaybackState(input.repositories, {
      roomId: context.room.id,
      queueEntryId: targetQueueEntry.id,
      status: "loading",
      startedAt: context.now
    });
  }

  return input.repositories.playbackSessions.startQueueEntry({
    roomId: context.room.id,
    queueEntryId: targetQueueEntry.id,
    activeAssetId: null,
    targetVocalMode: shouldPreservePlaybackState
      ? session.targetVocalMode
      : targetVocalModeForPlayableMedia(targetPlayableMedia, targetQueueEntry),
    playerState: shouldPreservePlaybackState ? session.playerState : "loading",
    playerPositionMs: shouldPreservePlaybackState ? session.playerPositionMs : 0,
    nextQueueEntryId,
    mediaStartedAt: shouldPreservePlaybackState && session.mediaStartedAt ? new Date(session.mediaStartedAt) : null
  });
}

async function resolvePlayableMediaForQueueEntry(
  repositories: { playableMedia?: CommandRepositories["playableMedia"] },
  queueEntry: QueueEntry
): Promise<PlayableMediaAsset | null> {
  if (!repositories.playableMedia) {
    return null;
  }

  const source = sourceRefFromQueueEntry(queueEntry);
  if (source.sourceType !== "nas") {
    return null;
  }

  return repositories.playableMedia.findPlayableBySource(source);
}

function sourceRefFromQueueEntry(queueEntry: QueueEntry): MediaSourceRef {
  return (
    queueEntry.source ?? {
      sourceType: "nas",
      songId: queueEntry.songId,
      assetId: queueEntry.assetId
    }
  );
}

function isQueueablePlayableMedia(asset: PlayableMediaAsset): boolean {
  return asset.status === "ready" && asset.compatibilityStatus === "playable";
}

function preferredVocalModeForPlayableMedia(
  asset: PlayableMediaAsset,
  sessionTargetVocalMode: VocalMode | string | null
): "original" | "instrumental" | null {
  const preferred = sessionTargetVocalMode === "original" ? "original" : "instrumental";
  return hasPlayableMediaTrackForVocalMode(asset, preferred) ? preferred : null;
}

function targetVocalModeForPlayableMedia(asset: PlayableMediaAsset, queueEntry: QueueEntry): VocalMode {
  const preferred = queueEntry.playbackOptions.preferredVocalMode;
  if ((preferred === "original" || preferred === "instrumental") && hasPlayableMediaTrackForVocalMode(asset, preferred)) {
    return preferred;
  }

  if (hasPlayableMediaTrackForVocalMode(asset, "instrumental")) {
    return "instrumental";
  }

  if (hasPlayableMediaTrackForVocalMode(asset, "original")) {
    return "original";
  }

  return "instrumental";
}

function hasPlayableMediaTrackForVocalMode(asset: PlayableMediaAsset, vocalMode: "original" | "instrumental"): boolean {
  return vocalMode === "original" ? Boolean(asset.trackRoles.original) : Boolean(asset.trackRoles.instrumental);
}

async function markQueueEntryPlaybackState(
  repositories: { queueEntries: CommandRepositories["queueEntries"] },
  input: {
    roomId: string;
    queueEntryId: string;
    status: "loading" | "playing";
    startedAt: Date;
  }
): Promise<QueueEntry | null> {
  return repositories.queueEntries.markPlaybackState?.(input) ?? null;
}

/**
 * 队列里已有歌、但会话还停在 idle 时，由「入队」路径主动起播。
 * 用于在线补歌等不经过 control command 的入队方式。
 */
export async function startPlaybackIfIdle(input: {
  config: ApiConfig;
  room: Room;
  repositories: ControlSnapshotRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
  now?: Date;
}): Promise<RoomControlSnapshot | null> {
  const repositories = input.repositories;
  const session = await repositories.playbackSessions.findByRoomId(input.room.id);
  if (!session || session.currentQueueEntryId) {
    return null;
  }

  const targetQueueEntry = await repositories.queueEntries.findCurrentForRoom(input.room.id);
  if (!targetQueueEntry) {
    return null;
  }

  const targetPlayableMedia = await resolvePlayableMediaForQueueEntry(repositories, targetQueueEntry);
  if (!targetPlayableMedia) {
    return null;
  }

  const now = input.now ?? new Date();
  await markQueueEntryPlaybackState(repositories, {
    roomId: input.room.id,
    queueEntryId: targetQueueEntry.id,
    status: "loading",
    startedAt: now
  });

  const effectiveQueue = await repositories.queueEntries.listEffectiveQueue(input.room.id);
  const currentIndex = effectiveQueue.findIndex((entry) => entry.id === targetQueueEntry.id);

  await repositories.playbackSessions.startQueueEntry({
    roomId: input.room.id,
    queueEntryId: targetQueueEntry.id,
    activeAssetId: null,
    targetVocalMode: targetVocalModeForPlayableMedia(targetPlayableMedia, targetQueueEntry),
    playerState: "loading",
    playerPositionMs: 0,
    nextQueueEntryId: currentIndex >= 0 ? effectiveQueue[currentIndex + 1]?.id ?? null : null,
    mediaStartedAt: null
  });

  return buildRoomControlSnapshot({
    roomSlug: input.room.slug,
    config: input.config,
    repositories,
    ...(input.mediaGateway ? { mediaGateway: input.mediaGateway } : {}),
    now
  });
}

async function touchAcceptedControlSession(
  input: ExecuteRoomCommandInput,
  now: Date
): Promise<string | undefined> {
  const touched = await touchControlSession({
    session: toControlSession(input.controlSession),
    controlSessions: input.repositories.controlSessions,
    now
  });
  return touched ? serializeControlSessionCookie({ session: { id: touched.id } }) : undefined;
}

async function recordCommandResult(
  repositories: CommandRepositories,
  input: {
    commandId: string;
    roomId: string;
    controlSessionId: string;
    sessionVersion: number;
    type: ControlCommandType;
    payload: Record<string, unknown>;
    resultStatus: "accepted" | "duplicate" | "conflict" | "rejected";
    resultPayload?: Record<string, unknown>;
  }
): Promise<void> {
  await repositories.controlCommands.insertCommandAttempt({
    commandId: input.commandId,
    roomId: input.roomId,
    controlSessionId: input.controlSessionId,
    sessionVersion: input.sessionVersion,
    type: input.type,
    payload: input.payload,
    resultStatus: input.resultStatus,
    resultPayload: input.resultPayload ?? {}
  });
}

function rejected(commandId: string, sessionVersion: number, code: string, message?: string): RejectedCommandResult {
  return {
    status: "rejected",
    commandId,
    sessionVersion,
    code,
    message
  };
}

function normalizeVolumePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const volumePercent = Math.trunc(value);
  return volumePercent >= 0 && volumePercent <= 100 ? volumePercent : null;
}

function toControlSession(session: ControlSessionInfo): ControlSession {
  const now = session.lastSeenAt;
  return {
    id: session.id,
    roomId: session.roomId,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function moveEntryToFront(entries: readonly QueueEntry[], queueEntryId: string): QueueEntry[] {
  const index = entries.findIndex((entry) => entry.id === queueEntryId);
  if (index <= 0) {
    return [...entries];
  }

  const reordered = [...entries];
  const [target] = reordered.splice(index, 1);
  if (!target) {
    return [...entries];
  }

  reordered.unshift(target);
  return reordered;
}
