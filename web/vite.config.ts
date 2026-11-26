import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200, // maplibre-gl alone is about 800 kB before gzip
  },
  // `npx wrangler pages dev dist --port 8788` serves /api/chat (needs web/.dev.vars with the key)
  server: { proxy: { "/api": "http://localhost:8788" } },
  preview: { headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://pub-7368a1bf7f2b44898e1f5028f7fdb733.r2.dev https://tiles.openfreemap.org https://*.lambda-url.eu-west-1.on.aws; worker-src blob:; child-src blob:; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'none'" } },
});
