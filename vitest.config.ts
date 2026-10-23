import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // The database tests share test Shop A: one file changing its fees or saving a
  // receipt would change another file's prices mid-test. One file at a time.
  test: { fileParallelism: false },
});
