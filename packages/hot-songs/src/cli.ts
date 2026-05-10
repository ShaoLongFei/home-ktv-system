import { parseArgs } from "node:util";

export const HOT_SONGS_SOURCES_HELP =
  "Usage: pnpm hot-songs:sources -- --manifest <path> --out <dir>";

export type CollectSourcesArgs = {
  manifestPath: string | undefined;
  outDir: string | undefined;
  timeoutMs: number;
  sourceIds: string[];
  fixture: boolean;
  help: boolean;
};

export function parseCollectSourcesArgs(argv: string[]): CollectSourcesArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      out: { type: "string" },
      "timeout-ms": { type: "string", default: "10000" },
      source: { type: "string", multiple: true },
      fixture: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    manifestPath: values.manifest,
    outDir: values.out,
    timeoutMs: Number.parseInt(values["timeout-ms"] ?? "10000", 10),
    sourceIds: values.source ?? [],
    fixture: values.fixture === true,
    help: values.help === true
  };
}
