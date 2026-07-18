# Diffing Model — Checklist & Status

> Plan: [`diffing-model.plan.md`](./diffing-model.plan.md)
> Approved plan (archive): `~/.claude/plans/last-option-spec-discussion-to-abundant-wall.md`
> Branch: `perf/diffing-model` (currently even with `main`)

## Status summary

Design is locked via spec discussion. **Part A is complete** (scalar same-type patching:
SP1–SP4 in `updateStreamChild`, tests in `dom.test.ts`, `dom.specs.md` AC20 amended).
**Part B1 is complete** (`List.each` core API: `LIST` symbol + combinator in
`packages/core/src/combinator/list.ts`, exports, `list.specs.md`, type tests, and a
`list.test.ts` detection unit test). **Part B2 is complete** (client `renderList` +
`reconcileList` + `ItemRecord` + LIS moves in `render.ts`, per-item markers in
`shared.ts`, `client/list.test.ts`, `examples/keyed-list/`; 298 tests passing).
**Part B3 is complete** (hydratable server `LIST` region + per-item markers in
`server/render-to-stream.ts`, client `hydrateList` + flash-free first-emission adoption in
`render.ts`, `client/list.hydrate.test.ts`; 308 tests passing). The diffing-model work is
done.

Follow CLAUDE.md spec → mock → test → implement for each phase.

## Checklist

### Setup

- [x] Explore renderer, combinator API, node model, marker protocol, `Source` type
- [x] Spec discussion → final API (`List.each`, `of`, `by`, render-children shape)
- [x] Write plan (`diffing-model.plan.md`)

### Part A — scalar same-type patching (task #1, done)

- [x] Amend `dom.specs.md` AC20 → SP1–SP4
- [x] Add SP1/SP3/SP4 tests to `dom.test.ts` (new `AC20 SP1/SP3` block after the AC20 block)
- [x] Rework `updateStreamChild` (`render.ts`) for in-place patching (SP1/SP2 text,
      SP3 same-tag element reuse + positional child recursion / wholesale-rebuild fallback,
      SP4 fallback). Scope rotation stays caller-owned (`handleStreamChild`/`hydrateReactive`).
- [x] `vp check --fix` + `vp test` (281 passing)

### Part B1 — `List.each` core API + types (task #2, done)

- [x] `packages/core/src/combinator/list.ts` — `LIST` symbol + `List.each` namespace
      (`SourceValue`/`SourceError`/`SourceContext`/`ItemOf` helpers extract T/E/R from
      the `of` source; `render` constrained to `Node<CE, CR>` so item E/R propagate)
- [x] Export `List`, `LIST` from `packages/core/src/combinator/index.ts`
- [x] `combinator/list.specs.md` (API + E/R typing + identity ACs; render-once footgun)
- [x] `combinator/__type-tests__/list.tst.ts` (item inference, E/R propagation, `by` typing)
- [x] `combinator/list.test.ts` (detection / descriptor-shape unit test)
- [x] `vp check --fix` + `vp test` (284 passing)

### Part B2 — client renderList + reconcileList (task #3, done)

- [x] `listItemStartText`/`listItemEndText` + `parseListItemMarker` in `shared.ts`
      (distinct from `parseStreamMarker`, so `findMatchingEnd` steps over them)
- [x] `LIST` case in `renderNode` → `renderList` (region scope forked from the
      enclosing scope; `Source.toSubscribable` pump + subscription fork into it;
      failures routed to `BoundaryContext` like `handleStreamChild`)
- [x] `reconcileList` + `ItemRecord` (per-key persistent `Scope.fork`,
      `HashMap<K, ItemRecord>` + `order` array; KR1 dup-key fail, KR2 insert,
      KR3 reuse, KR4 remove + scope close, KR6 iterable materialization)
- [x] LIS-based minimal moves (KR5) — `longestIncreasingSubsequence` over retained
      items' previous indices; only non-LIS items re-inserted (right-to-left)
- [x] `client/list.specs.md` (KR/SC/HY ACs + render-once / index-key warning)
- [x] `client/list.test.ts` (MR1–3, KR1–6, SC1–3, ID1–2; 14 tests)
- [x] `examples/keyed-list/` (`app.ts` + `readme.md` + index.html/vite/tsconfig;
      this repo uses `examples/`, not `playground/recipes/`)
- [x] `vp check` clean + `vp test` (298 passing); core+dom re-`pack`ed; example builds

NOTE: a `by`-projected key must be stored on the `ItemRecord` (not the raw item),
or reuse breaks — caught in test (ID2/SC2) and fixed.

### Part B3 — hydration of List regions (task #4, done)

- [x] Server hydratable renderer emits `LIST` region + per-item markers
      (`listToHydratableSSR` in `server/render-to-stream.ts`; `firstListEmission` resolves
      the first `of` emission via `Source.toSubscribable`; plain `listToSSR` emits items
      with no markers). Region/item ids from the shared region counter.
- [x] Client `hydrateList` adopts server DOM + reconciles first emission flash-free
      (`render.ts`, beside `hydrateReactive`): `collectAdoptedItems` (depth-aware item-range
      walk), `hydrateFirstListEmission` (positional key↔range pairing), `hydrateItem`
      (per-item scope + in-place content hydration; divergence re-forks + re-renders).
      `projectKeys` factored out and shared with `reconcileList`. `reconcileList`/`ItemRecord`
      reused directly (same module — no export/factor-out needed).
- [x] `client/list.hydrate.test.ts` (HY1 markers incl. plain-SSR + empty; HY2 flash-free
      adopt, live per-item subscription, post-hydrate insert/reorder/remove, teardown,
      region-count + per-item divergence; 10 tests)
- [x] `vp check` clean + `vp test` (308 passing)

NOTE: server SSR `runHead`/`get` of an item's stream fires that stream's finalizers during
server render — tests that assert on per-item teardown must discount/clear that before
hydrating (see `cancelled.clear()` in `list.hydrate.test.ts`).

## Resume point

Parts A + B1 + B2 + **B3 complete** — the diffing-model work (scalar same-type patching,
`List.each` core API, client keyed reconciliation, and `List` hydration) is done. 308 tests
pass, `vp check` clean. Nothing outstanding on this plan.

If extending: v1 non-goals still stand (animation / FLIP move hooks; a dedicated positional
`List.index` variant; nested-list–specific optimizations beyond recursion). List hydration
divergence is handled at region granularity (count mismatch → full rebuild) and per-item
granularity (content mismatch → re-render that item); a finer key-aware reconcile of partial
server/client divergence was deliberately left out of v1.

## Key reminders

- Persisted keys never re-run `render` (components run once) — reconciliation only
  reuses/moves/inserts/removes DOM; content refresh is via streams inside the item.
- `by: t=>t.id` = identity; `by: (_,i)=>i` = positional (stale-content footgun — warn).
- Default identity = Effect `Equal`/`Hash` (structural for `Data`, reference for plain objects).
- Per-item scopes are `Scope.fork(regionScope)` and PERSIST across emissions (preserve
  subscriptions); closed only on item removal or region teardown.
