import * as assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder, createServer, type Logger } from "vite-plus";
import { afterAll, beforeAll, describe, test } from "vite-plus/test";
import { weft, type WeftOptions } from "~/index";

// Spec: `weft-plugin.specs.md`, V2a and V30 to V44. Criteria that say "nothing
// changes" (V38, V39, V44, dev under V2a) are asserted inside tests that also
// assert new behavior, so no test here passes before the feature exists.

const FIXTURES = fileURLToPath(new URL("./__tests__/fixtures", import.meta.url));
// Each test file owns a subdirectory, since files run in parallel and clean up after themselves.
const TMP = fileURLToPath(new URL("../.test-tmp/prerender", import.meta.url));

let copies = 0;

/** Copies a fixture to a scratch directory inside the package, so bare imports still resolve. */
const copyFixture = async (name: string): Promise<string> => {
  copies += 1;
  const root = join(TMP, `${name}-${process.pid}-${copies}`);
  await mkdir(TMP, { recursive: true });
  await cp(join(FIXTURES, name), root, { recursive: true });
  return root;
};

/** A Vite logger that records info lines and stays quiet. */
const recordingLogger = (lines: string[]): Logger => ({
  hasWarned: false,
  info: (message) => {
    lines.push(message);
  },
  warn: () => {},
  warnOnce: () => {},
  error: () => {},
  clearScreen: () => {},
  hasErrorLogged: () => false,
});

/**
 * Runs the app build with the fixture's phase marker set to "build", so a page
 * rendered here can be told apart from one rendered later by the spawned server.
 */
const buildApp = async (root: string, options?: WeftOptions): Promise<readonly string[]> => {
  const lines: string[] = [];
  process.env["WEFT_FIXTURE_PHASE"] = "build";
  try {
    const builder = await createBuilder({
      root,
      configFile: false,
      logLevel: "info",
      customLogger: recordingLogger(lines),
      plugins: [weft(options)],
    });
    await builder.buildApp();
  } finally {
    delete process.env["WEFT_FIXTURE_PHASE"];
  }
  return lines;
};

/** Polls `check` until it stops throwing or the deadline passes. */
const eventually = async <A>(check: () => Promise<A>, timeoutMs = 20_000): Promise<A> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
};

/** Asks the OS for a free TCP port. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address !== null && typeof address === "object" ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

/** Replaces the fixture's extra routes, to add one that breaks prerendering. */
const writeExtraRoutes = (root: string, source: string): Promise<void> =>
  writeFile(join(root, "src/extra-routes.ts"), source);

const read = (root: string, file: string): Promise<string> => readFile(join(root, file), "utf8");

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('weft(): prerender with output "server"', () => {
  let root: string;
  let logs: readonly string[];
  let child: ChildProcess | undefined;
  let origin: string;

  beforeAll(async () => {
    root = await copyFixture("prerender");
    logs = await buildApp(root);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // The server process has no phase marker, so its live renders say "runtime".
    const { WEFT_FIXTURE_PHASE: _phase, ...env } = process.env;
    child = spawn(process.execPath, ["dist/server/main.js"], {
      cwd: root,
      env: { ...env, PORT: String(port), NODE_ENV: "production" },
      stdio: "ignore",
    });
    await eventually(async () => {
      assert.equal((await fetch(`${origin}/about`)).status, 200);
    });
  }, 120_000);

  afterAll(() => {
    child?.kill();
  });

  test("V30/V36/V39: declared routes are written into dist/client as {path}/index.html, and nothing else", async () => {
    for (const file of [
      "index.html",
      "slow/index.html",
      "docs/intro/index.html",
      "docs/guide/index.html",
    ]) {
      assert.ok(existsSync(join(root, "dist/client", file)), `${file} is missing`);
    }
    // `about` declares nothing, so "server" output leaves it live.
    assert.ok(!existsSync(join(root, "dist/client/about/index.html")));
    assert.ok(!existsSync(join(root, "dist/static")));

    // V39: an app with no prerender declarations builds no HTML at all.
    const plain = await copyFixture("basic");
    await buildApp(plain);
    assert.ok(!existsSync(join(plain, "dist/client/index.html")));
    assert.ok(!existsSync(join(plain, "dist/static")));
  }, 120_000);

  test("V31: a prerendered page is the full response, with hashed assets and streamed patches", async () => {
    const home = await read(root, "dist/client/index.html");
    assert.ok(home.startsWith("<!DOCTYPE html>"));
    assert.ok(home.includes("home phase:build"));
    assert.match(home, /<script type="module" src="\/assets\/[^"]+\.js"><\/script>/);
    assert.match(home, /<link rel="stylesheet" href="\/assets\/[^"]+\.css">/);
    assert.ok(!home.includes("/@vite/client"));

    // The Suspense patch that streams after the shell is part of the file.
    const slow = await read(root, "dist/client/slow/index.html");
    assert.ok(slow.includes("shell-fallback"));
    assert.ok(slow.includes("slow-content"));

    // The param route was rendered once per declared param.
    assert.ok((await read(root, "dist/client/docs/intro/index.html")).includes("doc intro"));
    assert.ok((await read(root, "dist/client/docs/guide/index.html")).includes("doc guide"));
  });

  test("V34: the build logs each path it writes", () => {
    const output = logs.join("\n");
    for (const path of ["/", "/slow", "/docs/intro", "/docs/guide"]) {
      assert.ok(
        logs.some((line) => line.includes("prerender") && new RegExp(`${path}(\\s|$)`).test(line)),
        `no log line for ${path} in:\n${output}`,
      );
    }
  });

  test("V37/V38: StaticAssets answers prerendered paths from their files; other paths render live", async () => {
    const home = await fetch(`${origin}/`);
    assert.equal(home.status, 200);
    assert.ok((home.headers.get("content-type") ?? "").includes("text/html"));
    const body = await home.text();
    // The file's bytes, rendered at build time: the component did not run for this request.
    assert.equal(body, await read(root, "dist/client/index.html"));
    assert.ok(body.includes("home phase:build"));

    // A query string and a trailing slash do not change the match.
    assert.equal(await (await fetch(`${origin}/?utm=1`)).text(), body);
    const doc = await (await fetch(`${origin}/docs/intro/`)).text();
    assert.equal(doc, await read(root, "dist/client/docs/intro/index.html"));

    // V38: everything that was not prerendered still renders live.
    assert.ok((await (await fetch(`${origin}/about`)).text()).includes("about phase:runtime"));
    assert.ok(
      (await (await fetch(`${origin}/docs/other`)).text()).includes("doc other phase:runtime"),
    );
    const missing = await fetch(`${origin}/missing`);
    assert.equal(missing.status, 404);
    assert.ok((await missing.text()).includes("404: not found"));
  });
});

