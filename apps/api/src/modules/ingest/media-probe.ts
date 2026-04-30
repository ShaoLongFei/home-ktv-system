import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  width?: number;
  height?: number;
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
  raw: Record<string, unknown>;
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

  return {
    durationMs: parseDurationMs(raw.format?.duration ?? videoStream?.duration ?? audioStream?.duration),
    formatName: raw.format?.format_name ?? null,
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    raw: raw as Record<string, unknown>
  };
}

function parseDurationMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}
