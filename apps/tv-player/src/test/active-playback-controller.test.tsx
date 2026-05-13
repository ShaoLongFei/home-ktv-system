import type { PlaybackTarget, RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { ActivePlaybackController } from "../runtime/active-playback-controller.js";
import {
  DualVideoPool,
  restoreAudioTracks,
  selectAudioTrack,
  type KtvVideoElement,
  type SelectableAudioTrack
} from "../runtime/video-pool.js";

describe("active playback controller", () => {
  it("selects an audio track by id and restores the previous enabled track", () => {
    const activeVideo = new FakeVideo({
      audioTracks: [
        { id: "0x1100", label: "Original", enabled: true },
        { id: "0x1101", label: "Instrumental", enabled: false }
      ]
    });

    const result = selectAudioTrack(activeVideo, { index: 1, id: "0x1101", label: "Instrumental" });

    expect(result.status).toBe("selected");
    expect(activeVideo.audioTracks?.[0]?.enabled).toBe(false);
    expect(activeVideo.audioTracks?.[1]?.enabled).toBe(true);
    if (result.status !== "selected") {
      throw new Error("expected selected audio track");
    }

    restoreAudioTracks(activeVideo, result.previousEnabledIndexes);

    expect(activeVideo.audioTracks?.[0]?.enabled).toBe(true);
    expect(activeVideo.audioTracks?.[1]?.enabled).toBe(false);
  });

  it("selects an audio track by index when id does not match", () => {
    const activeVideo = new FakeVideo({
      audioTracks: [
        { id: "original-id", label: "Original", enabled: true },
        { id: "instrumental-id", label: "Instrumental", enabled: false }
      ]
    });

    const result = selectAudioTrack(activeVideo, { index: 1, id: "missing-id", label: "Instrumental" });

    expect(result.status).toBe("selected");
    expect(activeVideo.audioTracks?.[0]?.enabled).toBe(false);
    expect(activeVideo.audioTracks?.[1]?.enabled).toBe(true);
  });

  it("primes and starts the current playback target", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot());

    expect(result.status).toBe("playing");
    expect(pool.activeTarget?.assetId).toBe("asset-original");
    expect(activeVideo.src).toBe("http://ktv.local/media/asset-original");
    expect(activeVideo.currentTime).toBe(12.345);
    expect(activeVideo.playCalls).toBe(1);
  });

  it("applies selectedTrackRef before starting real MV playback", async () => {
    const activeVideo = new FakeVideo({
      audioTracks: [
        { id: "0x1100", label: "Original", enabled: true },
        { id: "0x1101", label: "Instrumental", enabled: false }
      ]
    });
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(
      snapshot({
        currentTarget: realMvPlaybackTarget()
      })
    );

    expect(result.status).toBe("playing");
    expect(activeVideo.audioTracks?.[0]?.enabled).toBe(false);
    expect(activeVideo.audioTracks?.[1]?.enabled).toBe(true);
    expect(activeVideo.playCalls).toBe(1);
  });

  it("blocks required real MV track selection when audioTracks are unsupported", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(
      snapshot({
        currentTarget: realMvPlaybackTarget()
      })
    );

    expect(result).toMatchObject({
      status: "blocked",
      message: "current device does not support audio-track switching"
    });
    expect(activeVideo.playCalls).toBe(0);
  });

  it("starts the first playback muted and restores audible playback after it begins", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot());

    expect(result.status).toBe("playing");
    expect(activeVideo.mutedAtPlay).toEqual([true]);
    expect(activeVideo.muted).toBe(false);
  });

  it("clears the active target when the room becomes idle", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());
    pool.primeActive(playbackTarget());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(idleSnapshot());

    expect(result.status).toBe("disabled");
    expect(pool.activeTarget).toBeNull();
    expect(activeVideo.paused).toBe(true);
  });
});

class FakeVideo implements KtvVideoElement {
  audioTracks?: { readonly length: number; [index: number]: SelectableAudioTrack | undefined };
  currentTime = 0;
  duration = 180;
  hidden = false;
  muted = false;
  mutedAtPlay: boolean[] = [];
  paused = true;
  playCalls = 0;
  readyState = 4;
  src = "";

  constructor(input: { audioTracks?: SelectableAudioTrack[] } = {}) {
    if (input.audioTracks) {
      this.audioTracks = Object.assign(input.audioTracks, { length: input.audioTracks.length });
    }
  }

  load(): void {}

  pause(): void {
    this.paused = true;
  }

  async play(): Promise<void> {
    this.playCalls += 1;
    this.mutedAtPlay.push(this.muted);
    this.paused = false;
  }

  addEventListener(_type: string, listener: () => void): void {
    listener();
  }

  removeEventListener(): void {}

  requestVideoFrameCallback(callback: (now: number, metadata: unknown) => void): number {
    callback(0, {});
    return 1;
  }
}

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 4,
    state: "playing",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: playbackTarget(),
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}

function idleSnapshot(): RoomSnapshot {
  return {
    ...snapshot(),
    state: "idle",
    currentTarget: null,
    switchTarget: null,
    targetVocalMode: null
  };
}

function playbackTarget(): PlaybackTarget {
  return {
    roomId: "living-room",
    sessionVersion: 4,
    queueEntryId: "queue-current",
    assetId: "asset-original",
    currentQueueEntryPreview: {
      queueEntryId: "queue-current",
      songTitle: "七里香",
      artistName: "周杰伦"
    },
    playbackUrl: "http://ktv.local/media/asset-original",
    resumePositionMs: 12345,
    vocalMode: "original",
    switchFamily: "family-main",
    nextQueueEntryPreview: null
  };
}

function realMvPlaybackTarget(): PlaybackTarget {
  return {
    ...playbackTarget(),
    assetId: "asset-real-mv",
    playbackUrl: "http://ktv.local/media/asset-real-mv",
    vocalMode: "instrumental",
    switchFamily: null,
    playbackProfile: {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac", "aac"],
      requiresAudioTrackSelection: true
    },
    selectedTrackRef: { index: 1, id: "0x1101", label: "Instrumental" }
  };
}
