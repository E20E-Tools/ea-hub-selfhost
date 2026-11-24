import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Node 25+ ships its own global localStorage, which shadows jsdom's and is undefined
// without --localstorage-file. Turn it off so tests use jsdom's storage on every Node.
const nodeWebStorageOff = process.allowedNodeEnvironmentFlags.has(
  "--no-experimental-webstorage",
)
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    execArgv: nodeWebStorageOff,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
