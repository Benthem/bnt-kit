import { defineConfig } from "vitest/config";

// Starting a local D1 (workerd) can take a few seconds.
export default defineConfig({ test: { testTimeout: 30000, hookTimeout: 60000 } });
