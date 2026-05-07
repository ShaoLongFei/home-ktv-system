import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlayerState, Room, RoomId } from "@home-ktv/domain";
import type { PlayerConflictState, RoomSnapshot } from "@home-ktv/player-contracts";
import type { ApiConfig } from "../config.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { buildPlaybackTarget } from "../modules/playback/build-playback-target.js";
import { buildSwitchTarget } from "../modules/playback/build-switch-target.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import { getOrCreatePairingInfo } from "../modules/rooms/pairing-token-service.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";

export interface RoomSnapshotRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
}

export interface BuildRoomSnapshotInput {
  roomSlug: string;
  config: ApiConfig;
  repositories: RoomSnapshotRepositories;
  assetGateway: AssetGateway;
  conflict?: PlayerConflictState | null;
  notice?: RoomSnapshot["notice"];
  now?: Date;
}

export async function buildRoomSnapshot(input: BuildRoomSnapshotInput): Promise<RoomSnapshot | null> {
  const now = input.now ?? new Date();
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const pairing = await getOrCreatePairingInfo({
    room,
    publicBaseUrl: input.config.publicBaseUrl,
    repository: input.repositories.pairingTokens,
    now,
    ...(input.config.controllerBaseUrl ? { controllerBaseUrl: input.config.controllerBaseUrl } : {})
  });

  if (input.conflict) {
    return {
      type: "room.snapshot",
      roomId: room.id,
      roomSlug: room.slug,
      sessionVersion: 0,
      state: "conflict",
      pairing,
      currentTarget: null,
      switchTarget: null,
      targetVocalMode: null,
      conflict: input.conflict,
      notice: null,
      generatedAt: now.toISOString()
    };
  }

  const [session, currentTarget] = await Promise.all([
    input.repositories.playbackSessions.findByRoomId(room.id),
    buildPlaybackTarget({
      roomSlug: room.slug,
      repositories: input.repositories,
      assetGateway: input.assetGateway
    })
  ]);
  const switchTarget = currentTarget
    ? await buildSwitchTarget({
        roomSlug: room.slug,
        repositories: input.repositories,
        assetGateway: input.assetGateway
      })
    : null;

  return {
    type: "room.snapshot",
    roomId: room.id,
    roomSlug: room.slug,
    sessionVersion: currentTarget?.sessionVersion ?? session?.version ?? 0,
    state: snapshotState(room, session?.playerState ?? "idle", Boolean(currentTarget)),
    pairing,
    currentTarget,
    switchTarget,
    targetVocalMode: session?.targetVocalMode ?? currentTarget?.vocalMode ?? null,
    conflict: null,
    notice: input.notice ?? noticeFromPlayerState(session?.playerState ?? "idle"),
    generatedAt: now.toISOString()
  };
}

export async function registerRoomSnapshotRoutes(
  server: FastifyInstance,
  dependencies: Omit<BuildRoomSnapshotInput, "roomSlug">
): Promise<void> {
  server.get("/rooms/:roomSlug/snapshot", async (request: FastifyRequest<{ Params: { roomSlug: string } }>, reply) => {
    await sendSnapshot(reply, {
      ...dependencies,
      roomSlug: request.params.roomSlug
    });
  });
}

async function sendSnapshot(reply: FastifyReply, input: BuildRoomSnapshotInput): Promise<void> {
  const snapshot = await buildRoomSnapshot(input);
  if (!snapshot) {
    await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
    return;
  }

  await reply.send(snapshot);
}

function snapshotState(room: Room, playerState: PlayerState, hasTarget: boolean): RoomSnapshot["state"] {
  if (room.status !== "active") {
    return "error";
  }

  if (!hasTarget) {
    return "idle";
  }

  switch (playerState) {
    case "loading":
    case "preparing":
      return "loading";
    case "recovering":
      return "recovering";
    case "error":
      return "error";
    case "playing":
    case "paused":
      return "playing";
    case "idle":
      return "idle";
  }
}

function noticeFromPlayerState(playerState: PlayerState): RoomSnapshot["notice"] {
  if (playerState === "loading" || playerState === "preparing") {
    return {
      kind: "loading",
      message: "Loading the next song."
    };
  }

  if (playerState === "recovering") {
    return {
      kind: "recovering",
      message: "Reconnecting playback and restoring the song."
    };
  }

  return null;
}
