import { defineConfig } from "tsup";

export default defineConfig({
  // CLI ikut dibundel agar bisa dijalankan di server produksi tanpa tsx.
  entry: {
    server: "src/server.ts",
    "import-regions": "src/cli/import-regions.ts",
    "rotate-secrets": "src/cli/rotate-secrets.ts"
  },
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: process.env.SIGAP_SOURCEMAP === "true",
  splitting: false,
  noExternal: ["@sigap/core", "@sigap/config"],
  external: ["better-sqlite3", "sharp", "exifr", "exceljs", "pdfkit", "web-push"]
});
