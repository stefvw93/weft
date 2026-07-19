import {
  AppRpcClientTag,
  Boundary,
  FAILURE_BOUNDARY,
  FRAGMENT,
  LIST,
  NoPropValue,
  SERVER_BOUNDARY,
  Source,
  Subscribable,
  SUSPENSE_BOUNDARY,
  type Renderable,
} from "@weftui/core";
import { getElementDescriptor, isStream, toStream } from "@weftui/core";
import { Cause, Effect, Exit, Option, Queue, Ref, Schema, Scope, Stream } from "effect";
import {
  listItemEndText,
  listItemStartText,
  SUSPENSE_FAILURE_ATTR,
  suspenseEndText,
  suspenseStartText,
  streamEndText,
  streamStartText,
} from "~/shared";
import { UnsupportedNodeTypeError } from "~/data";
import {
  BOUNDARY_FAILURE_ATTR,
  collectServerBoundaries,
  type ServerBoundaryReplayProps,
} from "~/boundary-replay";
import { escapeHtml, serializeJsonForScript, serializeProps, VOID_ELEMENTS } from "./serialize";
import { SuspenseFailureHandlerTag } from "./suspense-failure-handler";

// ============================================================================
// Internal types
// ============================================================================

/**
 * Mutable counter threaded through a single hydratable render pass, assigning a
 * monotonic id to each reactive region in document order.
 */
interface RegionCounter {
  current: number;
}

/**
 * Patch infrastructure created once per `renderToStream` /
 * `renderToStreamHydratable` call. Threaded through the recursive render
 * functions so every suspense boundary (`Boundary.suspend`) in the tree can share it.
 */
interface ServerSuspenseCtx {
  /**
   * Serialised patch strings pushed here (as `Some`) as each boundary
   * resolves; a terminal `None` is offered when the last pending boundary
   * settles, ending the patch stream **after** all queued patches are
   * consumed (a `Queue.shutdown` would drop still-queued patches when the
   * consumer attaches late).
   */
  readonly patchQueue: Queue.Queue<Option.Option<string>>;
  /** Number of boundaries not yet resolved; drives queue shutdown. */
  readonly pendingCount: Ref.Ref<number>;
  /** Monotonic boundary-id counter (shared with region counter). */
  readonly idCounter: { current: number };
  /**
   * The scope that spans the entire combined stream (main + patch).
   * Resolution fibers are forked into this scope so they survive the main
   * stream and are interrupted if the consumer cancels.
   */
  readonly scope: Scope.Scope;
  /**
   * Single-slot collector for a `Boundary.server` **load failure** being
   * relocated to its enclosing failure `Boundary` (typed-failure replay). A
   * failing server boundary `Schema.encodeEffect`s its error and stashes
   * `{ owner, encoded }` here, then re-fails the original cause; the enclosing
   * failure boundary drains it (after its `match` handles the cause) to emit the
   * `data-weft-boundary-failure` payload before its fallback. `null` on the plain
   * SSR passes: failure payloads are emitted only on the hydratable pass.
   */
  readonly failureCollector: FailureCollector | null;
}

/** A `Boundary.server` load failure stashed for relocation to its failure boundary. */
interface ServerBoundaryFailure {
  /** The failing `Boundary.server`'s live `props` (matched by reference for its index). */
  readonly owner: ServerBoundaryReplayProps;
  /** The `Schema.encodeEffect`d typed `ELoad` error, ready to embed in the payload. */
  readonly encoded: unknown;
}

/** Single-slot relocation channel for a server-boundary load failure. */
type FailureCollector = Ref.Ref<Option.Option<ServerBoundaryFailure>>;

/**
 * Descriptor props carried by a `List.each` node (mirrors the client's
 * `ListProps` in `client/render.ts`). The server renders only the **first**
 * emission of `of`, bracketing the region and each item with the same markers
 * the client emits so the server DOM is adoptable by `hydrateList`.
 */
interface ListSSRProps {
  readonly of: Source.Source<Iterable<unknown>>;
  readonly by?: (item: unknown, index: number) => unknown;
  readonly render: (item: unknown, index: number) => Renderable;
}

// ============================================================================
// Patch builder
// ============================================================================

