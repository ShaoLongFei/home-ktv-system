import { describe, expect, it } from "vitest";
import type { QueueEntry, QueueEntryStatus } from "@home-ktv/domain";
import {
  controllerCommandNames,
  protocolMessageNames,
  roomEventNames
} from "@home-ktv/protocol";
import {
  SESSION_VERSION_CONFLICT,
  effectiveQueue,
  promoteAfterCurrent
} from "@home-ktv/session-engine";
import { schemaSql, type QueueEntryRow } from "../db/schema.js";
import { InMemoryQueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";

describe("session engine contracts", () => {
  it("QueueEntryStatus includes removed and schema/protocol names are exported", () => {
    const status: QueueEntryStatus = "removed";
    const row: QueueEntryRow = {
      id: "queue-entry-1",
      room_id: "living-room",
      song_id: "song-1",
      asset_id: "asset-1",
      requested_by: "phone-a",
      queue_position: 1,
      status: "removed",
      priority: 0,
      playback_options: {},
      requested_at: new Date("2026-05-01T10:00:00.000Z"),
      started_at: null,
      ended_at: null,
      removed_at: new Date("2026-05-01T10:01:00.000Z"),
      removed_by_control_session_id: "control-session-1",
      undo_expires_at: new Date("2026-05-01T10:01:10.000Z")
    };

    expect(status).toBe("removed");
    expect(row.status).toBe("removed");
    expect(schemaSql).toContain("removed");
    expect(controllerCommandNames.addQueueEntry).toBe("controller.command.add_queue_entry");
    expect(controllerCommandNames.deleteQueueEntry).toBe("controller.command.delete_queue_entry");
    expect(controllerCommandNames.undoDeleteQueueEntry).toBe(
      "controller.command.undo_delete_queue_entry"
    );
    expect(controllerCommandNames.promoteQueueEntry).toBe("controller.command.promote_queue_entry");
    expect(controllerCommandNames.skipCurrent).toBe("controller.command.skip_current");
    expect(controllerCommandNames.switchVocalMode).toBe("controller.command.switch_vocal_mode");
    expect(roomEventNames.controlSnapshotUpdated).toBe("room.control.snapshot.updated");
    expect(protocolMessageNames["controller.command.add_queue_entry"]).toBe(
      "controller.command.add_queue_entry"
    );
  });

  it("promoteAfterCurrent places the selected queued entry after the current entry", () => {
    const queue: QueueEntry[] = [
      queueEntry("current", 1, "playing"),
      queueEntry("one", 2, "queued"),
      queueEntry("two", 3, "queued"),
      queueEntry("removed", 4, "removed")
    ];

    const promoted = promoteAfterCurrent(queue, "two", "current");
    expect(promoted.map((entry) => entry.id)).toEqual(["current", "two", "one", "removed"]);
    expect(effectiveQueue(promoted).map((entry) => entry.id)).toEqual(["current", "two", "one"]);
    expect(SESSION_VERSION_CONFLICT).toBe("SESSION_VERSION_CONFLICT");
  });

  it("queue repository methods expose effective and undoable removed entries", async () => {
    const repository = new InMemoryQueueEntryRepository([
      queueEntry("current", 1, "playing"),
      queueEntry("one", 2, "queued"),
      queueEntry("removed-late", 3, "removed", "2026-05-01T10:02:00.000Z", "2026-05-01T10:03:30.000Z"),
      queueEntry("removed-early", 4, "removed", "2026-05-01T10:01:00.000Z", "2026-05-01T10:02:30.000Z")
    ]);

    expect((await repository.listEffectiveQueue("living-room")).map((entry) => entry.id)).toEqual([
      "current",
      "one"
    ]);
    expect((await repository.listUndoableRemoved("living-room", new Date("2026-05-01T10:01:30.000Z"))).map(
      (entry) => entry.id
    )).toEqual(["removed-late", "removed-early"]);
    expect((await repository.findCurrentForRoom("living-room"))?.id).toBe("current");
  });
});

function queueEntry(
  id: string,
  queuePosition: number,
  status: QueueEntryStatus,
  removedAt: string | null = null,
  undoExpiresAt: string | null = removedAt ? "2026-05-01T10:01:10.000Z" : null
): QueueEntry {
  return {
    id,
    roomId: "living-room",
    songId: `song-${id}`,
    assetId: `asset-${id}`,
    requestedBy: "phone-a",
    queuePosition,
    status,
    priority: 0,
    playbackOptions: {
      preferredVocalMode: null,
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: "2026-05-01T10:00:00.000Z",
    startedAt: status === "playing" ? "2026-05-01T10:00:30.000Z" : null,
    endedAt: null,
    removedAt,
    removedByControlSessionId: removedAt ? "control-session-1" : null,
    undoExpiresAt
  };
}
