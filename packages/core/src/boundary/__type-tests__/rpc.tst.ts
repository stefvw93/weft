import { expect, test } from "tstyche";
import {
  Boundary,
  ServerTag,
  Subscribable,
  type AssertNoServerOnly,
  type Node,
} from "@weftui/core";
import { Effect, Option, Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";

// ── Type helpers ────────────────────────────────────────────────────────────

type CtxOf<T> = [T] extends [Effect.Effect<any, any, infer R>] ? R : never;

// ── Fixtures ─────────────────────────────────────────────────────────────────

class FooError extends Schema.TaggedErrorClass<FooError>()("Foo", { msg: Schema.String }) {}

const StockKey = Schema.Struct({ id: Schema.Number });
const Stock = Schema.Struct({ units: Schema.Number });
type StockType = typeof Stock.Type;
type StockKeyType = typeof StockKey.Type;

// An rpc that cannot fail (Error<R> = never) and one that can.
const GetStock = Rpc.make("GetStock", { payload: StockKey, success: Stock });
const GetStockE = Rpc.make("GetStockE", { payload: StockKey, success: Stock, error: FooError });

// A server-only service used only to prove a leak into `render` is preserved in R.
class Database extends ServerTag("Database")<Database, { readonly q: () => StockType }>() {}
const dbUse = Database.pipe(Effect.map((db) => db.q()));
type DatabaseReq = CtxOf<typeof dbUse>;

// A plain (non-server) service that may legitimately appear in client R.
interface ClientService {
  readonly _tag: "ClientService";
}

declare const staticNode: Node<never, never>;
declare const clientNode: Node<never, ClientService>;
declare const dbNode: Node<never, DatabaseReq>;
declare const erroringNode: Node<FooError, never>;

// ── Success/Payload inferred from the Rpc schemas ─────────────────────────────

test("Success/Payload inferred from the Rpc schemas", () => {
  // `render` receives a Resource<Success<R>> (Stock), not the bare payload/key.
  Boundary.rpc(
    GetStock,
    () => ({ id: 1 }),
    (resource) => {
      expect(resource.value).type.toBe<Subscribable.Subscribable<StockType>>();
      expect(resource.pending).type.toBe<Subscribable.Subscribable<boolean>>();
      expect(resource.error).type.toBe<Subscribable.Subscribable<Option.Option<unknown>>>();
      expect(resource.refetch).type.toBe<Effect.Effect<void>>();
      return staticNode;
    },
  );

  // `render`'s arg is a Resource<Success>, not the bare Success.
  expect(Boundary.rpc).type.not.toBeCallableWith(
    GetStock,
    () => ({ id: 1 }),
    (_data: StockType) => staticNode,
  );
});

// ── payload thunk must return the rpc's payload type (StockKey) ────────────────

test("payload thunk must return the rpc's payload type (StockKey)", () => {
  // Correct payload shape compiles.
  Boundary.rpc(
    GetStock,
    (): StockKeyType => ({ id: 1 }),
    (_r) => staticNode,
  );

  // payload thunk must return { id: number }, not { id: string }
  expect(Boundary.rpc).type.not.toBeCallableWith(
    GetStock,
    () => ({ id: "1" }),
    (_r: unknown) => staticNode,
  );

  // payload thunk must return the rpc payload, not an unrelated shape
  expect(Boundary.rpc).type.not.toBeCallableWith(
    GetStock,
    () => ({ wrong: true }),
    (_r: unknown) => staticNode,
  );
});

// ── Output channels: render's E | Rpc.Error<R> ; context = render's R ──────────

test("Output channels: render's E | Rpc.Error<R> ; context = render's R", () => {
  // No rpc error, static render → Node<never, never>.
  expect(
    Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      (_r) => staticNode,
    ),
  ).type.toBe<Node<never, never>>();

  // rpc error joins the output error channel.
  expect(
    Boundary.rpc(
      GetStockE,
      () => ({ id: 1 }),
      (_r) => staticNode,
    ),
  ).type.toBe<Node<FooError, never>>();

  // render's own error joins the output error channel.
  expect(
    Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      (_r) => erroringNode,
    ),
  ).type.toBe<Node<FooError, never>>();

  // render's R passes through untouched (no Exclude).
  expect(
    Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      (_r) => clientNode,
    ),
  ).type.toBe<Node<never, ClientService>>();

  // A server-branded tag leaking into `render` is preserved in R (NOT erased), so
  // `hydrate` can later reject it via AssertNoServerOnly.
  const _leak = Boundary.rpc(
    GetStock,
    () => ({ id: 1 }),
    (_r) => dbNode,
  );
  expect<Node.Context<typeof _leak>>().type.toBe<DatabaseReq>();
});

// ── AssertNoServerOnly: passes clean R, rejects leaked server tags ────────────

test("AssertNoServerOnly: passes clean R, rejects leaked server tags", () => {
  expect<AssertNoServerOnly<ClientService>>().type.toBe<ClientService>();
  expect<AssertNoServerOnly<never>>().type.toBe<never>();
  // A leaked server tag does NOT pass through unchanged (resolves to the sentinel).
  expect<AssertNoServerOnly<DatabaseReq>>().type.not.toBe<DatabaseReq>();
});

// ── options.fallback is optional ──────────────────────────────────────────────

test("options.fallback is optional", () => {
  Boundary.rpc(
    GetStock,
    () => ({ id: 1 }),
    (_r) => staticNode,
    {
      fallback: staticNode,
    },
  );
  Boundary.rpc(
    GetStock,
    () => ({ id: 1 }),
    (_r) => staticNode,
    {},
  );
});
