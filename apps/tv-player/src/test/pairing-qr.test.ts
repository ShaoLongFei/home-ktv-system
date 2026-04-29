import { describe, expect, it } from "vitest";
import { createQrModules } from "../components/PairingQr.js";

describe("PairingQr", () => {
  it("generates a real QR module matrix from the pairing payload", () => {
    const modules = createQrModules("http://192.168.5.58:4000/controller?room=living-room&token=test");

    expect(modules.size).toBeGreaterThan(7);
    expect(modules.cells).toHaveLength(modules.size * modules.size);
    expect(modules.cells.some(Boolean)).toBe(true);
    expect(modules.cells.some((cell) => !cell)).toBe(true);
  });
});
