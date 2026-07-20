# Props.merge + Props.cx

> Spec derived from the agreed design doc `plans/props-merge-composition.md`
> (design agreed 2026-07-19). The Q&A phase was resolved in the design
> discussion recorded there; this spec translates those decisions into
> acceptance criteria. Feature lives in `packages/dom/src/props.ts`, exported
> as `Props` from the `@weftui/dom` package root.

## Overview & Purpose

Weft's answer to Base UI-style composition: a library part (behavior primitive)
owns behavior — aria wiring, handlers, refs, reactive state — while the
consumer owns markup. Because Weft elements are plain data made by plain calls
(`h.button(...)`), element ownership never leaves the consumer; the only
missing primitive is **prop merging**: reconciling two prop bags that both
carry `class`, `style`, `on*` handlers, or `ref`, where any value may be
reactive (a `Source`). Today the only option is last-wins object spread, which
silently drops handlers/refs and has the documented spread-a-Stream trap.

Two exports, one engine:

- **`Props.merge(...bags)`** — variadic, pure, left-to-right monoid fold over
  DOM prop bags with per-key merge rules (handlers chain, `class` concatenates,
  `style` object-merges, `ref` fans out, everything else last-wins).
- **`Props.cx(...inputs)`** — reactive clsx analog. The `class` cell of `merge`
  _is_ `cx(left, right)`; `cx` exposes that engine directly with a
  clsx-compatible grammar plus `Source`-valued conditions.

Merge outputs ordinary prop values, so `h.*` accepts the result unchanged and
the existing `PropsE`/`PropsR` machinery (`packages/core/src/combinator/types.ts`)
accumulates error/context channels with **zero core runtime changes**. The
renderer change is the `ref` branch of `setElementProps`
(`packages/dom/src/client/render.ts`) accepting an array of refs.

## Acceptance Criteria

### `Props.merge` — general

- [ ] **AC1** `Props.merge` is variadic: accepts 0..n prop bags. `merge()`
      returns `{}`; `merge(a)` returns a bag observationally equal to `a`.
- [ ] **AC2** Merge is pure: calling it performs no side effects, requires no
      `Scope`/services, and does not mutate its inputs. Reactive results are
      returned as pure Stream _descriptions_, not subscribed streams.
- [ ] **AC3** Identity law: `merge(a, {})` and `merge({}, a)` are
      observationally equal to `a` per key.
- [ ] **AC4** Associativity law: `merge(merge(a, b), c)` and
      `merge(a, merge(b, c))` are observationally equal per key (property-test
      target: handlers run in the same order with same isolation; class strings
      equal; style objects equal; ref arrays equal; last-wins keys equal).

- [ ] **AC4a** Known associativity exception in v1: the law does not hold for
      `style` when a non-object form (a string, or a whole-object stream) takes
      part in the fold. Last-wins discards a side instead of combining it, so
      grouping becomes observable:
      `merge({style: objA}, merge({style: "css"}, {style: objB}))` keeps
      `objA`'s keys, while the left-grouped fold drops them. This follows from
      the AC11 last-wins rule and disappears if that cell is upgraded to a real
      merge. All-object style folds are associative.
- [ ] **AC5** Keys present on only one side pass through untouched (same
      reference for objects/streams/functions).

### `Props.merge` — per-key rules

- [ ] **AC6** `on*` handlers (per `isEventHandler`: `on` + lowercase third
      char): both sides present as plain handler functions → merged value is a
      new handler function that
      runs left then right **sequentially**, both always run, and a failure
      (thrown or failed Effect) in one does not prevent the other. Plain
      void-returning handlers are lifted to Effects; the merged handler returns
      an Effect whose error channel is the union `E_left | E_right`, with
      failure causes aggregated (`Effect.all` with `mode: "either"` semantics —
      the merged Effect fails if any side failed, carrying both results).
