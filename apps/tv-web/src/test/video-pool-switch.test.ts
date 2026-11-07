import { describe, expect, it } from "vitest";
import type { PlaybackTarget, SwitchTarget } from "@home-ktv/player-contracts";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

class FakeVideo implements KtvVideoElement {
  currentTime = 0;
  duration = 100;
  hidden: boolean | "until-found" = true;
  muted = false;
  paused = true;
  readyState = 4;
  src = "";
  volume = 0.5;

  addEventListener(): void {}
  removeEventListener(): void {}
  load(): void {}
  pause(): void {
    this.paused = true;
  }
  async play(): Promise<void> {
    this.paused = false;
  }
}

function target(playbackUrl: string): PlaybackTarget {
  return {
    roomId: "living-room",
    sessionVersion: 1,
    queueEntryId: "queue-1",
    sourceType: "nas",
    songId: "song-1",
    assetId: "asset-1",
    currentQueueEntryPreview: {
      queueEntryId: "queue-1",
      songTitle: "孤勇者",
      artistName: "腾格尔",
      requestedByName: null,
      requestedByUserPhone: null
    },
    playbackUrl,
    resumePositionMs: 0,
    vocalMode: "instrumental",
    switchFamily: null,
    playbackProfile: { kind: "single_file_audio_tracks", container: "mkv", videoCodec: "h264", audioCodecs: ["vorbis"], requiresAudioTrackSelection: true },
    selectedTrackRef: null,
    nextQueueEntryPreview: null
  } as PlaybackTarget;
}

function switchTarget(playbackUrl: string): SwitchTarget {
  return {
    roomId: "living-room",
    sessionVersion: 2,
    queueEntryId: "queue-1",
    switchKind: "asset",
    sourceType: "nas",
    fromAssetId: "asset-1",
    toAssetId: "asset-1",
    playbackUrl,
    switchFamily: "real-mv-variant",
    vocalMode: "original",
    resumePositionMs: 0,
    rollbackAssetId: "asset-1",
    playbackProfile: { kind: "single_file_audio_tracks", container: "mkv", videoCodec: "h264", audioCodecs: ["vorbis"], requiresAudioTrackSelection: true },
    selectedTrackRef: null
  } as SwitchTarget;
}

describe("DualVideoPool switch overlap", () => {
  it("keeps the standby silent until commit, then unmutes and aligns position", () => {
    const active = new FakeVideo();
    const standby = new FakeVideo();
    const pool = new DualVideoPool(active, standby);
    pool.primeActive(target("/media/nas/a"));
    active.currentTime = 42;
    active.volume = 0.8;

    pool.prepareStandby(switchTarget("/media/nas/a?variant=instrumental"));
    expect(standby.muted).toBe(true);

    standby.currentTime = 40.5; // 预加载慢，停在旧位置
    pool.commitStandby();

    expect(active.paused).toBe(true); // 旧视频必须停
    expect(standby.muted).toBe(false);
    expect(standby.volume).toBe(0.8);
    expect(standby.currentTime).toBeCloseTo(42, 1);
    expect(pool.activeVideo).toBe(standby);
    expect(pool.standbyVideo).toBe(active);
  });

  it("stops any leftover standby when priming the active video", () => {
    const active = new FakeVideo();
    const standby = new FakeVideo();
    const pool = new DualVideoPool(active, standby);

    pool.prepareStandby(switchTarget("/media/nas/a?variant=instrumental"));
    standby.paused = false;

    pool.primeActive(target("/media/nas/a"));

    expect(standby.paused).toBe(true);
    expect(standby.src).toBe("");
  });
});
