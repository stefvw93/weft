import * as assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createBuilder, createServer, type ViteDevServer } from "vite-plus";
import { afterAll, afterEach, beforeAll, describe, test } from "vite-plus/test";
import { weft, type WeftOptions } from "~/index";

// Spec: `weft-plugin.specs.md`. V20 is covered by `__type-tests__/weft-plugin.tst.ts`;
// V25 to V29 (example migration, docs) are verified at `/e2e` and `/document`.

const FIXTURES = fileURLToPath(new URL("./__tests__/fixtures", import.meta.url));
// Copies live inside the package so bare imports still resolve to its node_modules.
const TMP = fileURLToPath(new URL("../.test-tmp", import.meta.url));

let copies = 0;

/** Copies a fixture to a scratch directory, so tests can edit and build it freely. */
const copyFixture = async (name: string): Promise<string> => {
  copies += 1;
  const root = join(TMP, `${name}-${process.pid}-${copies}`);
  await mkdir(TMP, { recursive: true });
  await cp(join(FIXTURES, name), root, { recursive: true });
  return root;
};

interface Dev {
  readonly server: ViteDevServer;
  readonly url: string;
}

const running: ViteDevServer[] = [];

/** Starts a Vite dev server on a free port with the plugin as its only plugin. */
const startDev = async (root: string, options?: WeftOptions): Promise<Dev> => {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [weft(options)],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    // Vite's dependency discovery keeps `close` pending once a client module has
    // been requested (plain Vite does the same), which would stall every teardown.
    optimizeDeps: { noDiscovery: true },
  });
  running.push(server);
  await server.listen();
  const address = server.httpServer!.address();
  assert.ok(address !== null && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
};

/** Runs the app build the way `vite build` does once the plugin configures a builder. */
const buildApp = async (root: string, options?: WeftOptions): Promise<void> => {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [weft(options)],
  });
  await builder.buildApp();
};

/** Polls `check` until it stops throwing or the deadline passes. */
const eventually = async <A>(check: () => Promise<A>, timeoutMs = 8000): Promise<A> => {
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

interface Probe {
  acquired: number;
  released: number;
}
const globals = globalThis as { __weftFixtureProbe?: Probe; __weftFixtureMainRan?: boolean };

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
  delete globals.__weftFixtureProbe;
  delete globals.__weftFixtureMainRan;
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("weft(): configuration", () => {
  test("V1: with no options it serves the conventional src/entry-server.ts", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("hello from the server"));
  });

  test("V2/V5: `server` and `client` override the conventions, and `main` may be absent", async () => {
    const { url } = await startDev(await copyFixture("custom"), {
      server: "app/server.ts",
      client: "app/client.ts",
    });
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "custom-server");
  });

  test("V3: a missing server entry fails at startup, naming the path and the option", async () => {
    const root = await copyFixture("no-server");
    await assert.rejects(startDev(root), (error: unknown) => {
      const failure = error as { _tag?: string; entry?: string; path?: string; message: string };
      assert.equal(failure._tag, "WeftEntryNotFoundError");
      assert.equal(failure.entry, "server");
      assert.equal(failure.path, join(root, "src/entry-server.ts"));
      assert.ok(failure.message.includes(join(root, "src/entry-server.ts")));
      assert.ok(failure.message.includes("server"));
      return true;
    });
  });

  test("V3: a missing client entry fails at startup, naming the path and the option", async () => {
    const root = await copyFixture("no-client");
    await assert.rejects(startDev(root), (error: unknown) => {
      const failure = error as { _tag?: string; entry?: string; path?: string; message: string };
      assert.equal(failure._tag, "WeftEntryNotFoundError");
      assert.equal(failure.entry, "client");
      assert.equal(failure.path, join(root, "src/entry-client.ts"));
      assert.ok(failure.message.includes("client"));
      return true;
    });
  });

  test("V4: a default export that is not a Layer fails on the first request, naming the file", async () => {
    const root = await copyFixture("bad-export");
    const { url } = await startDev(root);
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 500);
    const body = await res.text();
    assert.ok(body.includes("WeftServerEntryExportError"));
    assert.ok(body.includes("src/entry-server.ts"));
    assert.ok(body.includes("default export"));
  });
});