- [ ] **AC7** Merged handlers receive the same event object; a
      `preventDefault()` in the left handler is observable in the right. Both
      handler **bodies** run synchronously when the merged handler is called,
      left then right; only the Effects they return are sequenced. Two separate
      DOM listeners both run during dispatch, so a `preventDefault()` written in
      either body must land before the browser decides the default action,
      regardless of whether the other side's Effect suspends.
- [ ] **AC8** `class`, both sides static strings → plain concatenated string
      `"left right"` (space-joined, no dedupe). The result is statically
      analyzable (no Stream introduced).
- [ ] **AC9** `class`, any side reactive (`Stream`/`Effect`/`Subscribable`) →
      derived `Stream<string>` combining latest values space-joined
      (combine-latest semantics). Await-first: a static side contributes
      immediately; first emission waits only on reactive sides. A reactive
      side that ends without emitting fails the derived stream with
      `NoPropValue`, which joins the error channel.
- [ ] **AC10** `style`, both sides per-property objects → per-key union, right
      wins per key, each surviving value (static or `Source`) passes through by
      reference.
- [ ] **AC11** `style`, whole-object stream (or string form) on either side →
      last-wins (right side as-is). Documented v1 limitation.
- [ ] **AC12** `ref`, both sides present → readonly array concatenating left
      then right (flattening sides that are already arrays, so associativity
      holds). Nullish sides are dropped, so an optional ref forwarded as
      `undefined` never enters the array. Each ref keeps the per-ref contract
      (set once to `Some(element)`).
- [ ] **AC13** Any other key on both sides → right side wins, passed through
      as-is (streams/functions not wrapped).
      This is plain last-wins, matching object spread: an explicit `undefined`
      on the right wins. There is deliberately **no** nullish special case
      outside the handler rule. A guard was tried and reverted: it made the
      runtime return the left value while the type still said `Present<R>`,
      which dropped the left side's `E`/`R` from `PropsE`/`PropsR`, and routing
      `class` through it bypassed `buildCx` so a condition record rendered as
      `[object Object]`. Keeping the runtime and the type in agreement is worth
      more than rescuing a forwarded optional prop.

### Renderer: ref fan-out

- [ ] **AC14** The `ref` branch of `setElementProps` accepts
      `SubscriptionRef | readonly SubscriptionRef[]`; for an array, every ref
      is set to `Some(element)`. Entries that are not `SubscriptionRef`s are
      skipped rather than disqualifying the array, so a `ref` array is never
      serialized as a DOM attribute. `h.div({ ref: [a, b] })` works without
      `merge`. Non-array behavior unchanged. Includes the type-only widening
      of the `ref` prop in `packages/core/src/types/html/html.ts` and
      `svg.ts` to accept a readonly array (no core runtime change).

- [ ] **AC14a** The ref-array arm accepts refs of **any** element type, unlike
      the exactly-typed single-ref arm. `SubscriptionRef` is invariant in its
      value type, so an array typed to the element would reject the headline
      fan-out case: composing a behavior primitive's
      `SubscriptionRef<Option<HTMLElement>>` with a caller's
      `SubscriptionRef<Option<HTMLInputElement>>` on `h.input`. The trade-off is
      that a mistyped ref inside a fan-out array is not caught at compile time.
      The set-once contract means each ref only ever receives the real element,
      so reads stay sound.

### `Props.cx`

- [ ] **AC15** Grammar (clsx-compatible): string inputs kept; falsy inputs
      (`false | null | undefined | ""`) skipped; nested arrays flattened and
      processed recursively; record inputs `{ className: condition }` include
      the key when the condition is truthy.
- [ ] **AC16** Fully static inputs → plain `string` (space-joined, no dedupe,
      no empty segments). `cx()` → `""`.
- [ ] **AC17** Any reactive input — a `Source<string>` in value position or a
      `Source<boolean>` as a record condition — → derived `Stream<string>`
      recomputing the full class string on any emission (same combine-latest
      engine as AC9).
      `E`/`R` union from all reactive inputs; `NoPropValue` joins `E`.
