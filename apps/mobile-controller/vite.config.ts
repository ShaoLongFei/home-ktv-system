import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5176
  },
  preview: {
    host: "0.0.0.0",
    port: 4176
  },
  test: {
    environment: "happy-dom",
    include: ["src/test/**/*.test.tsx"]
  }
});