/**
 * Produces the `<template id="ef-s-N">…</template><script>…</script>` pair
 * that the browser executes to swap the fallback for resolved content.
 *
 * With `markNoindex` (a `SuspenseFailureHandler` substitute opting into the
 * soft-404 pattern, AC-FH3) the script first appends
 * `<meta name="robots" content="noindex">` to `document.head`. The head has
 * long been flushed, so DOM injection is the only route.
 *
 * With `failureReplay` (AC-FH7) the patch switches to the **failure-replay
 * variant**: the suspense markers are retained (the marker `removeChild` calls
 * are skipped) and an inert
 * `<script type="application/json" data-weft-suspense-failure>` sentinel
 * carrying `{"error":<encoded>}` is prepended to the swapped-in content, so the
 * client `hydrate` can locate the substituted region and replay the failure to
 * its nearest boundary (`hydrate.specs.md` AC-H14).
 */
function buildPatch(
  id: number,
  html: string,
  markNoindex = false,
  failureReplay?: unknown,
): string {
  const startText = suspenseStartText(id);
  const endText = suspenseEndText(id);
  const noindex = markNoindex
    ? `var m=document.createElement("meta");m.setAttribute("name","robots");m.setAttribute("content","noindex");document.head.appendChild(m);`
    : "";
  const hasReplay = failureReplay !== undefined;
  const content = hasReplay
    ? `<script type="application/json" ${SUSPENSE_FAILURE_ATTR}>` +
      serializeJsonForScript({ error: failureReplay }) +
      `</script>` +
      html
    : html;
  const removeMarkers = hasReplay ? "" : `p.removeChild(s);p.removeChild(e);`;
  return (
    `<template id="ef-s-${id}">${content}</template>` +
    `<script>(function(){` +
    noindex +
    `var w=document.createTreeWalker(document,128),s,e;` +
    `while(w.nextNode()){var d=w.currentNode.data;` +
    `if(d==="${startText}")s=w.currentNode;` +
    `if(d==="${endText}"){e=w.currentNode;break;}}` +
    `if(!s||!e)return;` +
    `var p=s.parentNode,c=s.nextSibling,n;` +
    `while(c&&c!==e){n=c.nextSibling;p.removeChild(c);c=n;}` +
    `var t=document.getElementById("ef-s-${id}");` +
    `p.insertBefore(t.content,e);` +
    removeMarkers +
    `t.remove();document.currentScript.remove();` +
    `})();</script>`
  );
}

// ============================================================================
// Shared Suspense SSR helper
// ============================================================================

/**
 * Emits the inline portion of a Suspense boundary (start-marker + fallback +
 * end-marker) and forks a resolution fiber that renders the children HTML,
 * builds a patch, offers it to `ctx.patchQueue`, and decrements
 * `ctx.pendingCount` (shutting down the queue when it reaches 0).
 *
 * `renderFn` is the caller-supplied recursive render function, so the helper
 * works for both the plain-SSR and hydratable-SSR variants.
 */
function renderSuspenseSSRInline(
  props: Boundary.SuspenseProps & { children?: Renderable },
  ctx: ServerSuspenseCtx,
  renderFn: (node: Renderable) => Stream.Stream<string, Error, AppRpcClientTag>,
): Stream.Stream<string, Error, AppRpcClientTag> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const id = ++ctx.idCounter.current;

      // Increment before forking so pendingCount is ≥ 1 during setup,
      // preventing a race where the queue might be shut down too early.
      yield* Ref.update(ctx.pendingCount, (n) => n + 1);

      const childrenNode = (
        props.children === undefined
          ? null
          : Array.isArray(props.children)
            ? (props.children as Renderable[])
            : (props.children as Renderable)
      ) as Renderable;

      // Resolution fiber: renders children to HTML, pushes patch, decrements.
      // Effect.ignore ensures a rendering error never fails the outer scope.
      const resolutionEffect = Effect.gen(function* () {
        const childrenHtml = yield* Stream.mkString(renderFn(childrenNode));
        yield* Queue.offer(ctx.patchQueue, Option.some(buildPatch(id, childrenHtml)));
      }).pipe(
        // Late-failure seam (AC-FH1 … AC-FH6): a cause that no failure
        // `Boundary` inside the children handled may be substituted by the
        // ambient SuspenseFailureHandler. Absent seam / Option.none keeps the
        // swallow default (AC-ST8); a failing substitute render degrades to it
        // via the trailing Effect.ignore (AC-FH6).
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.gen(function* () {
                const handler = yield* Effect.serviceOption(SuspenseFailureHandlerTag);
                if (Option.isNone(handler)) return;
                const substitute = handler.value.handle(cause as Cause.Cause<unknown>);
                if (Option.isNone(substitute)) return;
                const html = yield* Stream.mkString(renderFn(substitute.value.content));
                yield* Queue.offer(
                  ctx.patchQueue,
                  Option.some(
                    buildPatch(
                      id,
                      html,
                      substitute.value.markNoindex,
                      substitute.value.failureReplay,
                    ),
                  ),
                );
              }),
        ),
        // Always decrement, even on failure/interruption, so the patch stream
        // eventually terminates regardless of rendering errors.
        Effect.ensuring(
          Ref.updateAndGet(ctx.pendingCount, (n) => n - 1).pipe(
            Effect.flatMap((remaining) =>
              remaining <= 0
                ? Queue.offer(ctx.patchQueue, Option.none()).pipe(Effect.asVoid)
                : Effect.void,
            ),
          ),
        ),
        // Swallow errors: a failed boundary never crashes the outer scope.
        Effect.ignore,
      );

      // Fork into the outer scope so the fiber is interrupted if the consumer
      // cancels the stream, and survives until all patches have been emitted.
      yield* Effect.forkIn(resolutionEffect, ctx.scope);

      const start = `<!--${suspenseStartText(id)}-->`;
      const end = `<!--${suspenseEndText(id)}-->`;
      const fallback = (props.fallback ?? null) as Renderable;

      return Stream.make(start).pipe(
        Stream.concat(renderFn(fallback)),
        Stream.concat(Stream.make(end)),
      );
    }),
  );
}

