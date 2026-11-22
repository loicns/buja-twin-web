import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200, // maplibre-gl alone is about 800 kB before gzip
  },
});
