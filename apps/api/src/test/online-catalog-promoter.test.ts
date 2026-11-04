import { describe, expect, it } from "vitest";
import type { QueryExecutor } from "../db/query-executor.js";
import { onlineCatalogSongId, PgOnlineCatalogPromoter } from "../modules/online/online-catalog-promoter.js";

function createRecordingDb(): { db: QueryExecutor; calls: Array<{ text: string; values: readonly unknown[] }> } {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  return {
    calls,
    db: {
      query: async <TRow>(text: string, values?: readonly unknown[]) => {
        calls.push({ text, values: values ?? [] });
        return { rows: [] as TRow[] };
      }
    }
  };
}

describe("PgOnlineCatalogPromoter", () => {
  it("builds a deterministic catalog id", () => {
    expect(onlineCatalogSongId("igeba", "20039643")).toBe("ktv-online-igeba-20039643");
    expect(onlineCatalogSongId("igeba", "20039/643")).toBe("ktv-online-igeba-20039643");
  });

  it("upserts into ktv_songs with an online source_root marker", async () => {
    const { db, calls } = createRecordingDb();
    const promoter = new PgOnlineCatalogPromoter(db);

    const result = await promoter.promote({
      provider: "igeba",
      providerSongId: "20039643",
      title: "孤勇者",
      artistName: "陈奕迅",
      cachePath: "/data/online-cache/igeba/20039643.mkv",
      fileName: "20039643.mkv",
      extension: ".mkv",
      sizeBytes: 45950730,
      styleTags: ["影视"],
      technicalStatus: "probed",
      technicalMetadata: { audioTrackCount: 2 }
    });

    expect(result.songId).toBe("ktv-online-igeba-20039643");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("INSERT INTO ktv_songs");
    expect(calls[0]?.text).toContain("ON CONFLICT (id) DO UPDATE");
    expect(calls[0]?.values[0]).toBe("ktv-online-igeba-20039643");
    expect(calls[0]?.values[8]).toEqual(["影视"]);
    expect(calls[0]?.values[17]).toBe("online:igeba");
    expect(String(calls[0]?.values[16])).toContain('"providerSongId":"20039643"');
  });
});