describe('weft(): prerender with output "static"', () => {
  let root: string;
  let site: Server | undefined;
  let origin: string;

  beforeAll(async () => {
    root = await copyFixture("prerender");
    // V42: a leftover from an earlier build must not survive this one.
    await mkdir(join(root, "dist/static/removed"), { recursive: true });
    await writeFile(join(root, "dist/static/removed/index.html"), "stale");
    await buildApp(root, { output: "static" });

    // A deliberately dumb file server: directory index, content type by extension, nothing else.
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".txt": "text/plain",
    };
    site = createHttpServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      const file = join(
        root,
        "dist/static",
        pathname.endsWith("/") ? `${pathname}index.html` : pathname,
      );
      readFile(file).then(
        (bytes) => {
          res.writeHead(200, {
            "content-type": types[extname(file)] ?? "application/octet-stream",
          });
          res.end(bytes);
        },
        () => {
          res.writeHead(404);
          res.end();
        },
      );
    });
    const port = await freePort();
    await new Promise<void>((resolve) => site!.listen(port, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(() => {
    site?.close();
  });

  test("V2a/V40/V44: dist/static holds the client files plus one page per path; client, server and dev are unchanged", async () => {
    // Param-less routes are prerendered by default here, so `about` is included.
    for (const file of [
      "index.html",
      "about/index.html",
      "slow/index.html",
      "docs/intro/index.html",
      "docs/guide/index.html",
      "robots.txt",
    ]) {
      assert.ok(existsSync(join(root, "dist/static", file)), `${file} is missing`);
    }
    const assets = await readdir(join(root, "dist/static/assets"));
    assert.ok(assets.some((file) => file.endsWith(".js")));
    assert.ok(assets.some((file) => file.endsWith(".css")));
    assert.ok(!existsSync(join(root, "dist/static/.vite")));

    // V44: the other outputs are still emitted, and the client directory gains no pages.
    assert.ok(existsSync(join(root, "dist/client/.vite/manifest.json")));
    assert.ok(existsSync(join(root, "dist/server/main.js")));
    assert.ok(!existsSync(join(root, "dist/client/index.html")));

    // V2a: `output` only affects builds. Dev renders live.
    const dev = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [weft({ output: "static" })],
      server: { host: "127.0.0.1", port: 0 },
      optimizeDeps: { noDiscovery: true },
    });
    try {
      await dev.listen();
      const address = dev.httpServer!.address();
      assert.ok(address !== null && typeof address === "object");
      const live = await (await fetch(`http://127.0.0.1:${address.port}/`)).text();
      assert.ok(live.includes("home phase:runtime"));
    } finally {
      await dev.close();
    }
  });

  test("V41: 404.html is the app's not-found page", async () => {
    const page = await read(root, "dist/static/404.html");
    assert.ok(page.startsWith("<!DOCTYPE html>"));
    assert.ok(page.includes("404: not found"));
  });

  test("V42: dist/static is emptied first, so removed pages do not linger", () => {
    assert.ok(existsSync(join(root, "dist/static/index.html")));
    assert.ok(!existsSync(join(root, "dist/static/removed")));
  });

  test("V43: a plain static file server serves every page with assets that resolve", async () => {
    for (const path of ["/", "/about/", "/slow/", "/docs/intro/", "/docs/guide/"]) {
      const res = await fetch(`${origin}${path}`);
      assert.equal(res.status, 200, path);
      const body = await res.text();
      assert.ok(body.includes("phase:build") || body.includes("slow-content"), path);
      const assets = [...body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
        (match) => match[1]!,
      );
      assert.ok(assets.length >= 2, `${path} references no assets`);
      for (const asset of assets) {
        const file = await fetch(`${origin}${asset}`);
        assert.equal(file.status, 200, `${path} → ${asset}`);
        await file.arrayBuffer();
      }
    }
  });
});

