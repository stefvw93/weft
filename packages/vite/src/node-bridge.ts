import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/** A Web `fetch`-style handler. */
export type WebHandler = (request: Request) => Promise<Response>;

/**
 * Builds a Web `Request` from a Node request, streaming the body. The request is
 * aborted when the client disconnects before the response has ended.
 */
export function toWebRequest(req: IncomingMessage, res: ServerResponse, url: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    // HTTP/2 (Vite's HTTPS mode) exposes pseudo-headers such as `:path`, which
    // are not valid `Headers` names.
    if (value === undefined || name.startsWith(":")) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const isSecure = (req.socket as { readonly encrypted?: boolean }).encrypted === true;
  const authority = req.headers.host ?? req.headers[":authority"] ?? "localhost";
  const origin = `${isSecure ? "https" : "http"}://${String(authority)}`;
  return new Request(new URL(url, origin), {
    method,
    headers,
    signal: abort.signal,
    ...(hasBody
      ? // `duplex` is required for a streamed body and is missing from the DOM `RequestInit` type.
        ({ body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half" } as RequestInit)
      : {}),
  });
}

/**
 * Writes a Web `Response` to a Node response chunk by chunk, so a streamed body
 * reaches the client as it is produced. Stops reading if the client disconnects.
 */
export async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie();
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  if (response.body === null) {
    res.end();
    return;
  }
  res.flushHeaders();
  const reader = response.body.getReader();
  res.on("close", () => {
    if (!res.writableEnded) void reader.cancel().catch(() => {});
  });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Respect backpressure: wait for the socket to drain before reading more.
    // `close` settles the wait too: a disconnected socket never drains.
    if (!res.write(value)) {
      await new Promise<void>((resolve) => {
        res.once("drain", resolve);
        res.once("close", resolve);
      });
    }
  }
  res.end();
}
