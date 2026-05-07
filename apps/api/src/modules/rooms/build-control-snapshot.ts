import type { AssetGateway } from "../assets/asset-gateway.js";
import type { ApiConfig } from "../../config.js";
import type { RoomRepository } from "./repositories/room-repository.js";
import type { PlaybackSessionRepository } from "../playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../playback/repositories/queue-entry-repository.js";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { SongRepository } from "../catalog/repositories/song-repository.js";
import type { RoomPairingTokenRepository } from "./repositories/pairing-token-repository.js";
import type { ControlSessionRepository } from "../controller/repositories/control-session-repository.js";
import type { PlayerDeviceSessionRepository } from "../player/register-player.js";
import { ACTIVE_TV_PLAYER_WINDOW_MS } from "../player/conflict-service.js";
import { buildRoomSnapshot } from "../../routes/room-snapshots.js";
import type { OnlineCandidateTask, OnlineCandidateTaskState, PlaybackEvent, QueueEntry, RoomId, Song } from "@home-ktv/domain";
import type { PlaybackNotice, RoomControlSnapshot, RoomQueueEntryPreview } from "@home-ktv/player-contracts";
import type { CandidateTaskService } from "../online/candidate-task-service.js";

interface RecentPlaybackEventRepository {
  append?: unknown;
  listRecentByRoom?: (roomId: RoomId, limit?: number) => Promise<PlaybackEvent[]>;
}

