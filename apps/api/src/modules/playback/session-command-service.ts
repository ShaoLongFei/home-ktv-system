import type { AssetGateway } from "../assets/asset-gateway.js";
import type { ApiConfig } from "../../config.js";
import type {
  ControlCommandType,
  ControlSession,
  PlaybackSession,
  QueueEntry,
  Room
} from "@home-ktv/domain";
import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";
import { SESSION_VERSION_CONFLICT, promoteAfterCurrent } from "@home-ktv/session-engine";
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
  repositories: CommandRepositories;
  assetGateway: AssetGateway;
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
  assetGateway: AssetGateway;
  config: ApiConfig;
  now?: Date;
}

export interface AdvanceToNextInput {
  room: Room;
  repositories: CommandRepositories;
  assetGateway: AssetGateway;
  config: ApiConfig;
  completionStatus: "played" | "skipped";
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
  session: { currentQueueEntryId: string | null; nextQueueEntryId: string | null; version: number; playerPositionMs: number; targetVocalMode: string; activeAssetId: string | null; playerState: string };
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
      assetGateway: input.assetGateway,
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
}> {
  const now = input.now ?? new Date();
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return { status: "rejected", snapshot: null, sessionVersion: 0 };
  }

  await input.playbackEvents.append({
    roomId: room.id,
    queueEntryId: input.queueEntryId,
    eventType: "ended",
    eventPayload: {
      deviceId: input.deviceId,
      sessionVersion: input.sessionVersion,
      assetId: input.assetId,
      playbackPositionMs: input.playbackPositionMs,
      emittedAt: now.toISOString()
    }
  });

  const result = await advanceToNext({
    room,
    repositories: input.repositories,
    assetGateway: input.assetGateway,
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
      assetGateway: input.assetGateway,
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
      assetGateway: input.assetGateway,
      now
    });
    return { snapshot, sessionVersion: idleSession?.version ?? snapshot?.sessionVersion ?? session.version };
  }

  const nextAsset = await input.repositories.assets.findById(nextEntry.assetId);
  await markQueueEntryPlaybackState(input.repositories, {
    roomId: input.room.id,
    queueEntryId: nextEntry.id,
    status: "loading",
    startedAt: now
  });
  const updatedSession = await input.repositories.playbackSessions.startQueueEntry({
    roomId: input.room.id,
    queueEntryId: nextEntry.id,
    activeAssetId: nextEntry.assetId,
    playerState: "loading",
    playerPositionMs: 0,
    nextQueueEntryId: currentIndex >= 0 ? effectiveQueue[currentIndex + 2]?.id ?? null : null,
    mediaStartedAt: null,
    ...(nextAsset ? { targetVocalMode: nextAsset.vocalMode } : {})
  });

  const snapshot = await buildRoomControlSnapshot({
    roomSlug: input.room.slug,
    config: input.config,
    repositories: input.repositories,
    assetGateway: input.assetGateway,
    now
  });

  return {
    snapshot,
    sessionVersion: updatedSession?.version ?? snapshot?.sessionVersion ?? session.version
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
    case "skip-current":
      if (input.payload.confirmSkip !== true) {
        return rejected(input.commandId, input.sessionVersion, "SKIP_CONFIRMATION_REQUIRED");
      }
      return runAdvanceCommand(input, context, "skipped");
    case "switch-vocal-mode":
      return switchVocalMode(input, context);
    case "player-ended":
      return rejected(input.commandId, input.sessionVersion, "PLAYER_ENDED_IS_TELEMETRY_ONLY");
  }
}

async function addQueueEntry(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const songId = typeof input.payload.songId === "string" ? input.payload.songId : "";
  if (!songId) {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const song = await input.repositories.songs.findById(songId);
  if (!song || song.status !== "ready" || !song.defaultAssetId) {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const defaultAsset = await input.repositories.assets.findById(song.defaultAssetId);
  if (!defaultAsset || defaultAsset.songId !== song.id || defaultAsset.status !== "ready") {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const counterparts = await input.repositories.assets.findVerifiedSwitchCounterparts(defaultAsset);
  if (counterparts.length === 0) {
    return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  const queuePosition = effectiveQueue.at(-1)?.queuePosition ?? 0;
  await input.repositories.queueEntries.append({
    roomId: context.room.id,
    songId: song.id,
    assetId: defaultAsset.id,
    requestedBy: input.controlSession.deviceId,
    queuePosition: queuePosition + 1
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

async function switchVocalMode(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext
): Promise<CommandExecutionResult> {
  const switchTarget = await buildSwitchTarget({
    roomSlug: context.room.slug,
    repositories: input.repositories,
    assetGateway: input.assetGateway
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

async function runAdvanceCommand(
  input: ExecuteRoomCommandInput,
  context: QueueMutationContext,
  completionStatus: "played" | "skipped"
): Promise<CommandExecutionResult> {
  const result = await advanceToNext({
    room: context.room,
    repositories: input.repositories,
    assetGateway: input.assetGateway,
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
    assetGateway: input.assetGateway,
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

  const targetAsset = await input.repositories.assets.findById(targetQueueEntry.assetId);
  if (!targetAsset) {
    return input.repositories.playbackSessions.bumpVersion?.(context.room.id) ?? session;
  }

  const effectiveQueue = await input.repositories.queueEntries.listEffectiveQueue(context.room.id);
  const currentIndex = effectiveQueue.findIndex((entry) => entry.id === targetQueueEntry.id);
  const nextQueueEntryId = currentIndex >= 0 ? effectiveQueue[currentIndex + 1]?.id ?? null : null;
  const shouldPreservePlaybackState = Boolean(session.currentQueueEntryId && session.activeAssetId);
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
    activeAssetId: targetAsset.id,
    targetVocalMode: shouldPreservePlaybackState ? session.targetVocalMode : targetAsset.vocalMode,
    playerState: shouldPreservePlaybackState ? session.playerState : "loading",
    playerPositionMs: shouldPreservePlaybackState ? session.playerPositionMs : 0,
    nextQueueEntryId,
    mediaStartedAt: shouldPreservePlaybackState && session.mediaStartedAt ? new Date(session.mediaStartedAt) : null
  });
}

async function markQueueEntryPlaybackState(
  repositories: CommandRepositories,
  input: {
    roomId: string;
    queueEntryId: string;
    status: "loading" | "playing";
    startedAt: Date;
  }
): Promise<QueueEntry | null> {
  return repositories.queueEntries.markPlaybackState?.(input) ?? null;
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