- [ ] **AC18** `merge`'s class rule and `cx` agree: for both-present class
      values, the merged class is observationally `cx(left, right)`.

### Type-level surface

- [ ] **AC19** `Merged<Bags>` result types: static+static class → `string`;
      any reactive class → `Stream<string, E ∪ NoPropValue, R>`; merged
      handlers → function returning `Effect<void, E_l | E_r, R_l | R_r>`;
      merged style objects → key union with right-hand types winning per key;
      merged refs → readonly array; other keys → right-hand type. Value types
      may stay coarse (Source-shaped) but `E`/`R` unions must stay precise.
- [ ] **AC20** `h.*` accepts merge/cx output directly: `PropsE`/`PropsR`
      propagate the merged `E`/`R` into the resulting `Node<E, R>`.
- [ ] **AC21** `cx` return type: `string` when all inputs are static,
      `Stream<string, E ∪ NoPropValue, R>` when any input is reactive.

## Technical Requirements

- Location: `packages/dom/src/props.ts`; namespace-style export
  `export * as Props` from `packages/dom/src/index.ts` (package root — pure,
  usable from client and server code).
- No core runtime changes. The supporting changes are: the AC14 renderer ref
  branch, the AC14 type-only `ref` widening in core's HTML/SVG attribute types,
  and moving `isEventHandler` into `packages/dom/src/shared.ts` so the client
  renderer, the server serializer, and `merge` share one definition of what
  counts as a handler prop instead of three copies that can drift.
- `children` is out of scope: `h` folds children after the props argument, so
  merge never sees a `children` key (no rule required; merge treats it as
  "any other key" if present).
- The `class` prop's accepted type on elements is unchanged
  (`Source<string>`); `cx` is an explicit call — the renderer never learns the
  clsx grammar.
- Naming: `cx` is a deliberate terse-name exception (pipe-tier call-site
  frequency, like `h`). No alias.
- If `Merged<Bags>` inference or checker performance degrades, fixed-arity
  overloads are an acceptable implementation fallback (not a design change).

## Dependencies & Integrations

- `Source.toSubscribable` / `NoPropValue`
  (`packages/core/src/source/source.ts`) — normalization + await-first
  semantics for reactive class/cx.
- `PropsE` / `PropsR` (`packages/core/src/combinator/types.ts`) — channel
  accumulation through `h.*` (consumed, not modified).
- `setElementProps` (`packages/dom/src/client/render.ts`) — ref branch change
  (AC14).
- SSR/static analysis: static-in/static-out for `class`/`cx` keeps descriptors
  analyzable by `getElementDescriptor`
  (`packages/core/src/combinator/descriptor.ts`).

## Expected Behavior & Edge Cases

- Handler with `null`/`undefined` on one side ("not provided"): the other side
  passes through unchanged, whatever shape it has, including a reactive
  `Stream`/`Effect`-of-handler.
- Handler with `false` on the right: `false` wins and the handler is disabled.
  The renderer reads `false` as "no handler", so this is how a caller switches a
  behavior primitive's handler off. Treating it as "not provided" would make
  that impossible.
- Reactive handler _values_ (`Stream`/`Effect` of a handler fn, per core's
  `EventHandler` union): not chained in v1 — any non-function handler side
  falls back to last-wins (right side as-is), consistent with the
  whole-object-stream style rule. Documented limitation; upgrade is additive.
  Their `E`/`R` channels are still collected, so a reactive side never silently
  drops a requirement the app must provide.
- Handler returning a non-Effect value: treated as a plain handler; lifted via
  `Effect.sync` semantics inside the chain.
- `class` empty-string sides: concat may produce leading/trailing space-free
  joins — empty segments are skipped in `cx`; for `merge` the join uses a
  single space between non-empty sides.
