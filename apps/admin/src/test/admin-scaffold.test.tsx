import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("admin app scaffold", () => {
  it("declares React, Vite, Testing Library, and happy-dom dependencies", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toContain("vite");
    expect(packageJson.scripts?.build).toContain("vite build");
    expect(packageJson.scripts?.test).toContain("vitest");
    expect(packageJson.dependencies?.react).toBe("19.2.5");
    expect(packageJson.dependencies?.["react-dom"]).toBe("19.2.5");
    expect(packageJson.dependencies?.["@tanstack/react-query"]).toBe("5.100.6");
    expect(packageJson.devDependencies?.["@vitejs/plugin-react"]).toBe("6.0.1");
    expect(packageJson.devDependencies?.vite).toBe("8.0.10");
    expect(packageJson.devDependencies?.vitest).toBe("^4.1.5");
    expect(packageJson.devDependencies?.typescript).toBe("6.0.3");
    expect(packageJson.devDependencies?.["@testing-library/react"]).toBeDefined();
    expect(packageJson.devDependencies?.["@testing-library/user-event"]).toBeDefined();
    expect(packageJson.devDependencies?.["happy-dom"]).toBeDefined();
  });

  it("configures Vitest to use happy-dom for DOM-backed admin tests", () => {
    const configPath = resolve(process.cwd(), "vite.config.ts");

    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain('environment: "happy-dom"');
  });

  it("renders the import review workbench as the default admin view", async () => {
    const appPath = resolve(process.cwd(), "src/App.tsx");

    expect(existsSync(appPath)).toBe(true);

    const { App } = (await import("../App")) as { App: () => ReactElement };
    render(<App />);

    expect(screen.getByRole("heading", { name: /import review workbench/i })).toBeTruthy();
    expect(screen.queryByText(/landing page|marketing/i)).toBeNull();
  });
});
