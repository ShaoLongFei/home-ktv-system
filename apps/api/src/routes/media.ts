import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AssetGateway, AssetGatewayResolution } from "../modules/assets/asset-gateway.js";

export interface MediaRouteContext {
  assetGateway: AssetGateway;
}

export async function registerMediaRoutes(fastify: FastifyInstance, context: MediaRouteContext): Promise<void> {
  fastify.get<{ Params: { assetId: string } }>("/media/:assetId", async (request, reply) => {
    const resolution = await context.assetGateway.resolveForStreaming(request.params.assetId);
    if (!resolution.ok) {
      return sendMediaError(reply, resolution);
    }

    const byteRange = parseByteRange(request.headers.range, resolution.contentLength);
    if (byteRange === "invalid") {
      return reply
        .status(416)
        .header("content-range", `bytes */${resolution.contentLength}`)
        .send({ error: "MEDIA_RANGE_NOT_SATISFIABLE" });
    }

    reply.type(resolution.contentType);
    reply.header("accept-ranges", "bytes");

    if (byteRange) {
      const contentLength = byteRange.end - byteRange.start + 1;
      reply.status(206);
      reply.header("content-range", `bytes ${byteRange.start}-${byteRange.end}/${resolution.contentLength}`);
      reply.header("content-length", contentLength);
      return reply.send(createReadStream(resolution.filePath, byteRange));
    }

    reply.header("content-length", resolution.contentLength);
    return reply.send(createReadStream(resolution.filePath));
  });
}

function sendMediaError(
  reply: FastifyReply,
  resolution: Extract<AssetGatewayResolution, { ok: false }>
): FastifyReply {
  return reply.status(resolution.statusCode).send({
    error: resolution.code
  });
}

type ByteRange = { start: number; end: number };

function parseByteRange(rangeHeader: string | undefined, fileSize: number): ByteRange | "invalid" | null {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return "invalid";
  }

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") {
    return "invalid";
  }

  if (rawStart === "") {
    const suffixLength = Number.parseInt(rawEnd ?? "", 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1
    };
  }

  const start = Number.parseInt(rawStart ?? "", 10);
  const requestedEnd = rawEnd === "" ? fileSize - 1 : Number.parseInt(rawEnd ?? "", 10);
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || start < 0 || requestedEnd < start || start >= fileSize) {
    return "invalid";
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1)
  };
}
