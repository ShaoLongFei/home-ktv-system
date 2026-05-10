import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { runCollectSourcesCli } from "../cli.js";
import type {
  SourceDefinition,
  SourceManifest,
  SourceRow,
  SourceStatus
} from "../contracts.js";
import {
  collectSources,
  type CollectContext,
  type SourceAdapter
} from "../runner.js";
import {
  buildSourceHealthReport,
  writeSourceReport
} from "../report/source-health.js";

const generatedAt = "2026-05-10T00:00:00.000Z";
const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

function source(
  overrides: Partial<SourceDefinition> & Pick<SourceDefinition, "id">
): SourceDefinition {
  const { id, ...sourceOverrides } = overrides;
  return {
    id,
    name: sourceOverrides.name ?? id,
    provider: sourceOverrides.provider ?? "manual",
    sourceType: sourceOverrides.sourceType ?? "support",
    sourceKind: sourceOverrides.sourceKind ?? "manual_snapshot",
    adapter: sourceOverrides.adapter ?? "manual_json",
    weight: sourceOverrides.weight ?? 50,
    enabled: sourceOverrides.enabled ?? true,
    required: sourceOverrides.required ?? false,
    file: sourceOverrides.file ?? "unused.json",
    expectedMinRows: sourceOverrides.expectedMinRows ?? 1,
    staleAfterDays: sourceOverrides.staleAfterDays ?? 14,
    usableWhenStale: sourceOverrides.usableWhenStale ?? false,
    ...sourceOverrides
  };
}

function manifest(sources: SourceDefinition[]): SourceManifest {
  return {
    schemaVersion: "hot-songs.source-manifest.v1",
    sources
  };
}

function row(
  sourceDefinition: SourceDefinition,
  overrides: Partial<SourceRow> = {}
): SourceRow {
  return {
    sourceId: sourceDefinition.id,
    sourceType: sourceDefinition.sourceType,
    provider: sourceDefinition.provider,
    rank: 1,
    rawTitle: "后来",
    rawArtists: ["刘若英"],
    sourceUrl: null,
    sourcePublishedAt: "2026-05-10",
    collectedAt: generatedAt,
    warnings: [],
    ...overrides
  };
}

function status(
  sourceId: string,
  statusValue: SourceStatus["status"],
  rowCount = 0
): SourceStatus {
  return {
    sourceId,
    status: statusValue,
    usable: statusValue === "succeeded" || statusValue === "stale",
    rowCount,
    warnings: [],
    startedAt: generatedAt,
    finishedAt: generatedAt
  };
}

function successAdapter(): SourceAdapter {
  return async (sourceDefinition) => [row(sourceDefinition)];
}

function context(adapters: CollectContext["adapters"]): CollectContext {
  return {
    adapters,
    generatedAt
  };
}