- `class` absent on both sides (both nullish or falsy): the merged value is the
  empty string, exactly as `cx` (and clsx) return it, so the element renders
  `class=""`. Mapping the empty join to `undefined` was tried and reverted: AC5
  passes a one-sided `class` through untouched, so `merge(base, {})` and
  `merge(base, { class: "" })` would have rendered differently, and putting the
  normalization in the shared engine made the public `cx` emit `undefined`
  while typed `Stream<string>`.
- `cx` record with static `false` condition: key never included; static `true`:
  always included.
- `cx` input that is an object but not a plain record (a class instance, a
  `Date`, a `SubscriptionRef`): ignored. Only plain records are read as
  condition maps, so foreign field names never leak in as class names.
- Handler keys follow the renderer's rule exactly: `on` plus a lowercase third
  character. A camelCase `onClick` is not a handler key at either the type or
  runtime level, so it is last-wins like any other prop.
- Optional keys: a cell rule applies only when both sides are present at
  runtime. Cell rules dispatch on the present value, never on `T | undefined`.
  The merged type does **not** union the absent-side outcome back in; see the
  Type-layer contract for why that costs more than it buys.
- Interruption is left to the Effect runtime. The chain is one Effect, so
  interrupting the fiber interrupts it wherever it has reached. An explicit
  left-interrupt short-circuit would be vacuous now that both bodies run
  eagerly, and would silently discard the Effect the right body already built.

### Type-layer contract

The design doc's rule governs here: merged **value** types stay coarse, while
`E`/`R` channels stay precise. Channel accuracy is what must not degrade, since
`PropsE`/`PropsR` feed the component's `Node<E, R>`.

- Handler cells always type as a handler function whose returned Effect unions
  both sides' channels. The rule does not try to detect "two bare functions",
  because core declares handler props as `null | false | EventHandler<...>` and
  a stricter match would miss every realistically-typed bag and silently drop
  the left side's `E`/`R`.
- A possibly-reactive class cell types as exactly `Stream`, never a union.
  `PropsE`/`PropsR` extract channels by matching `P[K] extends Stream<...>`, and
  a union fails that match, dropping the channels.
- Ref cells type as the same permissive array the core `ref` arm declares, so a
  fan-out stays assignable to any element builder.
- Keys both bags declare are emitted as **required** with an undefined-free
  value. `PropsE`/`PropsR` match `P[K]` against a function or `Stream` shape,
  and a `T | undefined` union fails that match, dropping the key's channels
  entirely. Since a behavior primitive's bag normally declares optional props,
  keeping the modifier would break `E`/`R` for exactly the intended use case.
  The cost is that a shared key optional on both sides and absent at runtime is
  still typed as present. Keys only one bag declares keep their modifier.

### Accepted limitations (reviewed and kept)

- A bag typed with core's `HTMLAttributes`/`DOMAttributes` gets `unknown`
  handler channels, because core declares `EventHandlerFn` as returning
  `void | Effect<void, unknown, unknown>`. Merge unions what its inputs
  declare and cannot invent precision the input type does not carry. A behavior
  primitive that declares precise handler signatures, which is the intended
  pattern, keeps precise channels.
- A handler cell types as callable whenever either side _can_ carry a handler.
  If a side is declared `fn | null` and is `null` at runtime, the merged cell is
  `null` while typed callable. Narrowing this would require unioning the nullish
  outcome in, which fails `PropsE`/`PropsR`'s function match and drops the
  handler's `E`/`R` entirely. The case where neither side can carry a handler is
  typed exactly.
- An inline handler written directly in a `merge` argument gets no contextual
  type, because `DomProps` is `object` and merge cannot know the element. Write
  `onclick: (ev: MouseEvent) => …` rather than `(ev) => …`, or type the bag
  separately. Constraining `DomProps` to a specific element's attributes would
  reject the arbitrary keys a behavior primitive's bag legitimately carries.
