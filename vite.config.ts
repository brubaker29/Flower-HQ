import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  // Force a single copy of react / react-router in both the client and
  // SSR bundles. Without dedupe, Vite's SSR dep optimizer can end up
  // loading two instances of react-router in workerd, which makes
  // `<Meta />` and friends throw "must render inside <HydratedRouter>"
  // because the provider and consumer come from different modules.
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
  },
});
