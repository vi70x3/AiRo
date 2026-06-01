import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    watch: false,
    reporters: "verbose",
    environment: "jsdom",
    include: ["src/components/swarm/__tests__/SwarmInfoWidget.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@src": path.resolve(__dirname, "./src"),
      "@roo": path.resolve(__dirname, "../src/shared"),
      vscode: path.resolve(__dirname, "./src/__mocks__/vscode.ts"),
    },
  },
})