import type { RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

/**
 * File-based routing: every `app/routes/*.tsx` file becomes a route.
 * Nested routes use dot-delimited filenames, e.g.
 *   assets.tsx              → layout
 *   assets._index.tsx       → /assets
 *   assets.$id.tsx          → /assets/:id
 */
export default flatRoutes() satisfies RouteConfig;
