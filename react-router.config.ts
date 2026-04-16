import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Align with @cloudflare/vite-plugin's output directory so the SSR
  // build can find the client manifest at
  // `<buildDirectory>/client/.vite/manifest.json`.
  buildDirectory: "dist",
} satisfies Config;
