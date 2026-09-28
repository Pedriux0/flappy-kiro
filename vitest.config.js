import { defineConfig } from "vitest/config";

// Default environment is node (pure core tests). Tests that need the DOM
// opt in per file with the `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
