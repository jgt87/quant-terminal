import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Open a Server-Sent Events response and keep it alive until the client disconnects.
 * `subscribe` registers a listener and returns its cleanup. Resolves when the connection ends.
 */
export async function serveSse(
  req: IncomingMessage,
  res: ServerResponse,
  subscribe: (send: (event: string, data: unknown) => void) => () => void,
  heartbeatMs = 15_000,
): Promise<void> {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": connected\n\n");
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const unsubscribe = subscribe(send);
  const beat = setInterval(() => !res.writableEnded && res.write(": ping\n\n"), heartbeatMs);
  beat.unref();
  await new Promise<void>((resolve) => {
    req.on("close", resolve);
    res.on("close", resolve);
  });
  clearInterval(beat);
  unsubscribe();
  if (!res.writableEnded) res.end();
}
