// Pins the brand-aware `hydrate` signature: a server-only `ServerTag` left in the
// app node's requirement channel `R` (e.g. a `Boundary.rpc` tag accidentally
// referenced in client `render` code) must be a compile error, while clean nodes
// and back-compat `Renderable` inputs continue to hydrate. Checked by `vp run
// check` (the package tsconfig includes `src`). See
// `core/.../__type-tests__/rpc.tst.ts` for the underlying
// `AssertNoServerOnly` behaviour this relies on.
import { expect, test } from "tstyche";
import { Boundary, ServerTag, h, type Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Schema } from "effect";
import { hydrate } from "../render";

// ── Type helpers ──────────────────────────────────────────────────────────────

type CtxOf<T> = [T] extends [Effect.Effect<any, any, infer R>] ? R : never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface ProductShape {
  readonly name: string;
}
const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String });
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });

class Database extends ServerTag("Database")<Database, { readonly q: () => ProductShape }>() {}

// A plain (non-server) service that may legitimately appear in the client R.
interface ClientService {
  readonly _tag: "ClientService";
}

declare const root: HTMLElement;
declare const clientNode: Node<never, ClientService>;
declare const dbNode: Node<never, CtxOf<typeof dbLoad>>;
const dbLoad = Database.pipe(Effect.map((db) => db.q()));

test("Clean nodes hydrate (R free of server-only tags)", () => {
  // Static node — R = never.
  void Effect.runPromise(hydrate(h.div({}, "ok"), root));

  // A server boundary with a clean (server-tag-free) render leaves R = never — the
  // rpc handler lives server-side, never in the client requirement channel.
  const discharged = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    () => h.div({}, "ok"),
  );
  void Effect.runPromise(hydrate(discharged, root));

  // A plain (non-server) client requirement is allowed: hydrate returns a real
  // Effect (not the `ServerOnlyLeak` string sentinel), even though running it would
  // still require `ClientService` to be provided.
  const clientResult = hydrate(clientNode, root);
  expect(clientResult).type.toBeAssignableTo<Effect.Effect<any, any, any>>();

  // Back-compat: a raw `Renderable` (string) still hydrates.
  void Effect.runPromise(hydrate("text", root));
});

test("A leaked server-only tag is rejected", () => {
  // `dbNode`'s R carries the server-only `Database` brand: hydrate's return type
  // degrades to the `ServerOnlyLeak` sentinel, so it is not a runnable Effect.
  // server-only Tag leaked into the client requirement channel R
  expect(Effect.runPromise).type.not.toBeCallableWith(hydrate(dbNode, root));

  // Same leak surfaced through a `Boundary.rpc` whose `render` references the tag.
  const leaky = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    (_r) => dbNode,
  );
  // server-only Tag leaked into the client requirement channel R
  expect(Effect.runPromise).type.not.toBeCallableWith(hydrate(leaky, root));
});