// ============================================================================
// Boundary SSR helper
// ============================================================================

/**
 * Renders a `Boundary.*` descriptor for SSR. Attempts to render children; on
 * error calls `props.match`. If it returns a `Node`, renders the fallback
 * inline with no markers; if it returns `null`, propagates the error as a
 * stream failure. Used by both plain-SSR and hydratable-SSR code paths.
 *
 * **Typed-failure replay (hydratable):** when `match` handles a cause raised by a
 * nested `Boundary.server`'s `load`, the failing boundary has stashed its encoded
 * error in `failureCollector`. After rendering the fallback, this handler drains
 * the collector and emits a single
 * `<script type="application/json" data-weft-boundary-failure>{"index":N,"error":…}</script>`
 * **before** the fallback HTML, where `N` is the failing boundary's pre-order
 * index among the `SERVER_BOUNDARY` descriptors statically reachable in
 * `props.children`. When `match` returns `null` the cause re-fails **without**
 * draining, so the payload relocates to the next enclosing handling boundary.
 */
function renderBoundarySSR(
  props: Boundary.FailureProps & { children: Renderable[] },
  failureCollector: FailureCollector | null,
  renderFn: (node: Renderable) => Stream.Stream<string, Error, AppRpcClientTag>,
): Stream.Stream<string, Error, AppRpcClientTag> {
  const childrenNode = (
    props.children.length === 0
      ? null
      : props.children.length === 1
        ? (props.children[0] as Renderable)
        : (props.children as Renderable[])
  ) as Renderable;

  return Stream.unwrap(
    Effect.gen(function* () {
      const childrenHtml = yield* Stream.mkString(renderFn(childrenNode)).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const fallbackNode = props.match(cause);
            // Not handled here: re-fail without draining so any stashed failure
            // payload relocates to the next enclosing handling boundary.
            if (fallbackNode === null) return yield* Effect.failCause(cause);

            const fallbackHtml = yield* Stream.mkString(renderFn(fallbackNode as Renderable));
            if (failureCollector === null) return fallbackHtml;

            // Drain the relocation slot: if this cause came from a server
            // boundary's rpc call, prepend its encoded failure payload.
            const stashed = yield* Ref.getAndSet(failureCollector, Option.none());
            if (Option.isNone(stashed)) return fallbackHtml;

            const index = collectServerBoundaries(props.children).indexOf(stashed.value.owner);
            const payload = serializeJsonForScript({ index, error: stashed.value.encoded });
            const script = `<script type="application/json" ${BOUNDARY_FAILURE_ATTR}>${payload}</script>`;
            return script + fallbackHtml;
          }),
        ),
      );
      return Stream.make(childrenHtml);
    }),
  );
}

// ============================================================================
// Server boundary SSR helper
// ============================================================================

/**
 * Descriptor props carried by a `Boundary.rpc` node. The server renderer resolves
 * the rpc through the ambient {@link AppRpcClientTag} (an in-process client over
 * the handler Layer) by calling `call(tag, payload())`, encodes the success
 * through `successSchema`, and renders `render(data)` in place. A resolved rpc
 * **error** is encoded through `errorSchema` for the typed-failure replay and
 * re-raised as a stream failure (caught by the nearest enclosing failure
 * `Boundary`).
 */
