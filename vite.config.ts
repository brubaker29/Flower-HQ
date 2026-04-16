import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare(),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
  },
  // workerd can't import anything external at runtime — everything has
  // to be in the bundle. `noExternal: true` also collapses what would
  // otherwise be two react-router instances (one from Vite's SSR dep
  // optimizer, one from the real module graph) into a single copy,
  // which fixes the <Meta /> "must render inside <HydratedRouter>"
  // context mismatch.
  ssr: {
    noExternal: true,
  },
});
