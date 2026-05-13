import { describe, expect, it } from "vitest";
import { tvTheme } from "../theme.js";

describe("tvTheme", () => {
  it("uses the approved dark home-theater palette", () => {
    expect(tvTheme.colors.background).toBe("#05070D");
    expect(tvTheme.colors.surface).toBe("rgba(15, 23, 42, 0.82)");
    expect(tvTheme.colors.accent).toBe("#22D3EE");
    expect(tvTheme.colors.success).toBe("#34D399");
  });
});