export interface RoomRecentPlaybackEvent {
  id: string;
  roomId: string;
  queueEntryId: string | null;
  eventType: string;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

export interface RoomOnlineTaskSummaryRow {
  taskId: string;
  roomId: string;
  provider: string;
  providerCandidateId: string;
  title: string;
  artistName: string;
  sourceLabel: string;
  durationMs: number | null;
  candidateType: string;
  reliabilityLabel: string;
  riskLabel: string;
  status: OnlineCandidateTaskState;
  failureReason: string | null;
  recentEvent: Record<string, unknown>;
  recentEventAt: string | null;
  readyAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomOnlineTaskSummary {
  counts: Record<string, number>;
  tasks: RoomOnlineTaskSummaryRow[];
}

export interface RoomControlRecoverySnapshot extends RoomControlSnapshot {
  recentEvents: RoomRecentPlaybackEvent[];
  onlineTasks: RoomOnlineTaskSummary;
}

export interface ControlSnapshotRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
  controlSessions: ControlSessionRepository;
  deviceSessions: PlayerDeviceSessionRepository;
  playbackEvents?: RecentPlaybackEventRepository | undefined;
  onlineTasks?: Pick<CandidateTaskService, "listActiveForRoom"> | undefined;
}

export interface BuildRoomControlSnapshotInput {
  roomSlug: string;
  config: ApiConfig;
  repositories: ControlSnapshotRepositories;
  assetGateway: AssetGateway;
  notice?: PlaybackNotice | null;
  now?: Date;
}

export async function buildRoomControlSnapshot(input: BuildRoomControlSnapshotInput): Promise<RoomControlRecoverySnapshot | null> {
  const now = input.now ?? new Date();
  const baseSnapshotInput = {
    roomSlug: input.roomSlug,
    config: input.config,
    repositories: input.repositories,
    assetGateway: input.assetGateway,
    now
  };
  const baseSnapshot = await buildRoomSnapshot({
    ...baseSnapshotInput,
    ...(input.notice !== undefined ? { notice: input.notice } : {})
  });
  if (!baseSnapshot) {
    return null;
  }

  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const [session, queue, removedQueue, recentEvents, onlineTasks] = await Promise.all([
    input.repositories.playbackSessions.findByRoomId(room.id),
    input.repositories.queueEntries.listEffectiveQueue(room.id),
    input.repositories.queueEntries.listUndoableRemoved(room.id, now),
    listRecentPlaybackEvents(input.repositories, room.id),
    listOnlineTasks(input.repositories, room.id)
  ]);
  const activeTvPlayer = await input.repositories.deviceSessions.findActiveTvPlayer(
    room.id,
    new Date(now.getTime() - ACTIVE_TV_PLAYER_WINDOW_MS)
  );

  const onlineCount = await input.repositories.controlSessions.countActiveByRoom(
    room.id,
    new Date(now.getTime() - 60 * 1000)
  );
  const queuePreview = await buildQueuePreview({
    currentQueueEntryId: session?.currentQueueEntryId ?? null,
    queue: [...queue, ...removedQueue],
    repositories: input.repositories,
    removedQueueIds: new Set(removedQueue.map((entry) => entry.id))
  });
  return {
    type: "room.control.snapshot",
    roomId: baseSnapshot.roomId,
    roomSlug: baseSnapshot.roomSlug,
    sessionVersion: session?.version ?? baseSnapshot.sessionVersion,
    state: baseSnapshot.state,
    pairing: baseSnapshot.pairing,
    tvPresence: activeTvPlayer
      ? {
          online: true,
          deviceName: activeTvPlayer.deviceName,
          lastSeenAt: activeTvPlayer.lastSeenAt,
          conflict: null
        }
      : { online: false, deviceName: null, lastSeenAt: null, conflict: null },
    controllers: { onlineCount },
    currentTarget: baseSnapshot.currentTarget,
    switchTarget: baseSnapshot.switchTarget,
    targetVocalMode: baseSnapshot.targetVocalMode ?? null,
    queue: queuePreview,
    recentEvents: recentEvents.map(playbackEventPreview),
    onlineTasks: buildOnlineTaskSummary(onlineTasks),
    notice: baseSnapshot.notice,
    generatedAt: baseSnapshot.generatedAt
  };
}

export function buildEmptyOnlineTaskSummary(): RoomOnlineTaskSummary {
  return { counts: { total: 0 }, tasks: [] };
}

async function buildQueuePreview(input: {
  currentQueueEntryId: string | null;
  queue: readonly QueueEntry[];
  repositories: ControlSnapshotRepositories;
  removedQueueIds: Set<string>;
}): Promise<RoomQueueEntryPreview[]> {
  const previews: RoomQueueEntryPreview[] = [];

  for (const queueEntry of input.queue) {
    const song = await input.repositories.songs.findById(queueEntry.songId);
    if (!song) {
      continue;
    }

    previews.push(queueEntryPreview(queueEntry, song, input.currentQueueEntryId, input.removedQueueIds.has(queueEntry.id)));
  }

  return previews;
}

function queueEntryPreview(
  queueEntry: QueueEntry,
  song: Song,
  currentQueueEntryId: string | null,
  removed: boolean
): RoomQueueEntryPreview {
  const isCurrent = currentQueueEntryId === queueEntry.id;
  const canDelete = !removed && !isCurrent && queueEntry.status === "queued";
  const canPromote = !removed && !isCurrent && (queueEntry.status === "queued" || queueEntry.status === "preparing" || queueEntry.status === "loading");

  return {
    queueEntryId: queueEntry.id,
    songId: queueEntry.songId,
    assetId: queueEntry.assetId,
    songTitle: song.title,
    artistName: song.artistName,
    requestedBy: queueEntry.requestedBy,
    queuePosition: queueEntry.queuePosition,
    status: removed ? "removed" : queueEntry.status,
    canPromote: removed ? false : canPromote,
    canDelete: removed ? false : canDelete,
    undoExpiresAt: removed ? queueEntry.undoExpiresAt : null
  };
}

function playbackEventPreview(event: PlaybackEvent): RoomRecentPlaybackEvent {
  return {
    id: event.id,
    roomId: event.roomId,
    queueEntryId: event.queueEntryId,
    eventType: event.eventType,
    eventPayload: event.eventPayload,
    createdAt: event.createdAt
  };
}

function listRecentPlaybackEvents(
  repositories: ControlSnapshotRepositories,
  roomId: string
): Promise<PlaybackEvent[]> {
  if (typeof repositories.playbackEvents?.listRecentByRoom !== "function") {
    return Promise.resolve([]);
  }
  return repositories.playbackEvents.listRecentByRoom(roomId, 20);
}

function listOnlineTasks(
  repositories: ControlSnapshotRepositories,
  roomId: string
): Promise<OnlineCandidateTask[]> {
  if (typeof repositories.onlineTasks?.listActiveForRoom !== "function") {
    return Promise.resolve([]);
  }
  return repositories.onlineTasks.listActiveForRoom(roomId);
}

function buildOnlineTaskSummary(tasks: OnlineCandidateTask[]): RoomOnlineTaskSummary {
  const counts: Record<string, number> = { total: tasks.length };
  const rows = tasks.map((task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return onlineTaskSummaryRow(task);
  });

  return { counts, tasks: rows };
}

function onlineTaskSummaryRow(task: OnlineCandidateTask): RoomOnlineTaskSummaryRow {
  return {
    taskId: task.id,
    roomId: task.roomId,
    provider: task.provider,
    providerCandidateId: task.providerCandidateId,
    title: task.title,
    artistName: task.artistName,
    sourceLabel: task.sourceLabel,
    durationMs: task.durationMs,
    candidateType: task.candidateType,
    reliabilityLabel: task.reliabilityLabel,
    riskLabel: task.riskLabel,
    status: task.status,
    failureReason: task.failureReason,
    recentEvent: task.recentEvent,
    recentEventAt: readRecentEventAt(task),
    readyAssetId: task.readyAssetId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function readRecentEventAt(task: OnlineCandidateTask): string | null {
  const explicitAt = task.recentEvent.at;
  if (typeof explicitAt === "string") {
    return explicitAt;
  }
  const statusAt = {
    discovered: task.createdAt,
    selected: task.selectedAt,
    review_required: task.reviewRequiredAt,
    fetching: task.fetchingAt,
    fetched: task.fetchedAt,
    ready: task.readyAt,
    failed: task.failedAt,
    stale: task.staleAt,
    promoted: task.promotedAt,
    purged: task.purgedAt
  } satisfies Record<OnlineCandidateTaskState, string | null>;
  return statusAt[task.status] ?? task.updatedAt;
}
