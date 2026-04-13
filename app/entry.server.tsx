import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";

/**
 * Workers-flavored server entry. Uses `renderToReadableStream` from
 * `react-dom/server` (Web Streams API) instead of the Node pipe-based
 * `renderToPipeableStream`, so it runs inside workerd without any
 * Node shims.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        responseStatusCode = 500;
        console.error(error);
      },
    },
  );

  if (routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