- The non-tuple `Merged` fallback (a `DomProps[]` spread, where arity is
  unknown) folds the element type with itself and so marks its keys required.
  It is already a coarse fallback; the tuple path, which every literal call
  site takes, is unaffected.

- A `class` side typed as the wide `Source<string>` union reports as reactive
  even when the runtime resolves it to a plain string. Erring toward `Stream`
  keeps the `E`/`R` channels intact, which matters more than the value's shape;
  both arms are accepted by the `class` prop slot.
- When a shared key is optional on one side and absent at runtime, the other
  side's value survives unmerged while the type still describes the merged
  shape. Modelling that outcome as a union re-broke the AC14a fan-out, because
  the bare `SubscriptionRef` arm is invariant. All cell types stay assignable
  to their prop slot in either outcome.

- The ref-array arm is typed `SubscriptionRef<Option<any>>`, so it does not
  verify that entries are element refs. Narrowing it re-breaks the
  heterogeneous fan-out case in AC14a, because `SubscriptionRef` is invariant.
  The permissive arm is the cost of supporting the headline use case; the
  single-ref arm still checks precisely.
- `Props.cx` seeds a `Subscribable` class source from its await-first `get`,
  then follows with `changes`. An earlier version read `changes` alone, which
  hung: `Source.toSubscribable` leaves `changes` open forever when the source
  never emitted, so the combine stalled and swallowed the other side's class
  with no error. `concat` (not `merge`) keeps the order deterministic, so the
  seeded value can never land after a newer emission. A replaying source emits
  its current value twice, which is harmless: the join is recomputed to the
  same string.
- Reactive `cx` condition emitting repeated values: recompute is fine
  (renderer sets the attribute; no dedupe requirement).
- Ref arrays nest: `merge({ ref: [a, b] }, { ref: c })` → `[a, b, c]`
  (flatten, preserve order).
- Merge with 3+ bags: fold left; per-key results equal any grouping (AC4).
- `style` object with the same key on both sides where left value is a Stream:
  right wins; left Stream simply never subscribed (pure description — nothing
  leaks).

## Review status

Eight high-effort review passes ran against this feature. They fixed roughly
thirty-five confirmed defects and produced the "Accepted limitations" list
above. Reviewers still surface cleanup-grade findings, so the gate did not
close on an empty pass; it closed on judgment, for two reasons worth recording.

First, several mid-cycle "fixes" were themselves the source of the next pass's
findings. The nullish guards on the generic and `style` arms, and the
empty-class-to-`undefined` normalization, were each added to solve a real
ergonomic problem and each broke something larger: type/runtime disagreement
that dropped `E`/`R` channels, a `class` condition record rendering as
`[object Object]`, and a public `cx` emitting `undefined` while typed
`Stream<string>`. All three were reverted. The lesson is recorded here because
the simpler behavior looks like an omission unless you know it was tried.

Second, the remaining tension is structural, not a bug list. `Merged<Bags>` has
to be assignable at `h.*`, feed `PropsE`/`PropsR` (which match exact `Stream`
and function shapes, so unions silently drop channels), and describe what
`mergeCellValue` returns. Those three pull against each other, and the accepted
limitations are where they were traded off. Revisiting them means revisiting
that three-way constraint, not patching a cell rule.

## Phase notes

- **type-tests**: applicable. `Merged<Bags>` inference, E/R unions, AC19 to AC21
  in `src/__type-tests__/props.tst.ts`.
- **e2e**: applicable, covered by `src/props.browser.test.ts` at the package
  level. Browser coverage targets what jsdom cannot reproduce faithfully: real
  click dispatch through chained handlers with a shared event (AC6, AC7), live
  class-attribute updates from a derived stream (AC8, AC9, AC17), and ref
  fan-out onto a real mounted element (AC12, AC14).

  The `examples/headless-menu` incubator named in the design doc is deliberately
  **not** part of this feature's cycle. The design doc sequences it as step 2,
  after this substrate ships, so that the example pressure-tests a frozen API
  rather than co-evolving with it.