interface ServerBoundarySSRProps {
  readonly tag: string;
  readonly payload: () => unknown;
  readonly successSchema: Schema.Codec<unknown, unknown>;
  readonly errorSchema: Schema.Codec<unknown, unknown>;
  readonly render: (resource: Boundary.Resource<unknown>) => Renderable;
}

/**
 * On an rpc **failure** during a hydratable pass, `Schema.encodeEffect`s the resolved
 * error via `props.errorSchema` and stashes `{ owner, encoded }` in
 * `failureCollector` for the enclosing failure `Boundary` to relocate, then
 * re-fails the **original** cause so `match` still sees it unchanged. No-ops
 * (re-fails unchanged) on the plain passes (`failureCollector === null`), on a
 * defect (no `Cause.findErrorOption`), or if the encode itself fails (e.g. a
 * transport defect against an rpc with no `error` schema, where `errorSchema` is
 * `Never`), all of which fall back to a server fallback + client mismatch.
 */
function stashServerBoundaryFailure(
  props: ServerBoundarySSRProps,
  failureCollector: FailureCollector | null,
  cause: Cause.Cause<Error>,
): Effect.Effect<never, Error> {
  if (failureCollector === null) {
    return Effect.failCause(cause);
  }
  const error = Cause.findErrorOption(cause);
  if (Option.isNone(error)) {
    return Effect.failCause(cause);
  }
  return Schema.encodeEffect(props.errorSchema)(error.value).pipe(
    Effect.flatMap((encoded) => Ref.set(failureCollector, Option.some({ owner: props, encoded }))),
    // Whether the encode succeeds or fails, re-raise the original cause so the
    // enclosing boundary's `match` sees the unchanged failure.
    Effect.matchCauseEffect({
      onFailure: () => Effect.failCause(cause),
      onSuccess: () => Effect.failCause(cause),
    }),
  );
}

/**
 * Builds the **static-seeded** {@link Boundary.Resource} handed to `render` on the
 * server. `value` is a static `Subscribable` around the loaded `data` (await-first
 * `get` and a single-emission `changes`), so the reactive-child render seam takes
 * `data` as its first emission and the SSR HTML is byte-identical to the hydrated
 * DOM. `refetch` is a no-op (the server is the data origin, not a client), `pending`
 * is constant `false`, and `error` is constant `None`.
 */
function staticResource(data: unknown): Boundary.Resource<unknown> {
  return {
    value: Subscribable.make({ get: Effect.succeed(data), changes: Stream.make(data) }),
    refetch: Effect.void,
    pending: Subscribable.make({ get: Effect.succeed(false), changes: Stream.make(false) }),
    error: Subscribable.make({
      get: Effect.succeed(Option.none()),
      changes: Stream.make(Option.none()),
    }),
  };
}

/**
 * Renders a `Boundary.rpc` descriptor for SSR (success path). Resolves the rpc
 * through the ambient {@link AppRpcClientTag} via `call(tag, payload())`. The
 * region **blocks** on it, like `firstListEmission`, then renders `render(data)`
 * HTML in place. `call` returns the already-decoded success value (the in-process
 * client over the handler Layer does the decoding).
 *
 * When `emitPayload` is `true` (the hydratable passes), the encoded `data` is
 * emitted inline as a `<script type="application/json">…</script>` at the region
 * cursor, **before** the rendered HTML, so the client `hydrate` walk reads it
 * positionally and hydrates `render(data)` at `script.nextSibling`. The plain
 * passes (`emitPayload === false`) emit only the `render(data)` HTML: complete
 * without JS, with no payload script (AC-11/AC-12).
 *
 * No wrapper comment markers are needed: `render(data)` is fully-resolved static
 * HTML located positionally, and the payload script itself sits at the cursor.
 */
function renderServerBoundarySSR(
  props: ServerBoundarySSRProps,
  emitPayload: boolean,
  failureCollector: FailureCollector | null,
  renderFn: (node: Renderable) => Stream.Stream<string, Error, AppRpcClientTag>,
): Stream.Stream<string, Error, AppRpcClientTag> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* AppRpcClientTag;
      // A resolved rpc failure is stashed for the enclosing failure boundary to
      // replay (hydratable pass only); the original cause is then re-raised so it
      // still propagates to `match` as before. The rpc seam's error channel is
      // `unknown`; the renderer's stream channel is `Error`, so the cause is cast.
      // `match`/encode inspect the failure value untyped, never as an `Error`.
      const data = yield* (
        client.call(props.tag, props.payload()) as Effect.Effect<unknown, Error>
      ).pipe(
        Effect.catchCause((cause) => stashServerBoundaryFailure(props, failureCollector, cause)),
      );
      const childrenHtml = renderFn(props.render(staticResource(data)));
      if (!emitPayload) {
        return childrenHtml;
      }
      const encoded = yield* Schema.encodeEffect(props.successSchema)(data);
      const payload = `<script type="application/json">${serializeJsonForScript(encoded)}</script>`;
      return Stream.make(payload).pipe(Stream.concat(childrenHtml));
    }),
  );
}

