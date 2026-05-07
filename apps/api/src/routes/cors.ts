import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const CORS_METHODS = "GET,POST,OPTIONS";
const DEFAULT_CORS_HEADERS = "content-type";

export interface CorsDependencies {
  allowedOrigins: readonly string[];
}

export async function registerCors(server: FastifyInstance, dependencies: CorsDependencies): Promise<void> {
  server.addHook("onRequest", (request, reply, done) => {
    applyCorsHeaders(request, reply, dependencies.allowedOrigins);

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });
}

function applyCorsHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedOrigins: readonly string[]
): void {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  reply.header("Vary", "Origin");

  if (!allowedOrigins.includes(origin)) {
    return;
  }

  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Credentials", "true");
  reply.header("Access-Control-Allow-Methods", CORS_METHODS);
  reply.header(
    "Access-Control-Allow-Headers",
    request.headers["access-control-request-headers"] ?? DEFAULT_CORS_HEADERS
  );
  reply.header("Access-Control-Max-Age", "600");
}
