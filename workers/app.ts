import { createRequestHandler } from "react-router";
// In production (wrangler deploy), this resolves to the real built file.
// In dev (vite dev), the react-router plugin intercepts the import.
import * as build from "../dist/server/index.js";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const handler = createRequestHandler(build, "production");

export default {
  async fetch(request, env, ctx) {
    return handler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
