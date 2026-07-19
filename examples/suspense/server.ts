/**
 * Dev SSR server for the suspense example, using true HTTP streaming.
 *
 * The HTML template is split at `<!--ssr-outlet-->`. The prefix (everything
 * before the outlet) is written immediately so the browser can start parsing
 * the `<head>`. The Effect Stream from `renderStream()` is then piped chunk-
 * by-chunk to the response: the shell HTML + fallbacks arrive first, and each
 * `<template>+<script>` patch is written as the corresponding Suspense boundary
 * resolves. The suffix (`</body></html>` and the client script tag) is written
 * last.
 *
 * Observe the streaming with:
 *   curl -N --no-buffer http://localhost:3101
 *
 * You will see:
 *   1. The shell + fallback HTML arrive immediately
 *   2. The <template>+<script> patches appear at ~300ms, ~600ms, ~900ms
 *      (one per async card resolving)
 *   3. The nested-boundary patches appear at ~200ms and ~800ms
 */

import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Stream } from "effect";
import { createServer as createViteServer } from "vite-plus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3101;

const vite = await createViteServer({
  root: __dirname,
  appType: "custom",
  server: { middlewareMode: true },
});

const server = createHttpServer((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? "/";

      const template = await vite.transformIndexHtml(
        url,
        await readFile(resolve(__dirname, "index.html"), "utf-8"),
      );

      // Split the template so we can stream the app HTML in between.
      const [before, after] = template.split("<!--ssr-outlet-->");

      const { renderStream } = (await vite.ssrLoadModule("/src/entry-server.ts")) as {
        renderStream: () => Stream.Stream<string, Error>;
      };

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Transfer-Encoding", "chunked");

      // Write the prefix (doctype, head, opening body) immediately so the
      // browser can start parsing styles and prefetch the client script.
      res.write(before);

      // Pipe each chunk from the Effect Stream straight to the response.
      // The stream emits:
      //   - shell HTML (fallbacks + comment markers) → arrives first
      //   - <template>+<script> patches → arrive as each boundary resolves
      await Effect.runPromise(
        Stream.runForEach(renderStream(), (chunk) =>
          Effect.sync(() => {
            res.write(chunk);
          }),
        ),
      );

      // Write the suffix (closing tags + client-side script module).
      res.write(after);
      res.end();
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      // If we haven't started writing yet we can still send a 500.
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end((error as Error).stack);
    }
  });
});

server.listen(PORT, () => {
  console.log(`suspense demo running at http://localhost:${PORT}`);
  console.log(`observe streaming: curl -N --no-buffer http://localhost:${PORT}`);
});
