import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    // In dev: runs Miniflare alongside Vite so loaders/actions get real
    // CF bindings (env.DB, env.FILES). Reads bindings from wrangler.jsonc.
    // Does NOT affect the production build.
    cloudflareDevProxy<Env, Record<string, unknown>>({
      getLoadContext({ context }) {
        return { cloudflare: context.cloudflare };
      },
    }),
    reactRouter(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
