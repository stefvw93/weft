import { Context } from "effect";

/**
 * Type-level marker stamped onto the identifier of a {@link ServerTag}. It never
 * exists at runtime (only its `typeof` is referenced by {@link ServerOnly}), so
 * the brand is purely a compile-time discriminator for {@link AssertNoServerOnly}.
 */
declare const ServerOnlyTypeId: unique symbol;

/**
 * Brand intersected into a {@link ServerTag}'s identifier. Any requirement `R`
 * that contains a value of this type carries a server-only dependency, which
 * {@link AssertNoServerOnly} rejects when `R` reaches client code (`hydrate`).
 */
export interface ServerOnly {
  readonly [ServerOnlyTypeId]: typeof ServerOnlyTypeId;
}

/**
 * Compile-error sentinel returned by {@link AssertNoServerOnly} when a
 * server-only dependency leaks into a client requirement channel. It is a string
 * literal type (not a tag the user can satisfy) so that constraining `R` against
 * it surfaces a readable error at the call site.
 */
export type ServerOnlyLeak =
  "A server-only Tag (ServerTag) leaked into the client requirement channel R. Discharge it on the server via Boundary.server's `provide`.";

/**
 * A `Context.Service` key whose identifier carries the {@link ServerOnly} brand.
 *
 * Use it exactly like `Context.Service` for services that must only ever be
 * provided on the server (e.g. a database handle behind a `Boundary.server`
 * `load`):
 *
 * ```ts
 * class Database extends ServerTag("Database")<Database, DatabaseShape>() {}
 * ```
 *
 * The brand rides along in the requirement channel `R` of any effect that uses
 * the tag. {@link Boundary.server}'s required `provide` discharges it on the
 * server, and {@link AssertNoServerOnly} rejects it should it ever reach
 * `hydrate` on the client.
 */
export const ServerTag =
  <const Id extends string>(id: Id) =>
  <Self, Shape>(): Context.ServiceClass<Self & ServerOnly, Id, Shape> =>
    Context.Service<Self, Shape>()(id) as unknown as Context.ServiceClass<
      Self & ServerOnly,
      Id,
      Shape
    >;

/**
 * Passes `R` through unchanged when it contains no {@link ServerOnly} dependency,
 * or resolves to the {@link ServerOnlyLeak} compile-error sentinel when it does.
 *
 * Applied to the requirement channel of `hydrate`'s app node so that a
 * server-only `ServerTag` accidentally referenced in client (`render`) code is a
 * compile error rather than a silent runtime failure.
 */
export type AssertNoServerOnly<R> = [Extract<R, ServerOnly>] extends [never] ? R : ServerOnlyLeak;