describe("weft(): prerender failures fail the build", () => {
  test('V33: an undeclared param route under output "static" fails, naming the route', async () => {
    const root = await copyFixture("prerender");
    await writeExtraRoutes(
      root,
      [
        `import { h } from "@weftui/core";`,
        `import { Router } from "@weftui/router";`,
        `import { Schema } from "effect";`,
        `export const extraRoutes = [`,
        `  Router.route("users/:id", { path: { id: Schema.String }, component: () => h.h1("user") }),`,
        `];`,
      ].join("\n"),
    );
    await assert.rejects(buildApp(root, { output: "static" }), (error: Error) => {
      assert.ok(error.message.includes("/users/:id"), error.message);
      return true;
    });
    // No partial output that looks like success.
    assert.ok(!existsSync(join(root, "dist/static/index.html")));
  }, 120_000);

  test("V33: a failing prerender Effect fails the build, naming the route", async () => {
    const root = await copyFixture("prerender");
    await writeExtraRoutes(
      root,
      [
        `import { h } from "@weftui/core";`,
        `import { Router } from "@weftui/router";`,
        `import { Effect, Schema } from "effect";`,
        `export const extraRoutes = [`,
        `  Router.route("posts/:slug", {`,
        `    path: { slug: Schema.String },`,
        `    component: () => h.h1("post"),`,
        `    prerender: Effect.fail(new Error("cms unreachable")),`,
        `  }),`,
        `];`,
      ].join("\n"),
    );
    await assert.rejects(buildApp(root), (error: Error) => {
      assert.ok(error.message.includes("/posts/:slug"), error.message);
      return true;
    });
    assert.ok(!existsSync(join(root, "dist/client/index.html")));
  }, 120_000);

  test("V32: a page that responds with an error status fails the build, naming path and status", async () => {
    const root = await copyFixture("prerender");
    await writeExtraRoutes(
      root,
      [
        `import { Router } from "@weftui/router";`,
        `import { Effect } from "effect";`,
        `export const extraRoutes = [`,
        `  Router.route("broken", {`,
        `    component: () => Effect.die(new Error("render boom")),`,
        `    prerender: true,`,
        `  }),`,
        `];`,
      ].join("\n"),
    );
    await assert.rejects(buildApp(root), (error: Error) => {
      assert.ok(error.message.includes("/broken"), error.message);
      assert.ok(error.message.includes("500"), error.message);
      return true;
    });
    // Nothing was written, including the pages that would have rendered fine.
    assert.ok(!existsSync(join(root, "dist/client/index.html")));
  }, 120_000);

  test("V32a: a param that would escape the output directory fails the build", async () => {
    const root = await copyFixture("prerender");
    await writeExtraRoutes(
      root,
      [
        `import { h } from "@weftui/core";`,
        `import { Router } from "@weftui/router";`,
        `import { Schema } from "effect";`,
        `export const extraRoutes = [`,
        `  Router.route("esc/:slug", {`,
        `    path: { slug: Schema.String },`,
        `    component: () => h.h1("escape"),`,
        `    prerender: [{ slug: "../../escaped" }],`,
        `  }),`,
        `];`,
      ].join("\n"),
    );
    await assert.rejects(buildApp(root, { output: "static" }), (error: Error) => {
      assert.ok(error.message.includes("/esc/"), error.message);
      assert.ok(error.message.includes("outside the output directory"), error.message);
      return true;
    });
    assert.ok(!existsSync(join(root, "dist/escaped")));
    assert.ok(!existsSync(join(root, "dist/static/index.html")));
  }, 120_000);

  test('V39a: under output "server", a build with no declarations never builds the app Layer', async () => {
    const probe = globalThis as { __weftFixtureProbe?: { acquired: number; released: number } };
    delete probe.__weftFixtureProbe;
    // The `basic` fixture's Layer counts every acquisition of its scoped resource.
    await buildApp(await copyFixture("basic"));
    assert.deepEqual(probe.__weftFixtureProbe, { acquired: 0, released: 0 });

    delete probe.__weftFixtureProbe;
  }, 120_000);

  test('V35: under output "static", a server entry with no router Layer fails the build', async () => {
    const root = await copyFixture("custom");
    await assert.rejects(
      buildApp(root, { output: "static", server: "app/server.ts", client: "app/client.ts" }),
      (error: Error) => {
        assert.ok(error.message.includes("RouterServer.layer"), error.message);
        return true;
      },
    );
  }, 120_000);
});
