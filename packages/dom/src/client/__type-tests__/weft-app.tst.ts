// Pins the WeftApp public type surface: R/E inference from the app layer,
// self-contained mount (R = never, runnable via bare `Effect.runPromise`),
// hydrate's extra `HydrationMismatchError` + the brand-aware `ServerOnlyLeak`
// guard (ported from hydrate.tst.ts), the `errors` stream type, and the
// `app.runtime` ManagedRuntime typing. Assertions are evaluated by
// `vp run test:types` (TSTyche), not `vp run check`.
import { expect, test } from "tstyche";
import { Boundary, ServerTag, h, type Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Context, Data, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect";
import * as WeftApp from "../weft-app";

// ── Type helpers ──────────────────────────────────────────────────────────────

type CtxOf<T> = [T] extends [Effect.Effect<any, any, infer R>] ? R : never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

class Config extends Context.Service<Config, { readonly value: number }>()(
  "test/weft-app/Config",
) {}
class Dep extends Context.Service<Dep, { readonly dep: string }>()("test/weft-app/Dep") {}
class ConfigError extends Data.TaggedError("ConfigError")<{ readonly reason: string }> {}

declare const configLayer: Layer.Layer<Config, ConfigError, never>;
declare const layerWithDeps: Layer.Layer<Config, never, Dep>;
declare const root: HTMLElement;

// Server-only-leak fixtures (ported from hydrate.tst.ts).
interface ProductShape {
  readonly name: string;
}
const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String });
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });

class Database extends ServerTag("Database")<Database, { readonly q: () => ProductShape }>() {}

const dbLoad = Database.pipe(Effect.map((db) => db.q()));
declare const dbNode: Node<never, CtxOf<typeof dbLoad>>;

test("make() infers WeftApp<never, never>; make(layer) infers R/E", () => {
  expect(WeftApp.make()).type.toBe<WeftApp.WeftApp<never, never>>();
  expect(WeftApp.make(configLayer)).type.toBe<WeftApp.WeftApp<Config, ConfigError>>();

  // The app layer must be self-contained: a layer with unmet requirements is
  // rejected at `make`.
  expect(WeftApp.make).type.not.toBeCallableWith(layerWithDeps);
});

test("app.runtime is the app-typed ManagedRuntime", () => {
  const app = WeftApp.make(configLayer);
  expect(app.runtime).type.toBe<ManagedRuntime.ManagedRuntime<Config, ConfigError>>();
});

test("mount is self-contained: R = never, error channel E | MountError", () => {
  const plain = WeftApp.make();
  const mounted = WeftApp.mount(plain, h.div({}, "ok"), root);
  expect(mounted).type.toBe<Effect.Effect<WeftApp.RootHandle, WeftApp.MountError>>();
  // Runnable with a bare runPromise: no Effect.provide needed.
  void Effect.runPromise(mounted);

  // The layer's error channel joins the mount error union.
  const app = WeftApp.make(configLayer);
  expect(WeftApp.mount(app, h.div({}, "ok"), root)).type.toBe<
    Effect.Effect<WeftApp.RootHandle, ConfigError | WeftApp.MountError>
  >();
});

test("hydrate adds HydrationMismatchError and stays runnable for clean nodes", () => {
  const app = WeftApp.make(configLayer);
  const hydrated = WeftApp.hydrate(app, h.div({}, "ok"), root);
  expect(hydrated).type.toBe<
    Effect.Effect<WeftApp.RootHandle, ConfigError | WeftApp.HydrateError>
  >();
  void Effect.runPromise(hydrated);

  // A server boundary with a clean (server-tag-free) render leaves R = never.
  const discharged = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    () => h.div({}, "ok"),
  );
  void Effect.runPromise(WeftApp.hydrate(WeftApp.make(), discharged, root));

  // Back-compat: a raw `Renderable` (string) still hydrates.
  void Effect.runPromise(WeftApp.hydrate(WeftApp.make(), "text", root));
});

test("a leaked server-only tag degrades hydrate to ServerOnlyLeak", () => {
  const app = WeftApp.make();
  // server-only Tag leaked into the client requirement channel R
  expect(Effect.runPromise).type.not.toBeCallableWith(WeftApp.hydrate(app, dbNode, root));

  // Same leak surfaced through a `Boundary.rpc` whose `render` references the tag.
  const leaky = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    (_r) => dbNode,
  );
  // server-only Tag leaked into the client requirement channel R
  expect(Effect.runPromise).type.not.toBeCallableWith(WeftApp.hydrate(app, leaky, root));
});

test("errors returns a never-failing, dependency-free stream", () => {
  const app = WeftApp.make(configLayer);
  expect(WeftApp.errors(app)).type.toBe<Stream.Stream<WeftApp.UnhandledError>>();
});

test("dispose returns a plain void Effect", () => {
  const app = WeftApp.make(configLayer);
  expect(WeftApp.dispose(app)).type.toBe<Effect.Effect<void>>();
});
