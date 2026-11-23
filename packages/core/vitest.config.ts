import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Intl/ICU cold start on Windows can take several seconds on first use.
    testTimeout: 20_000
  }
});