// ============================================================================
// Keyed-list SSR helper
// ============================================================================

/**
 * Resolves the **first** emission of a `List.each` source to a fixed-order array
 * of items. Mirrors the client's `Source.toSubscribable(of)` normalization but
 * takes only the await-first value (`get`): a static `Iterable` resolves
 * immediately, an `Effect`/`Stream`/`Subscribable` resolves to its first value.
 * A source that completes without ever emitting (`NoPropValue`) renders an empty
 * region. SSR assumes the source's requirements (`R`) are already discharged.
 */
function firstListEmission(
  of: Source.Source<Iterable<unknown>>,
): Effect.Effect<readonly unknown[]> {
  return Effect.scoped(
    Source.toSubscribable(of).pipe(
      Effect.flatMap((s) => s.get as Effect.Effect<Iterable<unknown>, NoPropValue>),
      Effect.map((items): readonly unknown[] => Array.from(items)),
      Effect.catchTag("NoPropValue", () => Effect.succeed<readonly unknown[]>([])),
    ),
  );
}

// ============================================================================
// Plain SSR  (no reactive-region markers)
// ============================================================================

/**
 * Core SSR render: `ctx` controls Suspense behaviour:
 * - `null`     → fallback-only (no markers, no patches), used by `renderToString`
 * - non-`null` → full streaming-patch model, used by `renderToStream`
 */
function renderSSRNode(
  node: Renderable,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  if (node == null || typeof node === "boolean") return Stream.empty;

  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    return Stream.make(escapeHtml(String(node)));
  }

  if (isStream(node) || Effect.isEffect(node)) {
    // Static markup carries its descriptor: render it directly, no execution.
    const descriptor = getElementDescriptor(node);
    if (descriptor !== undefined) {
      return renderSSRNode(descriptor, ctx);
    }
    // Untagged Effect: probe for synchronous resolution; a genuinely async Effect
    // resolves to a failure exit (AsyncFiberException) and falls through to the
    // stream path below.
    if (Effect.isEffect(node)) {
      // @effect-diagnostics-next-line runEffectInsideEffect:off -- intentional sync probe
      const exit = Effect.runSyncExit(node as Effect.Effect<Renderable, never, never>);
      if (Exit.isSuccess(exit)) {
        return renderSSRNode(exit.value, ctx);
      }
    }
    return toStream(node).pipe(
      Stream.runHead,
      Effect.map(
        Option.match({
          onNone: () => Stream.empty,
          onSome: (v: unknown) => renderSSRNode(v as Renderable, ctx),
        }),
      ),
      Stream.unwrap,
    );
  }

  if (typeof node === "object" && Symbol.iterator in node && !("type" in node)) {
    return Stream.flatMap(Stream.fromIterable(node as Iterable<Renderable>), (child) =>
      renderSSRNode(child as Renderable, ctx),
    );
  }

  if (typeof node === "object" && "type" in node && !(Symbol.iterator in node)) {
    const { type, props } = node as { type: unknown; props: Record<string, unknown> };

    if (type === FRAGMENT) {
      return fragmentToSSR(props, ctx);
    }

    if (type === SUSPENSE_BOUNDARY) {
      const sp = props as unknown as Boundary.SuspenseProps;
      if (ctx === null) {
        // AC-SS1: renderToString, fallback only, no markers, no patches.
        return renderSSRNode((sp.fallback ?? null) as Renderable, null);
      }
      return renderSuspenseSSRInline(sp, ctx, (n) => renderSSRNode(n, ctx));
    }

    if (type === FAILURE_BOUNDARY) {
      // Plain SSR never emits a failure payload, so no collector is threaded.
      return renderBoundarySSR(
        props as unknown as Boundary.FailureProps & { children: Renderable[] },
        null,
        (n) => renderSSRNode(n, ctx),
      );
    }

    if (type === SERVER_BOUNDARY) {
      // Plain SSR: run load + render(data) inline, but emit no payload script
      // (not hydratable). AC-11.
      return renderServerBoundarySSR(props as unknown as ServerBoundarySSRProps, false, null, (n) =>
        renderSSRNode(n, ctx),
      );
    }

    if (type === LIST) {
      // Plain SSR: render the first emission's items inline, no markers.
      return listToSSR(props as unknown as ListSSRProps, ctx);
    }

    if (typeof type === "string") {
      const openTag = Stream.fromEffect(
        serializeProps(props).pipe(Effect.map((attrs) => `<${type}${attrs}>`)),
      );
      if (VOID_ELEMENTS.has(type)) return openTag;
      return openTag.pipe(
        Stream.concat(fragmentToSSR(props, ctx)),
        Stream.concat(Stream.make(`</${type}>`)),
      );
    }

    if (typeof type === "function") {
      return renderSSRNode((type as (p: Record<string, unknown>) => Renderable)(props), ctx);
    }
  }

  return Stream.fail(
    new UnsupportedNodeTypeError({
      type: (node as { type?: unknown }).type,
      message: `Invalid Renderable type: expected string, FRAGMENT, or function, got ${typeof (node as { type?: unknown }).type}`,
    }),
  );
}

