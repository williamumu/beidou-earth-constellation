import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      "@zip.js/zip.js/lib/zip-no-worker.js": "@zip.js/zip.js/lib/zip.js",
      "mersenne-twister": fileURLToPath(
        new URL("./src/vendor/mersenne-twister.ts", import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      "/celestrak": {
        target: "https://celestrak.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/celestrak/, ""),
      },
    },
  },
});
