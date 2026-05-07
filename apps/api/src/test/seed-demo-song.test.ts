import type { IncomingMessage, Server } from "node:http";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedDemoSongs } from "../../../../scripts/seed-demo-song.mjs";

let testServer: Server | null = null;

describe("seedDemoSongs", () => {
  afterEach(async () => {
    await closeServer();
  });

  it("creates two distinct demo songs, imports them, approves them, and verifies availability", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-demo-"));
    const state = createState();
    const server = await startApiServer(state);

    const result = await seedDemoSongs({
      apiBaseUrl: server.baseUrl,
      mediaRoot,
      roomSlug: "living-room",
      durationMs: 60_000,
      runCommand: async (command: string, args: string[]) => {
        state.commands.push({ command, args });
        const outputPath = args.at(-1);
        if (typeof outputPath === "string") {
          await writeDemoFile(outputPath, args.join(" "));
        }
      }
    });

    expect(result.songs).toHaveLength(2);
    expect(result.songs.map((song) => song.song.title)).toEqual(["Demo Song Sunrise", "Demo Song Night Drive"]);
    expect(state.commands).toHaveLength(4);
    expect(state.scanned).toBe(true);
    expect(state.approveCalls).toEqual(["candidate-demo-aurora", "candidate-demo-midnight"]);
    expect(state.availableSongsCalls).toBeGreaterThanOrEqual(2);
    expect(state.commands[0]?.args.join(" ")).toContain("testsrc2=size=1280x720:rate=30,format=yuv420p");
    expect(state.commands[2]?.args.join(" ")).toContain("smptebars=size=1280x720:rate=30");

    const sunriseOriginal = await readFile(
      path.join(mediaRoot, "imports/pending/Demo Artist Aurora/Demo Song Sunrise/original.mp4"),
      "utf8"
    );
    const nightInstrumental = await readFile(
      path.join(mediaRoot, "imports/pending/Demo Artist Midnight/Demo Song Night Drive/instrumental.mp4"),
      "utf8"
    );

    expect(sunriseOriginal).toContain("original.mp4");
    expect(nightInstrumental).toContain("instrumental.mp4");
  });

  it("waits for scan results to include a complete original and instrumental pair before approval", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-demo-"));
    const state = createState();
    state.incompleteCandidateListResponses = 1;
    const server = await startApiServer(state);

    const result = await seedDemoSongs({
      apiBaseUrl: server.baseUrl,
      mediaRoot,
      roomSlug: "living-room",
      durationMs: 60_000,
      timeoutMs: 4_000,
      runCommand: async (command: string, args: string[]) => {
        state.commands.push({ command, args });
        const outputPath = args.at(-1);
        if (typeof outputPath === "string") {
          await writeDemoFile(outputPath, args.join(" "));
        }
      }
    });

    expect(result.songs.map((song) => song.song.title)).toEqual(["Demo Song Sunrise", "Demo Song Night Drive"]);
    expect(state.candidateListCalls).toBeGreaterThan(1);
    expect(state.earlyApproveCalls).toHaveLength(0);
    expect(state.approveCalls).toEqual(["candidate-demo-aurora", "candidate-demo-midnight"]);
  });
});

function createState() {
  return {
    scanned: false,
    approveCalls: [] as string[],
    candidateListCalls: 0,
    earlyApproveCalls: [] as string[],
    incompleteCandidateListResponses: 0,
    availableSongsCalls: 0,
    commands: [] as Array<{ command: string; args: string[] }>
  };
}

async function startApiServer(state: ReturnType<typeof createState>) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/admin/imports/scan") {
      state.scanned = true;
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, scope: "imports" }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/admin/import-candidates") {
      if (state.scanned) {
        state.candidateListCalls += 1;
      }
      const candidates =
        state.scanned && state.candidateListCalls <= state.incompleteCandidateListResponses
          ? [createCandidate("candidate-demo-aurora", "Demo Artist Aurora", "Demo Song Sunrise", { files: "original-only" })]
          : state.scanned
            ? [createCandidate("candidate-demo-aurora", "Demo Artist Aurora", "Demo Song Sunrise"), createCandidate("candidate-demo-midnight", "Demo Artist Midnight", "Demo Song Night Drive")]
            : [];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          candidates
        })
      );
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/admin/import-candidates/candidate-demo-")) {
      await readJson(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          candidate: candidateFromPath(url.pathname)
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/admin/import-candidates/candidate-demo-") && url.pathname.endsWith("/approve")) {
      const candidate = candidateFromPath(url.pathname);
      if (state.candidateListCalls <= state.incompleteCandidateListResponses) {
        state.earlyApproveCalls.push(candidate.id);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            candidate,
            status: "review_required",
            reason: "missing-original-instrumental-pair"
          })
        );
        return;
      }

      state.approveCalls.push(candidate.id);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          candidate,
          status: "approved"
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/rooms/living-room/available-songs") {
      state.availableSongsCalls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          songs: [
            {
              songId: "song-demo-aurora",
              title: "Demo Song Sunrise",
              artistName: "Demo Artist Aurora",
              language: "other",
              defaultAssetId: "asset-demo-aurora",
              durationMs: 60_000
            },
            {
              songId: "song-demo-midnight",
              title: "Demo Song Night Drive",
              artistName: "Demo Artist Midnight",
              language: "other",
              defaultAssetId: "asset-demo-midnight",
              durationMs: 60_000
            }
          ]
        })
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }

  testServer = server;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function closeServer() {
  const server = testServer;
  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  testServer = null;
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function writeDemoFile(filePath: string, label: string) {
  await import("node:fs/promises").then(async (fs) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, label, "utf8");
  });
}

function createCandidate(id: string, artistName: string, title: string, options: { files?: "complete" | "original-only" } = {}) {
  const files = [
    {
      candidateFileId: `${id}-original`,
      selected: true,
      proposedVocalMode: "original",
      rootKind: "imports_pending",
      relativePath: `${artistName}/${title}/original.mp4`,
      durationMs: 60_000
    },
    ...(options.files === "original-only"
      ? []
      : [
          {
            candidateFileId: `${id}-instrumental`,
            selected: true,
            proposedVocalMode: "instrumental",
            rootKind: "imports_pending",
            relativePath: `${artistName}/${title}/instrumental.mp4`,
            durationMs: 60_000
          }
        ])
  ];

  return {
    id,
    status: "pending",
    title,
    artistName,
    language: "other",
    sameVersionConfirmed: false,
    candidateMeta: { groupKey: `${artistName}/${title}` },
    files
  };
}

function candidateFromPath(pathname: string) {
  if (pathname.includes("candidate-demo-aurora")) {
    return {
      id: "candidate-demo-aurora",
      status: "approved",
      title: "Demo Song Sunrise",
      artistName: "Demo Artist Aurora"
    };
  }

  return {
    id: "candidate-demo-midnight",
    status: "approved",
    title: "Demo Song Night Drive",
    artistName: "Demo Artist Midnight"
  };
}