/**
 * Plain-SSR rendering of a `List.each` region: resolves the first emission and
 * renders each item inline (no region or per-item markers), since plain
 * `renderToString` output is not hydrated.
 */
function listToSSR(
  props: ListSSRProps,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const items = yield* firstListEmission(props.of);
      let inner: Stream.Stream<string, Error, AppRpcClientTag> = Stream.empty;
      items.forEach((item, index) => {
        inner = inner.pipe(Stream.concat(renderSSRNode(props.render(item, index), ctx)));
      });
      return inner;
    }),
  );
}

function fragmentToSSR(
  props: Record<string, unknown>,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  const children = "children" in props ? props.children : undefined;
  if (children == null) return Stream.empty;
  const arr = Array.isArray(children) ? children : [children];
  return Stream.flatMap(Stream.fromIterable(arr), (child) =>
    renderSSRNode(child as Renderable, ctx),
  );
}

// ============================================================================
// Hydratable SSR  (adds reactive-region markers)
// ============================================================================

function renderHydratableSSRNode(
  node: Renderable,
  counter: RegionCounter,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  if (node == null || typeof node === "boolean") return Stream.empty;

  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    return Stream.make(escapeHtml(String(node)));
  }

  if (isStream(node) || Effect.isEffect(node)) {
    // Static markup carries its descriptor: render it directly, no execution.
    const descriptor = getElementDescriptor(node);
    if (descriptor !== undefined) {
      return renderHydratableSSRNode(descriptor, counter, ctx);
    }
    // Untagged Effect: probe for synchronous resolution; a genuinely async Effect
    // resolves to a failure exit (AsyncFiberException) and falls through to the
    // stream path with markers below.
    if (Effect.isEffect(node)) {
      // @effect-diagnostics-next-line runEffectInsideEffect:off -- intentional sync probe
      const exit = Effect.runSyncExit(node as Effect.Effect<Renderable, never, never>);
      if (Exit.isSuccess(exit)) {
        return renderHydratableSSRNode(exit.value, counter, ctx);
      }
    }
    return toStream(node).pipe(
      Stream.runHead,
      Effect.map((first) => {
        const id = ++counter.current;
        const inner = Option.match(first, {
          onNone: () => Stream.empty,
          onSome: (value: unknown) => renderHydratableSSRNode(value as Renderable, counter, ctx),
        });
        return Stream.make(`<!--${streamStartText(id)}-->`).pipe(
          Stream.concat(inner),
          Stream.concat(Stream.make(`<!--${streamEndText(id)}-->`)),
        );
      }),
      Stream.unwrap,
    );
  }

  if (typeof node === "object" && Symbol.iterator in node && !("type" in node)) {
    return Stream.flatMap(Stream.fromIterable(node as Iterable<Renderable>), (child) =>
      renderHydratableSSRNode(child as Renderable, counter, ctx),
    );
  }

  if (typeof node === "object" && "type" in node && !(Symbol.iterator in node)) {
    const { type, props } = node as { type: unknown; props: Record<string, unknown> };

    if (type === FRAGMENT) {
      return fragmentToHydratableSSR(props, counter, ctx);
    }

    if (type === SUSPENSE_BOUNDARY) {
      const sp = props as unknown as Boundary.SuspenseProps;
      if (ctx === null) {
        return renderHydratableSSRNode((sp.fallback ?? null) as Renderable, counter, null);
      }
      return renderSuspenseSSRInline(sp, ctx, (n) => renderHydratableSSRNode(n, counter, ctx));
    }

    if (type === FAILURE_BOUNDARY) {
      // Hydratable SSR: thread the collector so a handled server-boundary load
      // failure emits its `data-weft-boundary-failure` payload before the fallback.
      return renderBoundarySSR(
        props as unknown as Boundary.FailureProps & { children: Renderable[] },
        ctx?.failureCollector ?? null,
        (n) => renderHydratableSSRNode(n, counter, ctx),
      );
    }

    if (type === SERVER_BOUNDARY) {
      // Hydratable SSR: emit the encoded payload inline at the cursor, then the
      // render(data) HTML, so client hydrate reads it positionally. AC-10.
      return renderServerBoundarySSR(
        props as unknown as ServerBoundarySSRProps,
        true,
        ctx?.failureCollector ?? null,
        (n) => renderHydratableSSRNode(n, counter, ctx),
      );
    }

    if (type === LIST) {
      return listToHydratableSSR(props as unknown as ListSSRProps, counter, ctx);
    }

    if (typeof type === "string") {
      const openTag = Stream.fromEffect(
        serializeProps(props).pipe(Effect.map((attrs) => `<${type}${attrs}>`)),
      );
      if (VOID_ELEMENTS.has(type)) return openTag;
      return openTag.pipe(
        Stream.concat(fragmentToHydratableSSR(props, counter, ctx)),
        Stream.concat(Stream.make(`</${type}>`)),
      );
    }

    if (typeof type === "function") {
      return renderHydratableSSRNode(
        (type as (p: Record<string, unknown>) => Renderable)(props),
        counter,
        ctx,
      );
    }
  }

  return Stream.fail(
    new UnsupportedNodeTypeError({
      type: (node as { type?: unknown }).type,
      message: `Invalid Renderable type: expected string, FRAGMENT, or function, got ${typeof (node as { type?: unknown }).type}`,
    }),
  );
}

