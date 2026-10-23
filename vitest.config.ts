import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // The database tests share test Shop A: one file changing its fees or saving a
  // receipt would change another file's prices mid-test. One file at a time.
  // They also make several round trips to the shared dev project, which can take
  // longer than Vitest's 5-second default, so each test gets 30 seconds.
  test: { fileParallelism: false, testTimeout: 30_000 },
});
