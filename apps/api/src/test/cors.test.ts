import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";

describe("CORS", () => {
  it("allows the configured TV player origin for preflight and API responses", async () => {
    const server = await createServer({
      corsAllowedOrigins: ["http://192.168.1.20:5173"],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://192.168.1.20:4000",
      roomSlug: "living-room"
    });

    const preflight = await server.inject({
      headers: {
        "access-control-request-headers": "content-type",
        "access-control-request-method": "POST",
        origin: "http://192.168.1.20:5173"
      },
      method: "OPTIONS",
      url: "/player/bootstrap"
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://192.168.1.20:5173");
    expect(preflight.headers["access-control-allow-methods"]).toContain("POST");
    expect(preflight.headers["access-control-allow-headers"]).toBe("content-type");

    const health = await server.inject({
      headers: {
        origin: "http://192.168.1.20:5173"
      },
      method: "GET",
      url: "/health"
    });

    expect(health.statusCode).toBe(200);
    expect(health.headers["access-control-allow-origin"]).toBe("http://192.168.1.20:5173");
    await server.close();
  });

  it("does not echo unconfigured origins", async () => {
    const server = await createServer({
      corsAllowedOrigins: ["http://192.168.1.20:5173"],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://192.168.1.20:4000",
      roomSlug: "living-room"
    });

    const health = await server.inject({
      headers: {
        origin: "http://malicious.local:5173"
      },
      method: "GET",
      url: "/health"
    });

    expect(health.statusCode).toBe(200);
    expect(health.headers["access-control-allow-origin"]).toBeUndefined();
    await server.close();
  });
});
