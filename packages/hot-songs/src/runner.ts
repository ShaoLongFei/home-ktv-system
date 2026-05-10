import type {
  SourceDefinition,
  SourceManifest,
  SourceRow,
  SourceStatus
} from "./contracts.js";

export type CollectOneSourceResult = {
  rows: SourceRow[];
  status: SourceStatus;
};

export type CollectSourcesResult = {
  generatedAt: string;
  rows: SourceRow[];
  statuses: SourceStatus[];
};

export type CollectContext = {
  adapters: Partial<Record<SourceDefinition["adapter"], SourceAdapter>>;
  sourceIds?: readonly string[];
  generatedAt?: string;
  runRoot?: string;
};

export type SourceAdapter = (
  source: SourceDefinition,
  context: CollectContext
) => Promise<SourceRow[]>;

export class CollectSourcesError extends Error {
  constructor(message: string, readonly result: CollectSourcesResult) {
    super(message);
    this.name = "CollectSourcesError";
  }
}

const NO_USABLE_SOURCE_MESSAGE =
  "No usable hot-song sources remain. Check source-report.json for failed, stale, and skipped sources.";

const dayInMs = 24 * 60 * 60 * 1000;

export async function collectOneSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<CollectOneSourceResult> {
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  const startedAt = generatedAt;

  if (!source.enabled) {
    return {
      rows: [],
      status: buildStatus(source, {
        status: "skipped",
        usable: false,
        rowCount: 0,
        warnings: ["source-disabled"],
        startedAt,
        finishedAt: generatedAt
      })
    };
  }

  if (
    context.sourceIds !== undefined &&
    context.sourceIds.length > 0 &&
    !context.sourceIds.includes(source.id)
  ) {
    return {
      rows: [],
      status: buildStatus(source, {
        status: "skipped",
        usable: false,
        rowCount: 0,
        warnings: ["source-filtered"],
        startedAt,
        finishedAt: generatedAt
      })
    };
  }

  const adapter = context.adapters[source.adapter];
  if (adapter === undefined) {
    return {
      rows: [],
      status: buildStatus(source, {
        status: "failed",
        usable: false,
        rowCount: 0,
        warnings: [],
        error: `Adapter ${source.adapter} is not configured`,
        startedAt,
        finishedAt: generatedAt
      })
    };
  }

  try {
    const rows = await adapter(source, context);
    const warnings =
      rows.length < source.expectedMinRows
        ? ["row-count-below-expected"]
        : [];

    if (rows.length === 0) {
      return {
        rows,
        status: buildStatus(source, {
          status: "failed",
          usable: false,
          rowCount: rows.length,
          warnings,
          error: "No rows returned",
          startedAt,
          finishedAt: generatedAt
        })
      };
    }

    const stale = isStaleSource(source, rows, generatedAt);
    if (stale) {
      return {
        rows,
        status: buildStatus(source, {
          status: "stale",
          usable: source.usableWhenStale && rows.length > 0,
          rowCount: rows.length,
          warnings,
          startedAt,
          finishedAt: generatedAt
        })
      };
    }

    return {
      rows,
      status: buildStatus(source, {
        status: "succeeded",
        usable: true,
        rowCount: rows.length,
        warnings,
        startedAt,
        finishedAt: generatedAt
      })
    };
  } catch (error) {
    return {
      rows: [],
      status: buildStatus(source, {
        status: "failed",
        usable: false,
        rowCount: 0,
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
        startedAt,
        finishedAt: generatedAt
      })
    };
  }
}

export async function collectSources(
  manifest: SourceManifest,
  context: CollectContext
): Promise<CollectSourcesResult> {
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  const sourceResults = await Promise.all(
    manifest.sources.map((source) =>
      collectOneSource(source, { ...context, generatedAt })
    )
  );
  const result: CollectSourcesResult = {
    generatedAt,
    rows: sourceResults.flatMap((sourceResult) => sourceResult.rows),
    statuses: sourceResults.map((sourceResult) => sourceResult.status)
  };

  const hasUsableRows = result.statuses.some(
    (status) => status.usable && status.rowCount > 0
  );
  if (!hasUsableRows) {
    throw new CollectSourcesError(NO_USABLE_SOURCE_MESSAGE, result);
  }

  return result;
}

function buildStatus(
  source: SourceDefinition,
  status: Omit<SourceStatus, "sourceId">
): SourceStatus {
  return {
    sourceId: source.id,
    ...status
  };
}

function isStaleSource(
  source: SourceDefinition,
  rows: SourceRow[],
  generatedAt: string
): boolean {
  const publishedTimes = rows
    .map((row) =>
      row.sourcePublishedAt === null ? Number.NaN : Date.parse(row.sourcePublishedAt)
    )
    .filter((time) => Number.isFinite(time));

  if (publishedTimes.length === 0) {
    return false;
  }

  const latestPublishedAt = Math.max(...publishedTimes);
  return Date.parse(generatedAt) - latestPublishedAt > source.staleAfterDays * dayInMs;
}
