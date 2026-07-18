// Pins the scope-aware `mountScoped` / `hydrateScoped` signatures:
//  - both require an ambient `Scope.Scope` in `R` (direct `runPromise` is a
//    compile error; wrapping in `Effect.scoped` discharges it),
//  - the success value is `MountHandle`,
//  - `mountScoped`'s error union excludes `HydrationMismatchError` while
//    `hydrateScoped`'s includes it,
//  - `hydrateScoped` keeps `hydrate`'s server-only leak guard (a leaked
//    `ServerTag` degrades the return type to the `ServerOnlyLeak` sentinel).
// Checked by `vp run check` (the package tsconfig includes `src`). See
// `hydrate.tst.ts` for the plain-`hydrate` counterpart.
import { expect, test } from "tstyche";
import { Boundary, ServerTag, h, type Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import type { HydrationMismatchError } from "~/data";
import type { MountHandle } from "../render";
import { hydrateScoped, mountScoped } from "../mount-scoped";

// ── Type helpers ──────────────────────────────────────────────────────────────

type CtxOf<T> = [T] extends [Effect.Effect<any, any, infer R>] ? R : never;
type ErrOf<T> = [T] extends [Effect.Effect<any, infer E, any>] ? E : never;
type OkOf<T> = [T] extends [Effect.Effect<infer A, any, any>] ? A : never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface ProductShape {
  readonly name: string;
}
const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String });
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });

class Database extends ServerTag("Database")<Database, { readonly q: () => ProductShape }>() {}

interface ClientService {
  readonly _tag: "ClientService";
}

declare const root: HTMLElement;
declare const clientNode: Node<never, ClientService>;
declare const dbNode: Node<never, CtxOf<typeof dbLoad>>;
const dbLoad = Database.pipe(Effect.map((db) => db.q()));

const mResult = mountScoped(h.div({}, "ok"), root);
const hResult = hydrateScoped(h.div({}, "ok"), root);

test("AC-S1: mountScoped requires Scope.Scope, yields MountHandle", () => {
  // Scope.Scope is in the requirement channel.
  expect<Scope.Scope>().type.toBeAssignableTo<CtxOf<typeof mResult>>();

  // Success value is MountHandle.
  expect<OkOf<typeof mResult>>().type.toBeAssignableTo<MountHandle>();

  // Scope.Scope unsatisfied: cannot run directly with runPromise
  expect(Effect.runPromise).type.not.toBeCallableWith(mResult);

  // Wrapping in Effect.scoped discharges Scope.Scope — runnable.
  void Effect.runPromise(Effect.scoped(mResult));
});

test("Error unions: mountScoped excludes, hydrateScoped includes HydrationMismatch", () => {
  expect<HydrationMismatchError>().type.not.toBeAssignableTo<ErrOf<typeof mResult>>();
  expect<HydrationMismatchError>().type.toBeAssignableTo<ErrOf<typeof hResult>>();
});

test("AC-S7: hydrateScoped requires Scope.Scope", () => {
  // Scope.Scope unsatisfied for hydrateScoped too
  expect(Effect.runPromise).type.not.toBeCallableWith(hResult);

  void Effect.runPromise(Effect.scoped(hResult));
});

test("AC-S7: hydrateScoped keeps the server-only leak guard", () => {
  // A clean (non-server) client requirement is allowed: hydrateScoped returns a
  // real Effect (not the ServerOnlyLeak sentinel).
  const clientResult = hydrateScoped(clientNode, root);
  expect(clientResult).type.toBeAssignableTo<Effect.Effect<any, any, any>>();

  // A server boundary with a clean render leaves R server-tag-free — runnable.
  const discharged = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    () => h.div({}, "ok"),
  );
  void Effect.runPromise(Effect.scoped(hydrateScoped(discharged, root)));

  // Back-compat: a raw Renderable string still hydrates in a scoped region.
  void Effect.runPromise(Effect.scoped(hydrateScoped("text", root)));

  // `dbNode`'s R carries the server-only Database brand: return type degrades to
  // the ServerOnlyLeak sentinel — not an Effect, so Effect.scoped rejects it even
  // though the Scope requirement would otherwise be satisfiable.
  // server-only Tag leaked into the client requirement channel R
  // @ts-expect-error is not assignable to parameter of type 'Effect<unknown, unknown, never>'
  void Effect.runPromise(Effect.scoped(hydrateScoped(dbNode, root)));

  // Same leak surfaced through a Boundary.rpc whose render references the tag.
  const leaky = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    (_r) => dbNode,
  );
  // server-only Tag leaked into the client requirement channel R
  // @ts-expect-error is not assignable to parameter of type 'Effect<unknown, unknown, never>'
  void Effect.runPromise(Effect.scoped(hydrateScoped(leaky, root)));
});
