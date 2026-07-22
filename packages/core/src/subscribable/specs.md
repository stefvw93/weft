# Subscribable (data-first)

## Overview & Purpose

`Subscribable<A, E, R>` is Weft's readable reactive handle: a current value plus a stream of changes. Effect 4 removed the upstream `Subscribable` module, so Weft owns this one.

This spec makes the API data-first, matching Effect 4 conventions. The public interface is brand-only. Reads go through module accessors: `Subscribable.get(x)` and `Subscribable.changes(x)`. Member access (`x.get`, `x.changes`) becomes a type error. This is a breaking change to the `@weftui/core` public API.

## Acceptance Criteria

- [ ] `Subscribable<out A, out E = never, out R = never>` is brand-only: its sole member is `readonly [TypeId]: Variance<A, E, R>`.
- [ ] `Variance<out A, out E, out R>` is exported and carries phantom `Types.Covariant` fields for all three channels.
- [ ] `TypeId` is exported as the literal `"~@weftui/core/Subscribable"` (value and type).
- [ ] `make({ get, changes })` accepts an `Effect.Effect<A, E, R>` and a `Stream.Stream<A, E, R>` and returns `Subscribable<A, E, R>`. Options-object signature unchanged from the previous surface.
- [ ] `get(self)` returns the underlying `Effect.Effect<A, E, R>`.
- [ ] `changes(self)` returns the underlying `Stream.Stream<A, E, R>`.
- [ ] `isSubscribable(u)` is a type guard for `Subscribable<unknown, unknown, unknown>` using `Predicate.hasProperty(u, TypeId)`. Runtime shape is unchanged: `make` still stamps the `TypeId` string, so existing guards keep working.
- [ ] Member access `x.get` and `x.changes` on the public `Subscribable` type is a compile error.
- [ ] Covariance holds on all three channels: `Subscribable<Narrow, E1, R1>` is assignable to `Subscribable<Wide, E1 | E2, R1 | R2>`; the reverse is rejected.
- [ ] All consumers across the workspace (core, dom, router, examples, tests) read via the module accessors and compile green.

## Technical Requirements

- Internal `SubscribableImpl` (not exported) keeps `get`/`changes` as data fields; `toImpl` cast is confined to the module.
- Casts appear only in `make` and `toImpl` (the "smarter than the compiler" allowance).
- No `Pipeable`; the repo prefers standalone `pipe`.
- Variance encoding matches installed `effect@4.0.0-beta.98`: `Types.Covariant<X> = (_: never) => X` phantom fields plus `out` modifiers.

## Expected Behavior & Edge Cases

- `isSubscribable` narrowing must not break union flows: after narrowing, the value stays usable where a wider `Subscribable` is expected (load-bearing at `packages/core/src/source/source.ts` identity branch).
- `make` does not manage subscription lifecycle: callers own hot/cold semantics of the provided stream.

## Workflow Notes

e2e: not applicable, API-shape change only (accessor call sites); runtime behavior unchanged and already covered by existing example browser tests run green in this cycle.

- Spec approved via plan file `~/.claude/plans/subscribable-was-removed-from-shiny-wirth.md` (decisions user-confirmed there; interactive Q&A skipped in autonomous run).
