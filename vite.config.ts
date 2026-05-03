/// <reference types="vitest" />
import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/**"],
  },
});
