import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function previewAllowedHosts(envName: string): string[] {
  const value = process.env[envName]?.trim();
  if (!value) {
    return [];
  }

  try {
    return [new URL(value).hostname];
  } catch {
    const hostname = value.replace(/^https?:\/\//u, "").split("/")[0]?.split(":")[0]?.trim();
    return hostname ? [hostname] : [];
  }
}

export default defineConfig({
  plugins: [react()],
  build: {
    // 不指定 cssTarget 时压缩器会把 (min-width: 600px) 输出成
    // @media (width>=600px)（Media Queries Level 4），老版安卓 WebView
    // 不认这种写法会整条丢弃，多列布局就永远不生效。
    cssTarget: "safari14"
  },
  server: {
    host: "0.0.0.0",
    port: 5176
  },
  preview: {
    allowedHosts: previewAllowedHosts("CONTROLLER_BASE_URL"),
    host: "0.0.0.0",
    port: 5176
  },
  test: {
    environment: "happy-dom",
    include: ["src/test/**/*.test.tsx"]
  }
});
