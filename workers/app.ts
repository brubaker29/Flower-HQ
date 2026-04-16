import { createRequestHandler } from "react-router";
import * as build from "virtual:react-router/server-build";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const handler = createRequestHandler(build, import.meta.env.MODE);

export default {
  async fetch(request, env, ctx) {
    return handler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
