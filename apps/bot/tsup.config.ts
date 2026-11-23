import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: process.env.SIGAP_SOURCEMAP === "true",
  splitting: false,
  noExternal: ["@sigap/core", "@sigap/config"],
  external: ["@whiskeysockets/baileys", "qrcode", "pino"]
});