describe("weft(): dev server", () => {
  test("V6: a page route returns server-rendered HTML with the route's status", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const about = await fetch(`${url}/about`);
    assert.equal(about.status, 200);
    assert.equal(about.headers.get("content-type"), "text/html; charset=utf-8");
    const body = await about.text();
    assert.ok(body.startsWith("<!DOCTYPE html>"));
    assert.ok(body.includes("About page"));

    // The app's own not-found page, not Vite's fallback.
    const missing = await fetch(`${url}/missing`);
    assert.equal(missing.status, 404);
    assert.ok((await missing.text()).includes("404: not found"));
  });

  test("V7: Vite's own requests are served by Vite and never reach the app", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const client = await fetch(`${url}/@vite/client`);
    assert.equal(client.status, 200);
    assert.ok((client.headers.get("content-type") ?? "").includes("javascript"));
    // Drain every body: an unread response keeps its socket open and stalls `close`.
    await client.arrayBuffer();

    const entry = await fetch(`${url}/src/entry-client.ts`);
    assert.equal(entry.status, 200);
    assert.ok((entry.headers.get("content-type") ?? "").includes("javascript"));
    await entry.arrayBuffer();

    const robots = await fetch(`${url}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.ok((await robots.text()).includes("User-agent"));
  });

  test("V8: non-HTML app responses pass through with status, headers and body", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const info = await fetch(`${url}/api/info`);
    assert.equal(info.status, 200);
    assert.equal(info.headers.get("x-fixture"), "info");
    assert.deepEqual(await info.json(), { ok: true });
  });

  test("V8: request bodies reach the app", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const echo = await fetch(`${url}/api/echo`, { method: "POST", body: "payload-123" });
    assert.equal(echo.status, 201);
    assert.equal(await echo.text(), "echo:payload-123");
  });

  test("V9: dev responses stream, shell first", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const res = await fetch(`${url}/slow`);
    assert.equal(res.status, 200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    assert.ok(first.includes("shell-fallback"));
    assert.ok(!first.includes("slow-content"));
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    assert.ok(rest.includes("slow-content"));
  });

  test("V10: editing a module the server entry imports shows on the next request", async () => {
    const root = await copyFixture("basic");
    const { url } = await startDev(root);
    assert.ok((await (await fetch(`${url}/`)).text()).includes("hello from the server"));

    await writeFile(join(root, "src/message.ts"), `export const message = "edited message";\n`);
    await eventually(async () => {
      assert.ok((await (await fetch(`${url}/`)).text()).includes("edited message"));
    });
  });

  test("V11: reloading the server entry disposes the previous Layer first", async () => {
    const root = await copyFixture("basic");
    const { url } = await startDev(root);
    await (await fetch(`${url}/`)).text();
    await (await fetch(`${url}/about`)).text();
    // One Layer serves every request until something changes.
    assert.deepEqual(globals.__weftFixtureProbe, { acquired: 1, released: 0 });

    await writeFile(join(root, "src/message.ts"), `export const message = "second build";\n`);
    await eventually(async () => {
      assert.ok((await (await fetch(`${url}/`)).text()).includes("second build"));
    });
    assert.deepEqual(globals.__weftFixtureProbe, { acquired: 2, released: 1 });
  });

  test("V11: closing the dev server disposes the Layer", async () => {
    const { server, url } = await startDev(await copyFixture("basic"));
    await (await fetch(`${url}/`)).text();
    await server.close();
    running.splice(running.indexOf(server), 1);
    assert.deepEqual(globals.__weftFixtureProbe, { acquired: 1, released: 1 });
  });

  test("V12: a server entry that fails to load returns a 500 pointing at the source file", async () => {
    const root = await copyFixture("basic");
    await writeFile(
      join(root, "src/message.ts"),
      `export const message: string = (() => {\n  throw new Error("load boom");\n})();\n`,
    );
    const { url } = await startDev(root);
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 500);
    const body = await res.text();
    assert.ok(body.includes("load boom"));
    assert.ok(body.includes("src/message.ts"));
  });

  test("V12: a render failure passes through as the app's own 500", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const res = await fetch(`${url}/broken`);
    assert.equal(res.status, 500);
    await res.arrayBuffer();
  });

  test("V13: `main` is never executed in dev", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    await (await fetch(`${url}/`)).text();
    assert.equal(globals.__weftFixtureMainRan, undefined);
  });
});

describe("weft(): assets module in dev", () => {
  test("V14/V15: ClientAssets renders Vite's client and the client entry source", async () => {
    const { url } = await startDev(await copyFixture("basic"));
    const body = await (await fetch(`${url}/`)).text();
    const head = body.slice(0, body.indexOf("</head>"));
    assert.ok(head.includes('<script type="module" src="/@vite/client"></script>'));
    assert.ok(head.includes('<script type="module" src="/src/entry-client.ts"></script>'));
  });

  test("V15: the client entry path follows the `client` option", async () => {
    const root = await copyFixture("basic");
    await cp(join(root, "src/entry-client.ts"), join(root, "src/browser.ts"));
    const { url } = await startDev(root, { client: "src/browser.ts" });
    const body = await (await fetch(`${url}/`)).text();
    assert.ok(body.includes('src="/src/browser.ts"'));
    assert.ok(!body.includes("/src/entry-client.ts"));
  });

  test("V17: StaticAssets registers nothing in dev and needs no platform services", async () => {
    const { server } = await startDev(await copyFixture("basic"));
    const assets = (await server.ssrLoadModule("virtual:weft/assets")) as {
      StaticAssets: Layer.Layer<never, never, HttpRouter.HttpRouter>;
    };
    // Checked on a copy: `isLayer` is a type guard and would widen the typed binding.
    const candidate: unknown = assets.StaticAssets;
    assert.ok(Layer.isLayer(candidate));
    // An empty Layer builds with only a router in context: no FileSystem, Path or HttpPlatform.
    const built = Layer.provide(assets.StaticAssets, HttpRouter.layer);
    await Effect.runPromise(Effect.scoped(Layer.build(built)));
  });
});

describe("weft(): build", () => {
  let root: string;
  let port: number;
  let child: ChildProcess | undefined;
  let origin: string;

  beforeAll(async () => {
    root = await copyFixture("basic");
    await buildApp(root);
    port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // No Vite in this process: only Node and the built server bundle.
    child = spawn(process.execPath, ["dist/server/main.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
      stdio: "ignore",
    });
    await eventually(async () => {
      assert.equal((await fetch(`${origin}/about`)).status, 200);
    }, 20_000);
  }, 120_000);

  afterAll(() => {
    child?.kill();
  });

  /** Every `src`/`href` the built page's head refers to. */
  const headAssets = async (): Promise<readonly string[]> => {
    const body = await (await fetch(`${origin}/`)).text();
    const head = body.slice(0, body.indexOf("</head>"));
    return [...head.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
  };

  test("V21/V24: one build emits dist/client with a manifest and dist/server, side by side", async () => {
    assert.ok(existsSync(join(root, "dist/client/.vite/manifest.json")));
    assert.ok(existsSync(join(root, "dist/server/main.js")));
    const clientFiles = await readdir(join(root, "dist/client/assets"));
    assert.ok(clientFiles.some((file) => file.endsWith(".js")));
    assert.ok(clientFiles.some((file) => file.endsWith(".css")));
  });

  test("V22: `node dist/server/main.js` serves pages with no Vite in the process", async () => {
    const res = await fetch(`${origin}/about`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("About page"));
    assert.ok(!body.includes("/@vite/client"));
    assert.equal((await fetch(`${origin}/missing`)).status, 404);
  });

  test("V16: ClientAssets renders the hashed client entry and its stylesheet", async () => {
    const assets = await headAssets();
    const scripts = assets.filter((asset) => asset.endsWith(".js"));
    const styles = assets.filter((asset) => asset.endsWith(".css"));
    assert.equal(scripts.length, 1);
    assert.equal(styles.length, 1);
    assert.match(scripts[0]!, /^\/assets\/.+-[\w-]{8,}\.js$/);
    assert.match(styles[0]!, /^\/assets\/.+-[\w-]{8,}\.css$/);

    const manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Record<string, { file: string; css?: string[] }>;
    const entry = manifest["src/entry-client.ts"]!;
    assert.equal(scripts[0], `/${entry.file}`);
    assert.deepEqual(
      styles,
      (entry.css ?? []).map((file) => `/${file}`),
    );
  });

  test("V23: the built page references only files that exist in dist/client", async () => {
    const assets = await headAssets();
    assert.ok(assets.length >= 2);
    for (const asset of assets) {
      assert.ok(existsSync(join(root, "dist/client", asset)), `${asset} is missing`);
    }
  });

  test("V18: StaticAssets serves built files with content types and immutable caching", async () => {
    for (const asset of await headAssets()) {
      const res = await fetch(`${origin}${asset}`);
      assert.equal(res.status, 200, asset);
      const type = res.headers.get("content-type") ?? "";
      assert.ok(asset.endsWith(".css") ? type.includes("text/css") : type.includes("javascript"));
      assert.ok((res.headers.get("cache-control") ?? "").includes("immutable"), asset);
      await res.arrayBuffer();
    }
    // Unhashed `public/` files are served too, without the immutable header.
    const robots = await fetch(`${origin}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.ok(!(robots.headers.get("cache-control") ?? "").includes("immutable"));
  });

  test("V19: StaticAssets never serves the manifest or a path outside dist/client", async () => {
    const manifest = await fetch(`${origin}/.vite/manifest.json`);
    assert.notEqual(manifest.status, 200);
    await manifest.arrayBuffer();

    for (const path of [
      "/..%2fserver/main.js",
      "/%2e%2e/server/main.js",
      "/assets/..%2f..%2fserver/main.js",
    ]) {
      const res = await fetch(`${origin}${path}`);
      const body = await res.text();
      assert.notEqual(res.status, 200, path);
      assert.ok(!body.includes("NodeHttpServer"), path);
    }
  });

  test("V5: without `main` the server build emits the routes Layer only", async () => {
    const custom = await copyFixture("custom");
    await buildApp(custom, { server: "app/server.ts", client: "app/client.ts" });
    assert.ok(existsSync(join(custom, "dist/client/.vite/manifest.json")));
    const serverFiles = await readdir(join(custom, "dist/server"));
    assert.ok(serverFiles.includes("server.js"));
    assert.ok(!serverFiles.includes("main.js"));
  }, 120_000);
});
