import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "../../../../packages/domain/src/index.ts",
  "../../../../packages/player-contracts/src/index.ts",
  "../../../../apps/api/src/modules/playback/build-playback-target.ts",
  "../../../../apps/api/src/modules/playback/build-switch-target.ts",
  "../../../../apps/tv-player/src/runtime/player-client.ts",
  "../../../../apps/tv-player/src/runtime/video-pool.ts"
] as const;

describe("phase 16 boundary guards", () => {
  it("keeps shared contracts and TV runtime free of Android-only vocabulary", async () => {
    const sources = await Promise.all(sourceFiles.map((sourceFile) => readFile(new URL(sourceFile, import.meta.url), "utf8")));
    const bundle = sources.join("\n");
    const lower = bundle.toLowerCase();

    for (const forbidden of ["android", "media3", "exo", "native android tv", "adapter seam", "autoAdmit"]) {
      expect(lower).not.toContain(forbidden.toLowerCase());
    }

    for (const required of ["PlaybackTarget", "SwitchTarget", "selectedTrackRef", "playbackProfile", "room.snapshot"]) {
      expect(bundle).toContain(required);
    }
  });
});