/**
 * Hydratable-SSR rendering of a `List.each` region (HY1): brackets the region
 * with `stream-start`/`stream-end` markers and each item with
 * `list-item-start`/`list-item-end` markers, matching exactly what the client
 * renderer emits so `hydrateList` can adopt the server DOM. Only the first
 * emission is rendered; reconciliation of later emissions is the client's job.
 * Region and item ids are drawn from the shared region counter in document
 * order (region, then each item before its content), mirroring the client's
 * `nextStreamId` allocation.
 */
function listToHydratableSSR(
  props: ListSSRProps,
  counter: RegionCounter,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const regionId = ++counter.current;
      const items = yield* firstListEmission(props.of);
      let inner: Stream.Stream<string, Error, AppRpcClientTag> = Stream.empty;
      items.forEach((item, index) => {
        const itemId = ++counter.current;
        inner = inner.pipe(
          Stream.concat(Stream.make(`<!--${listItemStartText(itemId)}-->`)),
          Stream.concat(renderHydratableSSRNode(props.render(item, index), counter, ctx)),
          Stream.concat(Stream.make(`<!--${listItemEndText(itemId)}-->`)),
        );
      });
      return Stream.make(`<!--${streamStartText(regionId)}-->`).pipe(
        Stream.concat(inner),
        Stream.concat(Stream.make(`<!--${streamEndText(regionId)}-->`)),
      );
    }),
  );
}

