import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/test/**/*.test.ts", "server/test/**/*.test.ts", "web/test/**/*.test.ts"],
    environment: "node",
  },
});
