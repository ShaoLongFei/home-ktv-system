import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { MediaInfoProvenance, MediaInfoSummary } from "@home-ktv/domain";

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  index?: number;
  id?: string;
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  width?: number;
  height?: number;
  channels?: number;
  tags?: Record<string, string>;
}

interface FfprobePayload {
  format?: {
    duration?: string;
    format_name?: string;
  };
  streams?: FfprobeStream[];
}

export interface MediaProbeSummary {
  durationMs: number | null;
  formatName: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  mediaInfoSummary: MediaInfoSummary;
  mediaInfoProvenance: MediaInfoProvenance;
  raw: Record<string, unknown>;
}

export interface BuildMediaInfoSummaryInput {
  payload: FfprobePayload;
  fileSizeBytes: number;
  filePath: string;
  probedAt: string;
  sourceVersion?: string | null;
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeSummary> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024
    }
  );
  const raw = JSON.parse(stdout || "{}") as FfprobePayload;
  const streams = raw.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const fileStats = await stat(filePath);
  const { mediaInfoSummary, mediaInfoProvenance } = buildMediaInfoSummaryFromFfprobe({
    payload: raw,
    fileSizeBytes: fileStats.size,
    filePath,
    probedAt: new Date().toISOString(),
    sourceVersion: null
  });

  return {
    durationMs: parseDurationMs(raw.format?.duration ?? videoStream?.duration ?? audioStream?.duration),
    formatName: raw.format?.format_name ?? null,
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    mediaInfoSummary,
    mediaInfoProvenance,
    raw: raw as Record<string, unknown>
  };
}

export function buildMediaInfoSummaryFromFfprobe(input: BuildMediaInfoSummaryInput): {
  mediaInfoSummary: MediaInfoSummary;
  mediaInfoProvenance: MediaInfoProvenance;
} {
  const streams = input.payload.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const durationMs = parseDurationMs(input.payload.format?.duration ?? videoStream?.duration ?? audioStreams[0]?.duration);

  return {
    mediaInfoSummary: {
      container: input.payload.format?.format_name ?? null,
      durationMs,
      videoCodec: videoStream?.codec_name ?? null,
      resolution: typeof videoStream?.width === "number" && typeof videoStream.height === "number"
        ? { width: videoStream.width, height: videoStream.height }
        : null,
      fileSizeBytes: input.fileSizeBytes,
      audioTracks: audioStreams.map((stream, fallbackIndex) => ({
        index: stream.index ?? fallbackIndex,
        id: typeof stream.id === "string" && stream.id.trim() ? stream.id : `stream-${stream.index ?? fallbackIndex}`,
        label: stream.tags?.title ?? stream.tags?.handler_name ?? `Audio ${fallbackIndex + 1}`,
        language: stream.tags?.language ?? null,
        codec: stream.codec_name ?? null,
        channels: typeof stream.channels === "number" ? stream.channels : null
      }))
    },
    mediaInfoProvenance: {
      source: "ffprobe",
      sourceVersion: input.sourceVersion ?? null,
      probedAt: input.probedAt,
      importedFrom: input.filePath
    }
  };
}

function parseDurationMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}
