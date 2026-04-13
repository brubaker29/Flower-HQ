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
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
  },
  // Keep react-router out of Vite's SSR dep pre-bundler so there's
  // never a separate `deps_ssr/react-router.js` copy that could double
  // up with the bundled one.
  optimizeDeps: {
    exclude: ["react-router", "react-router/dom"],
  },
  // For a Workers target, everything has to be bundled into the
  // output anyway — workerd can't `require()` from node_modules.
  // `noExternal: true` forces Vite to inline every dep into the SSR
  // bundle, which eliminates the last place a duplicate react-router
  // instance could sneak in.
  ssr: {
    noExternal: true,
  },
});
