/**
 * Dev SSR server for the router-ssr example.
 *
 * Runs Vite in middleware mode and, per request, renders the matched route to a
 * full hydratable HTML document via `entry-server.ts`'s `effect/unstable/http`-style
 * web handler, then runs the result through `vite.transformIndexHtml` so Vite's
 * HMR client and module rewriting are injected. The browser hydrates the markup
 * with `entry-client.ts` and takes over navigation.
 *
 * Only HTML page responses are transformed. Other responses, notably the
 * `POST /_eui/rpc` JSON used by Boundary refetch, are forwarded verbatim with
 * their original status and headers; running them through `transformIndexHtml`
 * would inject Vite's HMR `<script>` into the JSON and corrupt the body.
 */

import type { IncomingMessage } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
// `vite-plus` re-exports Vite's API; the lint rule
// `vite-plus/prefer-vite-plus-imports` forbids importing from "vite" directly.
import { createServer as createViteServer } from "vite-plus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3200;

const vite = await createViteServer({
  root: __dirname,
  appType: "custom",
  server: { middlewareMode: true },
});

/**
 * Reads a Node request body stream into a UTF-8 string. The router's rpc
 * endpoint uses JSON serialization, so a text body round-trips losslessly and
 * sidesteps the `Buffer`/`BodyInit` typed-array variance mismatch.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Builds a Fetch `Request` from a Node `IncomingMessage`, preserving the method,
 * headers, and body. The body matters for `POST /_eui/rpc` refetch calls: a
 * URL-only `Request` would drop it and the rpc parser would fail on empty input.
 */
async function toWebRequest(req: IncomingMessage, url: string): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(url, `http://localhost:${PORT}`), {
    method,
    headers,
    body: hasBody ? await readBody(req) : undefined,
  });
}

const server = createHttpServer((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? "/";

      // Load the server entry through Vite so workspace deps resolve in dev.
      const { handler } = await vite.ssrLoadModule("/src/entry-server.ts");
      const response: Response = await handler(await toWebRequest(req, url));

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/html")) {
        const rendered = await response.text();
        const html = await vite.transformIndexHtml(url, rendered);
        res.statusCode = response.status;
        res.setHeader("Content-Type", "text/html");
        res.end(html);
        return;
      }

      // Non-HTML (e.g. /_eui/rpc JSON): forward untouched.
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      res.statusCode = 500;
      res.end((error as Error).stack);
    }
  });
});

server.listen(PORT, () => {
  console.log(`router-ssr demo running at http://localhost:${PORT}`);
});
