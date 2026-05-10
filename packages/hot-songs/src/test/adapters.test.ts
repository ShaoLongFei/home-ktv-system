import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseQqToplistRows } from "../adapters/qq-toplist.js";
import { SourceDefinitionSchema } from "../contracts.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

const qqKgeSource = SourceDefinitionSchema.parse({
  id: "qq-kge-toplist",
  name: "QQ Music K歌金曲榜",
  provider: "qq_music",
  sourceType: "ktv_first",
  sourceKind: "public_chart",
  adapter: "qq_toplist",
  weight: 100,
  url: "https://y.qq.com/n/ryqq/toplist/36",
  expectedMinRows: 3,
  staleAfterDays: 14
});

describe("parseQqToplistRows", () => {
  it("parses QQ K歌金曲榜 fixture rows", async () => {
    const html = await readFile(
      resolve(
        repoRoot,
        "packages/hot-songs/fixtures/html/qq-kge-toplist.fixture.html"
      ),
      "utf8"
    );

    const rows = parseQqToplistRows(
      qqKgeSource,
      html,
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "qq-kge-toplist",
        sourceType: "ktv_first",
        provider: "qq_music",
        rank: 1,
        rawTitle: "后来",
        rawArtists: ["刘若英"],
        sourceUrl: "https://y.qq.com/n/ryqq/toplist/36",
        sourcePublishedAt: "2026-05-10",
        collectedAt: "2026-05-10T00:00:00.000Z"
      })
    );
    expect(rows.map((row) => row.rawTitle)).toContain("Run Wild（向风而野）");
  });

  it("throws when QQ embedded toplist data is absent", () => {
    expect(() =>
      parseQqToplistRows(qqKgeSource, "<html></html>", "2026-05-10T00:00:00.000Z")
    ).toThrow("QQ toplist data not found");
  });
});
