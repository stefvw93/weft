# Demo registry spec

## Overview & purpose

A registry of **live, interactive Weft components** that documentation pages can
mount inline to prove the library. Because the whole page is one SSR-rendered +
hydrated Weft tree, a demo is just a subtree. It needs no special island wiring;
it renders on the server and becomes interactive on hydrate.

## Public surface

```ts
// src/demos/index.ts
export const demos: ReadonlyMap<string, () => Node>;
export const getDemo: (id: string) => (() => Node) | undefined;
```

Each value is a zero-arg factory returning a Weft `Node` (so each mount gets a
fresh instance scope). Demo components live in `src/demos/*.ts`, one per file,
each with a JSDoc header describing what it demonstrates.

## v1 demos (website-local, curated)

Small, self-contained components mirroring the headline patterns, not the full
`examples/*` apps. Initial set:

- `reactive-counter`: `SubscriptionRef` signal + `.changes` stream driving text.
- `reactive-input`: controlled input, derived validation stream.
- (add more as docs reference them; ids are the markdown `demo=<id>` contract).

Each demo brings its own minimal styling via classes (no per-demo global CSS that
could leak).

## Acceptance criteria

- AC1: `getDemo(id)` returns the factory for a registered id, `undefined` otherwise.
- AC2: Each factory returns a fresh `Node` per call (independent instance state).
- AC3: Every id referenced by a `demo=<id>` block in `docs/**/*.md` exists in the
  registry (guard: a test asserts no dangling demo ids).
- AC4: Demos render under SSR and hydrate without mismatch; after hydrate they are
  interactive (covered by browser test).
- AC5: Registry is importable by both bundles (client + server), with no server-only
  or Node-only imports in demo modules.

## Forward compatibility

The registry contract (`id → () => Node`) is designed so a real `examples/*`
exported `App` can be registered later without changing the markdown `demo=`
contract. Not done in v1 (avoids adding 12 workspace deps).
