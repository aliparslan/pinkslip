import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@worker": path.resolve(__dirname, "worker"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
});