describe("collectSources", () => {
  it("keeps partial failures visible while returning usable rows", async () => {
    const goodSource = source({ id: "manual-good" });
    const failingSource = source({
      id: "qq-failure",
      provider: "qq_music",
      sourceKind: "public_chart",
      adapter: "qq_toplist",
      url: "https://y.qq.com/n/ryqq/toplist/36"
    });

    const result = await collectSources(
      manifest([goodSource, failingSource]),
      context({
        manual_json: successAdapter(),
        qq_toplist: async () => {
          throw new Error("network unavailable");
        }
      })
    );

    expect(result.rows).toHaveLength(1);
    expect(result.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "manual-good",
          status: "succeeded",
          usable: true,
          rowCount: 1
        }),
        expect.objectContaining({
          sourceId: "qq-failure",
          status: "failed",
          usable: false,
          error: "network unavailable"
        })
      ])
    );
  });

  it("records disabled and source-filtered sources as skipped", async () => {
    const selectedSource = source({ id: "manual-selected" });
    const disabledSource = source({ id: "manual-disabled", enabled: false });
    const filteredSource = source({ id: "manual-filtered" });

    const result = await collectSources(
      manifest([selectedSource, disabledSource, filteredSource]),
      {
        ...context({ manual_json: successAdapter() }),
        sourceIds: ["manual-selected"]
      }
    );

    expect(result.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "manual-disabled",
          status: "skipped",
          warnings: ["source-disabled"]
        }),
        expect.objectContaining({
          sourceId: "manual-filtered",
          status: "skipped",
          warnings: ["source-filtered"]
        })
      ])
    );
  });

  it("marks stale sources and only keeps them usable when allowed", async () => {
    const staleSource = source({
      id: "stale-manual",
      staleAfterDays: 1,
      usableWhenStale: true
    });

    const result = await collectSources(
      manifest([staleSource]),
      context({
        manual_json: async (sourceDefinition) => [
          row(sourceDefinition, { sourcePublishedAt: "2026-05-01" })
        ]
      })
    );

    expect(result.statuses).toEqual([
      expect.objectContaining({
        sourceId: "stale-manual",
        status: "stale",
        usable: true,
        rowCount: 1
      })
    ]);
  });

  it("fails when no usable hot-song source remains", async () => {
    await expect(
      collectSources(
        manifest([source({ id: "manual-failure" })]),
        context({
          manual_json: async () => {
            throw new Error("bad snapshot");
          }
        })
      )
    ).rejects.toThrow(
      "No usable hot-song sources remain. Check source-report.json for failed, stale, and skipped sources."
    );
  });

  it("builds and writes source health status counts", async () => {
    const report = buildSourceHealthReport({
      generatedAt,
      rows: [row(source({ id: "manual-good" }))],
      statuses: [
        status("manual-good", "succeeded", 1),
        status("manual-failure", "failed"),
        status("manual-stale", "stale", 1),
        status("manual-skipped", "skipped")
      ]
    });

    expect(report.schemaVersion).toBe("hot-songs.source-report.v1");
    expect(report.statusCounts).toEqual({
      succeeded: 1,
      failed: 1,
      stale: 1,
      skipped: 1
    });
    expect(report.totalRows).toBe(1);
    expect(report.usableSourceCount).toBe(2);

    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-report-"));
    try {
      const reportPath = await writeSourceReport(outDir, report);
      const writtenReport = JSON.parse(await readFile(reportPath, "utf8")) as {
        schemaVersion: string;
      };

      expect(reportPath).toBe(join(outDir, "source-report.json"));
      expect(writtenReport.schemaVersion).toBe("hot-songs.source-report.v1");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

describe("runCollectSourcesCli", () => {
  it("runs root-relative manual source collection and writes artifacts", async () => {
    const outDir = `.planning/reports/hot-songs/runner-cli-${process.pid}-${Date.now()}`;
    const absoluteOutDir = resolve(repoRoot, outDir);
    const originalInitCwd = process.env.INIT_CWD;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    process.env.INIT_CWD = repoRoot;

    try {
      const exitCode = await runCollectSourcesCli([
        "--manifest",
        "packages/hot-songs/config/sources.example.json",
        "--out",
        outDir,
        "--source",
        "cavca-golden-mic-manual"
      ]);

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        "Source collection complete: 3 rows from 1 usable sources"
      );
      expect(errorSpy).not.toHaveBeenCalled();

      const report = JSON.parse(
        await readFile(join(absoluteOutDir, "source-report.json"), "utf8")
      ) as {
        schemaVersion: string;
        sources: Array<{ sourceId: string; status: string }>;
      };
      const sourceRows = JSON.parse(
        await readFile(join(absoluteOutDir, "source-rows.json"), "utf8")
      ) as {
        rows: SourceRow[];
      };

      expect(report.schemaVersion).toBe("hot-songs.source-report.v1");
      expect(report.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceId: "cavca-golden-mic-manual",
            status: "succeeded"
          })
        ])
      );
      expect(sourceRows.rows).toHaveLength(3);
    } finally {
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await rm(absoluteOutDir, { recursive: true, force: true });
    }
  });
});