function fragmentToHydratableSSR(
  props: Record<string, unknown>,
  counter: RegionCounter,
  ctx: ServerSuspenseCtx | null,
): Stream.Stream<string, Error, AppRpcClientTag> {
  const children = "children" in props ? props.children : undefined;
  if (children == null) return Stream.empty;
  const arr = Array.isArray(children) ? children : [children];
  return Stream.flatMap(Stream.fromIterable(arr), (child) =>
    renderHydratableSSRNode(child as Renderable, counter, ctx),
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Plain-SSR stream with fallback-only Suspense handling. Used internally by
 * `renderToString` so that suspense boundaries emit the fallback without
 * comment markers or patch scripts.
 *
 * @internal
 */
export const renderToStreamFallbackOnly = (
  node: Renderable,
): Stream.Stream<string, Error, AppRpcClientTag> => renderSSRNode(node, null);

/**
 * Progressively serializes an Effect-infused JSX tree (`Renderable`) into a stream
 * of HTML string chunks, in render-tree order.
 *
 * suspense boundaries are fully supported: the fallback is emitted inline
 * between `<!-- suspense-start-N -->` / `<!-- suspense-end-N -->` comment
 * markers; a `<template>+<script>` patch chunk is appended after the main
 * document structure as each boundary resolves. The stream terminates only
 * after all pending boundaries have emitted their patch.
 */
export const renderToStream = (node: Renderable): Stream.Stream<string, Error, AppRpcClientTag> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const patchQueue = yield* Queue.unbounded<Option.Option<string>>();
      const pendingCount = yield* Ref.make(0);
      const idCounter = { current: 0 };
      const scope = yield* Effect.scope;
      // Plain SSR never emits failure payloads.
      const ctx: ServerSuspenseCtx = {
        patchQueue,
        pendingCount,
        idCounter,
        scope,
        failureCollector: null,
      };

      const mainStream = renderSSRNode(node, ctx).pipe(
        // After the main document tree is exhausted: if no suspense boundary was
        // encountered (pendingCount still 0), terminate the patch stream
        // immediately so it does not hang (AC-SS7).
        Stream.ensuring(
          Ref.get(pendingCount).pipe(
            Effect.flatMap((n) =>
              n === 0 ? Queue.offer(patchQueue, Option.none()).pipe(Effect.asVoid) : Effect.void,
            ),
          ),
        ),
      );

      return Stream.concat(mainStream, patchStream(patchQueue));
    }),
  );

/**
 * The patch queue as a string stream: emits each queued `Some` patch and
 * completes at the terminal `None`, so patches offered before the consumer
 * attaches are never dropped.
 *
 * @internal
 */
export const patchStream = (queue: Queue.Queue<Option.Option<string>>): Stream.Stream<string> =>
  Stream.fromQueue(queue).pipe(
    Stream.takeWhile(Option.isSome),
    Stream.map((patch) => patch.value),
  );

/**
 * Shared setup for the hydratable streaming passes: patch infrastructure, the
 * suspense context (resolution fibers forked into `scope`), and the marker-ed
 * main document stream with its terminal no-suspense queue shutdown (AC-SS7).
 * Used by both {@link renderToStreamHydratable} (combined stream) and
 * `renderToHydratableShell` (shell split, `streaming-shell.ts`).
 *
 * @internal
 */
export const makeHydratableSSR = (
  node: Renderable,
  scope: Scope.Scope,
): Effect.Effect<{
  readonly mainStream: Stream.Stream<string, Error, AppRpcClientTag>;
  readonly patches: Stream.Stream<string>;
}> =>
  Effect.gen(function* () {
    const patchQueue = yield* Queue.unbounded<Option.Option<string>>();
    // If the scope closes while resolution fibers are still pending (consumer
    // disconnect, AC-SH6), those fibers are interrupted before they can offer
    // the terminal None, so the patch stream would hang. Offer None on scope
    // close so the stream always terminates; harmless after a normal close (the
    // last-settling boundary already offered None).
    yield* Scope.addFinalizer(scope, Effect.asVoid(Queue.offer(patchQueue, Option.none())));
    const pendingCount = yield* Ref.make(0);
    const idCounter = { current: 0 };
    const failureCollector: FailureCollector = yield* Ref.make(
      Option.none<ServerBoundaryFailure>(),
    );
    const ctx: ServerSuspenseCtx = {
      patchQueue,
      pendingCount,
      idCounter,
      scope,
      failureCollector,
    };
    const counter: RegionCounter = { current: 0 };

    const mainStream = renderHydratableSSRNode(node, counter, ctx).pipe(
      Stream.ensuring(
        Ref.get(pendingCount).pipe(
          Effect.flatMap((n) =>
            n === 0 ? Queue.offer(patchQueue, Option.none()).pipe(Effect.asVoid) : Effect.void,
          ),
        ),
      ),
    );

    return { mainStream, patches: patchStream(patchQueue) };
  });

/**
 * Like {@link renderToStream}, but wraps each reactive (`Stream`/`Effect`)
 * region in `<!-- stream-start-N -->` … `<!-- stream-end-N -->` comment markers
 * so the client `hydrate` can locate reactive regions. Suspense streaming
 * patches include these markers in the resolved children HTML (AC-SS3).
 */
export const renderToStreamHydratable = (
  node: Renderable,
): Stream.Stream<string, Error, AppRpcClientTag> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { mainStream, patches } = yield* makeHydratableSSR(node, scope);
      return Stream.concat(mainStream, patches);
    }),
  );
