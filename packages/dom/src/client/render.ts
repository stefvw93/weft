import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  HashMap,
  HashSet,
  Option,
  Ref,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
  pipe,
} from "effect";
import {
  AppRpcClientTag,
  FAILURE_BOUNDARY,
  FRAGMENT,
  getElementDescriptor,
  isStream,
  LIST,
  SERVER_BOUNDARY,
  Source,
  Subscribable,
  SUSPENSE_BOUNDARY,
  toStream,
} from "@weftui/core";
import type { AppRpcClient, Boundary, ElementDescriptor, Renderable } from "@weftui/core";
import {
  BoundaryContext,
  HydrationMismatchError,
  UnsupportedNodeTypeError,
  RenderError,
  type RenderResult,
  type StreamSubscriptionError,
  type HydrationReady,
  RenderContext,
  SuspenseContext,
} from "~/data";
import {
  boundaryEndText,
  boundaryStartText,
  listItemEndText,
  listItemStartText,
  parseListItemMarker,
  parseStreamMarker,
  parseSuspenseMarker,
  streamEndText,
  streamStartText,
  SUSPENSE_FAILURE_ATTR,
  suspenseEndText,
  suspenseStartText,
  isEventHandler,
} from "~/shared";
import { nextBoundaryId, nextStreamId, nextSuspenseId } from "~/utilities";
import { BOUNDARY_FAILURE_ATTR, collectServerBoundaries } from "~/boundary-replay";

// ============================================================================
// DOM Prop Handling
// ============================================================================

/**
 * Sets all props on an element (attributes, properties, styles)
 */
export function setElementProps(
  element: HTMLElement,
  props: object,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    for (const [key, value] of Object.entries(props)) {
      // AC7: Skip children prop
      if (key === "children") {
        continue;
      }

      // Event handlers (onclick, onchange, etc.)
      if (isEventHandler(key)) {
        yield* setEventHandler(element, key, value);
        continue;
      }

      if (key === "ref" && typeof value === "object" && SubscriptionRef.isSubscriptionRef(value)) {
        yield* SubscriptionRef.set(value, Option.some(element));
        continue;
      }

      // Ref fan-out (props.specs.md AC14): an array of refs, typically produced
      // by `Props.merge`, sets every ref to this element. Non-ref entries are
      // skipped rather than disqualifying the whole array, because falling
      // through would serialize the array as a junk `ref` attribute and leave
      // the valid refs unset. An empty array is a no-op.
      if (key === "ref" && Array.isArray(value)) {
        yield* Effect.forEach(
          value.filter((item) => SubscriptionRef.isSubscriptionRef(item)),
          (ref) => SubscriptionRef.set(ref, Option.some(element)),
          { discard: true },
        );
        continue;
      }

      // AC10-AC13: Special handling for style
      if (key === "style") {
        yield* handleStyle(element, value);
        continue;
      }

      // AC7: Determine if property or attribute
      if (isProperty(element, key)) {
        yield* setProperty(element, key, value);
      } else {
        yield* setAttribute(element, key, value);
      }
    }
  });
}

/**
 * Determines if a prop should be set as property vs attribute
 */
function isProperty(element: HTMLElement, name: string): boolean {
  // AC7: data-* and aria-* always treated as attributes
  if (name.startsWith("data-") || name.startsWith("aria-")) {
    return false;
  }

  // AC7: Check prototype chain
  let proto = Object.getPrototypeOf(element);
  while (proto !== null) {
    if (Object.hasOwn(proto, name)) {
      return true;
    }
    proto = Object.getPrototypeOf(proto);
  }

  return name in element;
}

/**
 * Sets a property on an element (or subscribes to stream)
 */
function setProperty(
  element: HTMLElement,
  name: string,
  value: unknown,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    // AC14: Normalize Effect/Stream
    if (isStream(value) || Effect.isEffect(value)) {
      const stream = toStream(value);
      yield* subscribeToStream(
        stream,
        (val) => {
          // AC15: null/undefined removes property
          if (val === null || val === undefined) {
            delete (element as unknown as Record<string, unknown>)[name];
          } else {
            (element as unknown as Record<string, unknown>)[name] = val;
          }
        },
        `property:${name}`,
      );
    } else {
      // Static value
      if (value !== null && value !== undefined) {
        (element as unknown as Record<string, unknown>)[name] = value;
      }
    }
  });
}

/**
 * Sets an attribute on an element (or subscribes to stream)
 */
function setAttribute(
  element: HTMLElement,
  name: string,
  value: unknown,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    // AC14: Normalize Effect/Stream
    if (isStream(value) || Effect.isEffect(value)) {
      const stream = toStream(value);
      yield* subscribeToStream(
        stream,
        (val) => {
          // AC15: null/undefined removes attribute
          if (val === null || val === undefined) {
            element.removeAttribute(name);
          } else {
            const serialized = serializeAttributeValue(val);
            if (serialized !== undefined) {
              // AC8: Boolean attributes
              if (typeof val === "boolean") {
                if (val) {
                  element.setAttribute(name, "");
                } else {
                  element.removeAttribute(name);
                }
              } else {
                element.setAttribute(name, serialized);
              }
            }
          }
        },
        `attribute:${name}`,
      );
    } else {
      // Static value
      const serialized = serializeAttributeValue(value);
      if (serialized !== undefined) {
        // AC8: Boolean attributes
        if (typeof value === "boolean") {
          if (value) {
            element.setAttribute(name, "");
          } else {
            element.removeAttribute(name);
          }
        } else {
          element.setAttribute(name, serialized);
        }
      }
    }
  });
}

/**
 * Serializes attribute value to string
 */
function serializeAttributeValue(value: unknown): string | undefined {
  // AC9: undefined and null -> skip
  if (value === undefined || value === null) {
    return undefined;
  }

  // AC9: Convert to string
  // oxlint-disable-next-line typescript/no-base-to-string
  return String(value);
}

/**
 * Handles style attribute (string, object, or stream)
 */
function handleStyle(
  element: HTMLElement,
  value: unknown,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    // AC13: Stream of styles
    if (isStream(value) || Effect.isEffect(value)) {
      const stream = toStream(value);
      yield* subscribeToStream(
        stream,
        (val) => {
          // AC13: String -> setAttribute
          if (typeof val === "string") {
            element.setAttribute("style", val);
          }
          // AC13: Object -> replace all properties
          else if (typeof val === "object" && val !== null) {
            // Clear existing styles
            element.style.cssText = "";
            // Set new styles
            for (const [key, styleValue] of Object.entries(val)) {
              if (styleValue !== undefined && styleValue !== null) {
                element.style.setProperty(camelToKebab(key), String(styleValue as string | number));
              }
            }
          }
        },
        "style",
      );
      return;
    }

    // AC10: String form
    if (typeof value === "string") {
      element.setAttribute("style", value);
      return;
    }

    // AC11-AC12: Object form
    if (typeof value === "object" && value !== null) {
      yield* setStyleFromObject(element, value as Record<string, unknown>);
    }
  });
}

/**
 * Sets style from object form
 */
function setStyleFromObject(
  element: HTMLElement,
  styleObj: Record<string, unknown>,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    for (const [key, value] of Object.entries(styleObj)) {
      // AC12: Handle stream properties
      if (isStream(value) || Effect.isEffect(value)) {
        const stream = toStream(value);
        yield* subscribeToStream(
          stream,
          (val) => {
            if (val !== undefined && val !== null) {
              // oxlint-disable-next-line typescript/no-base-to-string
              element.style.setProperty(camelToKebab(key), String(val));
            }
          },
          `style.${key}`,
        );
      } else {
        // AC11: Static style property
        if (value !== undefined && value !== null) {
          // oxlint-disable-next-line typescript/no-base-to-string
          element.style.setProperty(camelToKebab(key), String(value));
        }
      }
    }
  });
}

/**
 * Converts camelCase to kebab-case for CSS properties
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * True when every reason in the cause is teardown noise: fiber interruption
 * (unmount, content-scope rotation) or the internal `Cause.Done`
 * producer-shutdown signal a pump can surface when its source queue closes
 * mid-teardown. Such exits are never reported as errors.
 */
function isTeardownCause(cause: Cause.Cause<unknown>): boolean {
  return cause.reasons.every(
    (reason) =>
      reason._tag === "Interrupt" ||
      (reason._tag === "Fail" && Cause.isDone(reason.error)) ||
      (reason._tag === "Die" && Cause.isDone(reason.defect)),
  );
}

/**
 * Forks a reactive-subscription effect into `scope`, self-supervised: the
 * single forked fiber reports its own exit via `Effect.onExit` (no watcher
 * fiber).
 *
 * With an enclosing Boundary, non-interrupt failure causes are routed to
 * `BoundaryContext.reportError`. Without one, the failure is published to the
 * owning app's unhandled-error hub via `reportUnhandled` (default:
 * `Effect.logError` annotated with `weft.region` while the hub has no
 * subscribers). Interrupt-only exits (unmount teardown, content-scope
 * rotation) are never reported in either branch.
 *
 * @param effect - The subscription effect to fork (e.g. a `Stream.runForEach` pump).
 * @param scope - The scope owning the forked fiber's lifetime.
 * @param errorContext - Region/prop identifier published as the hub region (e.g. `attribute:<name>`, `child:stream-<id>`).
 * @param reportUnhandled - The owning root's `RenderContext.reportUnhandled`.
 */
function forkSupervised<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  scope: Scope.Scope,
  errorContext: string,
  reportUnhandled: (cause: Cause.Cause<unknown>, region: string) => Effect.Effect<void>,
): Effect.Effect<Fiber.Fiber<A, E>, never, R> {
  return Effect.gen(function* () {
    const boundaryCtx = yield* Effect.serviceOption(BoundaryContext);
    // Single fiber: the pump self-reports via `Effect.onExit` (no watcher
    // fiber, LM17). Interrupt-only exits (unmount/content-scope teardown) are
    // never reported, in the with-Boundary branch too (LM18): unmounting a
    // boundary-enclosed region must not trigger recovery. Mixed causes
    // (failure + interrupt) still route.
    const supervised = pipe(
      effect,
      Effect.onExit((exit) =>
        Exit.isFailure(exit) && !isTeardownCause(exit.cause)
          ? Option.isSome(boundaryCtx)
            ? boundaryCtx.value.reportError(exit.cause)
            : reportUnhandled(exit.cause, errorContext)
          : Effect.void,
      ),
    );
    return yield* Effect.forkIn(supervised, scope);
  });
}

/**
 * Subscribes to a stream and runs callback for each emission.
 * If a `BoundaryContext` is present, stream failures are routed to it.
 */
function subscribeToStream<A>(
  stream: Stream.Stream<A>,
  onValue: (value: A) => void | Promise<void>,
  errorContext: string,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const boundary = yield* Effect.serviceOption(BoundaryContext);

    // Latest-value cell: the pump only overwrites it; the DOM write (`onValue`)
    // runs on the app's single flush fiber, so bursts conflate structurally.
    const cell = yield* context.loom.register<A>({
      label: errorContext,
      scope: context.scope,
      boundary,
      reportUnhandled: context.reportUnhandled,
      commit: (value) => Effect.sync(() => void onValue(value)),
    });
    const fiber = yield* forkSupervised(
      Stream.runForEach(stream, cell.write),
      context.scope,
      errorContext,
      context.reportUnhandled,
    );
    cell.attachPumpFiber(fiber);
  });
}

/**
 * Sets an event handler on an element (supports static, Stream, and Effect handlers)
 */
function setEventHandler(
  element: HTMLElement,
  name: string,
  value: unknown,
): Effect.Effect<void, StreamSubscriptionError, RenderContext> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const eventName = name.slice(2).toLowerCase();

    // Track current listener for cleanup
    let currentListener: ((e: Event) => void) | null = null;

    const removeListener = () => {
      if (currentListener) {
        element.removeEventListener(eventName, currentListener);
        currentListener = null;
      }
    };

    const attachListener = (handler: unknown) => {
      // Remove previous listener if any
      removeListener();

      // null/false/undefined = no handler
      if (handler == null || handler === false) {
        return;
      }

      if (typeof handler !== "function") {
        return; // Invalid handler, ignore
      }

      // Create wrapper that detects Effect return values
      currentListener = (event: Event) => {
        const result = handler(event);
        if (Effect.isEffect(result)) {
          // Provide the root scope as the ambient `Scope.Scope` so scoped work a
          // handler forks (`Effect.forkScoped`, `acquireRelease`, …) is owned by
          // the root and interrupted at `unmount`. Observe the full exit
          // (failures AND defects) and publish it to the app's unhandled-error
          // hub (identical in development and production). Interruption is never
          // reported.
          context.runtime.runFork(
            pipe(
              result as Effect.Effect<void, unknown, never>,
              Effect.provideService(Scope.Scope, context.rootScope),
              Effect.exit,
              Effect.flatMap((exit) =>
                Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
                  ? context.reportUnhandled(exit.cause, `event:${name}`)
                  : Effect.void,
              ),
            ),
          );
        }
      };

      element.addEventListener(eventName, currentListener);
    };

    // Register cleanup finalizer with scope
    yield* Scope.addFinalizer(context.scope, Effect.sync(removeListener));

    // Handle static vs reactive handlers
    if (isStream(value) || Effect.isEffect(value)) {
      const stream = toStream(value);
      yield* subscribeToStream(stream, (handler) => attachListener(handler), `event:${name}`);
    } else {
      // Static handler
      attachListener(value);
    }
  });
}

// ============================================================================
// Suspense Boundary
// ============================================================================

/**
 * Recovery body shared by {@link renderBoundary} (mount) and
 * {@link hydrateFailureBoundary} (hydrate, AC-H13): awaits the boundary's error
 * deferred, closes the subtree scope, and swaps the nodes between the boundary
 * markers for the fallback returned by `props.match`. A `match` returning
 * `null` propagates the cause to the nearest parent boundary (spec AC15); with
 * no parent the cause is published to the app's unhandled-error hub with
 * region `boundary:outermost`.
 */
function boundaryRecoveryEffect(
  props: Boundary.FailureProps,
  errorDeferred: Deferred.Deferred<void, Cause.Cause<unknown>>,
  subtreeScope: Scope.Closeable,
  parentBoundary: Option.Option<BoundaryContext["Service"]>,
  startMarker: Comment,
  endMarker: Comment,
): Effect.Effect<
  void,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    // The deferred is only ever failed (via reportError), never succeeded, so
    // flip's residual success-as-error path is dead. Discharge it.
    const cause = yield* Deferred.await(errorDeferred).pipe(
      Effect.flip,
      Effect.catch(() => Effect.interrupt),
    );
    const fallbackNode = props.match(cause);
    yield* Scope.close(subtreeScope, Exit.void);

    if (fallbackNode === null) {
      if (Option.isSome(parentBoundary)) {
        // Propagate to the nearest parent boundary (spec AC15).
        return yield* parentBoundary.value.reportError(cause);
      }
      // No parent boundary: publish to the app's unhandled-error hub.
      return yield* context.reportUnhandled(cause, "boundary:outermost");
    }

    removeNodesBetweenMarkers(startMarker, endMarker);
    const fallbackNodes = yield* renderNode(fallbackNode as Renderable);
    const parent = endMarker.parentNode;
    if (parent !== null) {
      if (fallbackNodes !== null) {
        if (Array.isArray(fallbackNodes)) {
          for (const n of fallbackNodes as Node[]) {
            parent.insertBefore(n, endMarker);
          }
        } else {
          parent.insertBefore(fallbackNodes as Node, endMarker);
        }
      }
    }
  });
}

/**
 * Implements a `Boundary.*` error boundary for the DOM renderer.
 *
 * Renders the children in a forked subtree scope. Construction-time errors are
 * caught immediately; post-mount stream errors are routed via `BoundaryContext`
 * and trigger a DOM swap to the fallback returned by `props.match`.
 */
function renderBoundary(
  props: Boundary.FailureProps & { children: Renderable[] },
): Effect.Effect<
  readonly Node[],
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const parentBoundary = yield* Effect.serviceOption(BoundaryContext);

    const id = nextBoundaryId();
    const startMarker = document.createComment(boundaryStartText(id));
    const endMarker = document.createComment(boundaryEndText(id));

    const subtreeScope = yield* Scope.fork(context.scope, "sequential");
    const subtreeContext = { ...context, scope: subtreeScope };

    const errorDeferred = yield* Deferred.make<void, import("effect").Cause.Cause<unknown>>();

    const boundaryService: BoundaryContext["Service"] = {
      reportError: (cause) => Deferred.fail(errorDeferred, cause).pipe(Effect.asVoid),
    };

    const childNodes = yield* pipe(
      renderChildren(props.children as readonly Renderable[]),
      Effect.provideService(BoundaryContext, boundaryService),
      Effect.provideService(RenderContext, subtreeContext),
      Effect.provideService(Scope.Scope, subtreeScope),
      Effect.catchCause((cause) => {
        const fallbackNode = props.match(cause);
        if (fallbackNode === null) return Effect.failCause(cause);
        return pipe(
          Scope.close(subtreeScope, Exit.void),
          Effect.flatMap(() => renderNode(fallbackNode as Renderable)),
          Effect.map((n): readonly Node[] =>
            n === null ? [] : Array.isArray(n) ? (n as Node[]) : [n as Node],
          ),
        );
      }),
    );

    // Recovery fiber: awaits error deferred, swaps DOM on trigger
    yield* Effect.forkIn(
      boundaryRecoveryEffect(
        props,
        errorDeferred,
        subtreeScope,
        parentBoundary,
        startMarker,
        endMarker,
      ),
      context.scope,
    );

    return [startMarker, ...childNodes, endMarker] as readonly Node[];
  });
}

/**
 * Implements the suspense boundary (`Boundary.suspend`) for the DOM renderer.
 *
 * Shows `props.fallback` (bracketed by comment markers) while any async child
 * component is pending, then atomically swaps to the resolved children once
 * every registered child has emitted its first value.
 *
 * A sentinel of `1` is added to `pendingRef` at the start so that a
 * very-fast child cannot complete `allSettled` before all siblings have had a
 * chance to register. The sentinel is released after `renderChildren` returns.
 */
function renderSuspenseBoundary(
  props: Boundary.SuspenseProps & { children?: Renderable },
): Effect.Effect<
  readonly Node[],
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;

    // ── 1. Sentinel: start at 1 so a fast child can't settle early ──────────
    const pendingRef = yield* Ref.make(1);

    // ── 2. Fires when all children (+ sentinel) have settled ─────────────────
    const allSettled = yield* Deferred.make<void>();

    // ── 3. Service exposed to child components in this boundary ──────────────
    const settle: Effect.Effect<void> = pipe(
      Ref.updateAndGet(pendingRef, (n) => n - 1),
      Effect.flatMap((n) =>
        n <= 0 ? Effect.asVoid(Deferred.succeed(allSettled, undefined)) : Effect.void,
      ),
    );

    const suspenseService = {
      register: Ref.update(pendingRef, (n) => n + 1),
      settle,
    };

    // ── 4. Render children with SuspenseContext in scope ─────────────────────
    const rawChildren = props.children;
    const childArray: readonly Renderable[] =
      rawChildren === undefined
        ? []
        : Array.isArray(rawChildren)
          ? (rawChildren as readonly Renderable[])
          : [rawChildren as Renderable];

    // Wrap direct *reactive* Effect/Stream children in function-component
    // descriptors so they go through renderComponent and register/settle with
    // this boundary. Static-markup Nodes carry a descriptor (and are Effects too,
    // iterable under Effect 4). Pass them through so renderNode renders them
    // synchronously; wrapping them would defer to an async fiber that no longer
    // completes at mount, and they never suspend anyway.
    const suspenseChildren = childArray.map((child): Renderable => {
      if (
        getElementDescriptor(child) === undefined &&
        (Effect.isEffect(child) || isStream(child))
      ) {
        const fn = (): Renderable => child;
        return { type: fn, props: {} };
      }
      return child;
    });

    // renderNode handles arrays via its iterable branch → returns readonly Node[]
    const childResult = yield* renderNode(suspenseChildren as Renderable).pipe(
      Effect.provideService(SuspenseContext, suspenseService),
    );

    const childNodes: readonly Node[] = (() => {
      if (childResult === null) return [];
      if (Array.isArray(childResult)) return childResult as Node[];
      return [childResult as Node];
    })();

    // ── 5. Release sentinel ──────────────────────────────────────────────────
    yield* settle;

    // ── 6. Fast path: all children were synchronous, no boundary needed ──────
    const polled = yield* Deferred.poll(allSettled);
    if (Option.isSome(polled)) {
      return childNodes;
    }

    // ── 7. Async path: show fallback while children settle ───────────────────
    const boundaryId = yield* nextSuspenseId();
    const startMarker = document.createComment(suspenseStartText(boundaryId));
    const endMarker = document.createComment(suspenseEndText(boundaryId));

    // ── 8. Render fallback (null/undefined → empty, only markers shown) ──────
    const fallbackResult = yield* renderNode((props.fallback ?? null) as Renderable);
    const fallbackNodes: Node[] = [];
    if (fallbackResult !== null) {
      if (Array.isArray(fallbackResult)) {
        fallbackNodes.push(...(fallbackResult as Node[]));
      } else {
        fallbackNodes.push(fallbackResult as Node);
      }
    }

    // Put child nodes into a DocumentFragment so that nested Suspense swaps
    // can find their parent (innerStart.parentNode = childFragment) even while
    // the outer boundary is still pending and its nodes are detached.
    const childFragment = document.createDocumentFragment();
    for (const node of childNodes) {
      childFragment.appendChild(node);
    }

    // ── 9. Fork swap fiber in the render scope ───────────────────────────────
    const swapEffect = Effect.gen(function* () {
      yield* Deferred.await(allSettled);

      // Remove fallback content between markers.
      removeNodesBetweenMarkers(startMarker, endMarker);

      // Insert resolved children (from fragment) before the end marker.
      // insertBefore with a DocumentFragment moves all its children at once.
      const parent = endMarker.parentNode;
      if (parent !== null) {
        parent.insertBefore(childFragment, endMarker);
        startMarker.remove();
        endMarker.remove();
      }
    });

    yield* Effect.forkIn(swapEffect, context.scope);

    // ── 10. Return boundary: [startMarker, ...fallbackNodes, endMarker] ──────
    return [startMarker, ...fallbackNodes, endMarker];
  });
}

/**
 * Implements the **client-first mount** of a {@link Boundary.rpc} region (C1):
 * the SPA-navigation path with no SSR payload to replay. Models
 * {@link renderSuspenseBoundary}: shows `props.fallback` bracketed by comment
 * markers, then forks a fiber that resolves the rpc through the ambient
 * {@link AppRpcClientTag} (`call(tag, payload())`), seeds a live
 * {@link Boundary.Resource} from the decoded success, renders `render(resource)`,
 * and atomically swaps it in for the fallback.
 *
 * With no {@link AppRpcClientTag} in context (a router-less mount) the boundary
 * cannot be resolved: a descriptive, typed {@link RenderError} is raised (not a
 * defect), mirroring how the hydrate path degrades. A failed rpc call after mount
 * is logged and leaves the fallback in place (there is no prior value to keep:
 * stale-on-error applies only to a subsequent {@link Boundary.Resource.refetch}).
 */
function renderServerBoundary(
  props: ServerBoundaryProps,
): Effect.Effect<
  readonly Node[],
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const client = yield* Effect.serviceOption(AppRpcClientTag);

    // No router/rpc present: a client-first mount cannot resolve the boundary.
    if (Option.isNone(client)) {
      return yield* Effect.fail(
        new RenderError({
          cause: undefined,
          message:
            `Boundary.rpc "${props.tag}" was mounted client-first without an AppRpcClient ` +
            "in context. Mount the app under @weftui/router (RouterLive), which provides " +
            "the rpc client, so the boundary can resolve its data.",
        }),
      );
    }

    const rpcClient = client.value;
    const id = nextBoundaryId();
    const startMarker = document.createComment(boundaryStartText(id));
    const endMarker = document.createComment(boundaryEndText(id));

    // Render the fallback inline between the markers while the rpc resolves.
    const fallbackResult = yield* renderNode((props.fallback ?? null) as Renderable);
    const fallbackNodes: Node[] = [];
    if (fallbackResult !== null) {
      if (Array.isArray(fallbackResult)) {
        fallbackNodes.push(...(fallbackResult as Node[]));
      } else {
        fallbackNodes.push(fallbackResult as Node);
      }
    }

    // Forked resolution: call the rpc, seed a Resource from the decoded success,
    // render render(resource), and swap it in for the fallback between markers.
    const swapEffect = Effect.gen(function* () {
      const data = yield* rpcClient.call(props.tag, props.payload());
      const resource = yield* makeClientResource(props.tag, props.payload, data, client);
      const rendered = yield* renderNode(props.render(resource));

      removeNodesBetweenMarkers(startMarker, endMarker);
      const parent = endMarker.parentNode;
      if (parent !== null && rendered !== null) {
        if (Array.isArray(rendered)) {
          for (const node of rendered as Node[]) {
            parent.insertBefore(node, endMarker);
          }
        } else {
          parent.insertBefore(rendered as Node, endMarker);
        }
      }
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError(
          `[weft] Boundary.rpc "${props.tag}" mount failed to resolve; fallback left in place.`,
          cause,
        ),
      ),
    );

    yield* Effect.forkIn(swapEffect, context.scope);

    return [startMarker, ...fallbackNodes, endMarker] as readonly Node[];
  });
}

// ============================================================================
// Core Renderer
// ============================================================================

/**
 * Main rendering function that converts Renderable to DOM nodes.
 * Handles all Renderable types and sets up reactive subscriptions.
 */
export function renderNode(
  node: Renderable,
): Effect.Effect<
  RenderResult,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    // AC2: Handle primitives
    if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
      return document.createTextNode(String(node));
    }

    // AC2: Boolean, null, undefined, void -> render nothing
    if (typeof node === "boolean" || node === null || node === undefined) {
      return null;
    }

    // Check for Stream/Effect first (before iterables, since Stream might be iterable)
    if (isStream(node) || Effect.isEffect(node)) {
      // Static markup (h.*, h.fragment, Boundary.*) carries its descriptor.
      // Render it directly, without executing the Effect.
      const descriptor = getElementDescriptor(node);
      if (descriptor !== undefined) {
        return yield* renderNode(descriptor);
      }
      // Untagged Effect: probe for synchronous resolution (e.g. a synchronous
      // Component.gen used directly as a child) so it renders inline. The probe
      // runs under the *ambient* context (Effect 4's runSyncExit otherwise uses a
      // bare runtime with no services, so a component that reads a service, e.g. a
      // route leaf reading `Router`, would fail the probe and be forced onto the
      // async stream-marker path, breaking in-place reuse against a later static
      // render). A genuinely async Effect resolves to a failure exit
      // (AsyncFiberException) and falls through to the fork + stream-marker path.
      if (Effect.isEffect(node)) {
        const services = yield* Effect.context<never>();
        // @effect-diagnostics-next-line runEffectInsideEffect:off -- intentional sync probe
        const exit = Effect.runSyncExitWith(services)(
          node as Effect.Effect<Renderable, never, never>,
        );
        if (Exit.isSuccess(exit)) {
          return yield* renderNode(exit.value);
        }
      }
      const stream = toStream<Renderable>(node);
      const markers = yield* handleStreamChild(stream);
      return markers;
    }

    // AC3: Handle iterables (including arrays)
    if (typeof node === "object" && Symbol.iterator in node && !("type" in node)) {
      const flattened = flattenChildren(node);
      return yield* renderChildren(flattened);
    }

    // Handle JSX elements: { type, props }
    if (typeof node === "object" && "type" in node && !(Symbol.iterator in node)) {
      const element = node as { type: unknown; props: object };
      const { type, props } = element;

      // AC6: Fragment
      if (type === FRAGMENT) {
        return yield* renderFragment(props);
      }

      // Suspense boundary
      if (type === SUSPENSE_BOUNDARY) {
        return yield* renderSuspenseBoundary(props as Boundary.SuspenseProps);
      }

      // Server (rpc) boundary: client-first mount (C1). Hydrate has its own
      // branch (`hydrateServerBoundary`); this is the SPA-navigation path.
      if (type === SERVER_BOUNDARY) {
        return yield* renderServerBoundary(props as ServerBoundaryProps);
      }

      // Error boundary
      if (type === FAILURE_BOUNDARY) {
        return yield* renderBoundary(props as Boundary.FailureProps & { children: Renderable[] });
      }

      // Keyed list region (List.each)
      if (type === LIST) {
        return yield* renderList(props as ListProps);
      }

      // AC4: Element (string type)
      if (typeof type === "string") {
        return yield* renderElement(type, props);
      }

      // AC5: Function component
      if (typeof type === "function") {
        return yield* renderComponent(type as (props: object) => Renderable, props);
      }

      // AC23: Invalid element type
      return yield* Effect.fail(
        new UnsupportedNodeTypeError({
          type,
          message: `Invalid Renderable type: expected string, FRAGMENT, or function, got ${typeof type}`,
        }),
      );
    }

    // Shouldn't reach here, but handle gracefully
    return null;
  });
}

/**
 * Flattens iterable children recursively
 */
function flattenChildren(node: Renderable): readonly Renderable[] {
  const result: Renderable[] = [];

  function flatten(item: Renderable): void {
    // Don't try to iterate streams/effects
    if (isStream(item) || Effect.isEffect(item)) {
      result.push(item);
      return;
    }

    if (typeof item === "object" && item !== null && Symbol.iterator in item && !("type" in item)) {
      for (const child of item as Iterable<Renderable>) {
        flatten(child);
      }
    } else {
      result.push(item);
    }
  }

  flatten(node);
  return result;
}

/**
 * Renders an array of children nodes
 */
function renderChildren(
  children: readonly Renderable[],
): Effect.Effect<
  readonly Node[],
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const nodes: Node[] = [];

    for (const child of children) {
      // Reactive stream/effect children render through the async stream path.
      // Static-markup Nodes are Effects too (and iterable under Effect 4), but
      // carry a descriptor. Render them synchronously via renderNode so they
      // are in the DOM at mount rather than deferred behind stream markers.
      if (
        getElementDescriptor(child) === undefined &&
        (isStream(child) || Effect.isEffect(child))
      ) {
        const stream = toStream<Renderable>(child);
        const markers = yield* handleStreamChild(stream);
        nodes.push(...markers);
      } else {
        const result = yield* renderNode(child);

        if (result !== null) {
          if (Array.isArray(result)) {
            nodes.push(...result);
          } else {
            nodes.push(result as Node);
          }
        }
      }
    }

    return nodes;
  });
}

/**
 * Renders a fragment Renderable (type: FRAGMENT)
 */
function renderFragment(
  props: object,
): Effect.Effect<
  readonly Node[],
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const children = "children" in props ? props.children : undefined;

    if (children === undefined) {
      return [];
    }

    const childArray = Array.isArray(children) ? children : [children];
    return yield* renderChildren(childArray);
  });
}

/**
 * Renders an element Renderable (type: string)
 */
function renderElement(
  type: string,
  props: object,
): Effect.Effect<
  HTMLElement,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    // AC4: Create element using document.createElement
    const element = document.createElement(type);

    // AC4: Set attributes/props first
    yield* setElementProps(element, props);

    // AC4: Then append children
    const children = "children" in props ? props.children : undefined;

    if (children !== undefined) {
      const childArray = Array.isArray(children) ? children : [children];

      for (const child of childArray) {
        // Check if child is a *reactive* stream/effect. Static-markup Nodes are
        // Effects too (and, in Effect 4, iterable), but they carry a descriptor
        // and must render synchronously via renderNode. Routing them through the
        // async stream path would leave them unrendered when mount resolves.
        if (
          getElementDescriptor(child) === undefined &&
          (isStream(child) || Effect.isEffect(child))
        ) {
          const stream = toStream<Renderable>(child);
          const markers = yield* handleStreamChild(stream);
          for (const marker of markers) {
            element.appendChild(marker);
          }
        } else {
          const result = yield* renderNode(child);
          if (result !== null) {
            if (Array.isArray(result)) {
              for (const node of result) {
                element.appendChild(node);
              }
            } else {
              element.appendChild(result as Node);
            }
          }
        }
      }
    }

    return element;
  });
}

/**
 * Renders a function component Renderable (type: function)
 */
function renderComponent(
  component: (props: object) => Renderable,
  props: object,
): Effect.Effect<
  RenderResult,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    // AC5: Call function once with props (ephemeral execution)
    const result = component(props);

    // AC5: Handle Effect<Renderable> or Stream<Renderable>
    if (isStream(result) || Effect.isEffect(result)) {
      const context = yield* RenderContext;

      // AC-10/12: Fork a per-instance child scope so that prop pump fibers
      // (spawned via Effect.forkScoped inside toSubscribable) are tied to this
      // component instance and not to the mount-level scope. The instance scope
      // is a child of context.scope, so closing context.scope closes it too.
      const instanceScope = yield* Scope.fork(context.scope, "sequential");
      const instanceContext = { ...context, scope: instanceScope };

      // Check whether this component is inside a Suspense boundary.
      const suspenseCtx = yield* Effect.serviceOption(SuspenseContext);
      const stream = toStream<Renderable>(result);

      // Ack-or-exit settle: fires exactly once, on the first *committed*
      // emission, on discard before one, or on a silent pump exit. An empty
      // stream therefore settles instead of hanging the fallback (LM15).
      let settleOnce: Effect.Effect<void> | undefined;
      if (Option.isSome(suspenseCtx)) {
        // Register before subscribing so the boundary knows about this child.
        yield* suspenseCtx.value.register;
        let settled = false;
        settleOnce = Effect.suspend(() => {
          if (settled) {
            return Effect.void;
          }
          settled = true;
          return suspenseCtx.value.settle;
        });
      }

      // AC22: Component returning stream treated as stream child.
      // Thread instanceScope as both the ambient Scope.Scope (satisfies
      // forkScoped inside the component body) and RenderContext.scope (so
      // nested handleStreamChild calls fork into instanceScope).
      return yield* handleStreamChild(stream, { onFirstCommit: settleOnce }).pipe(
        Effect.provideService(RenderContext, instanceContext),
        Effect.provideService(Scope.Scope, instanceScope),
      );
    }

    // AC5: Plain Renderable
    return yield* renderNode(result);
  });
}

/**
 * Handles a child that is a Stream by setting up comment markers and a
 * latest-value Loom cell.
 *
 * AC-13/14: A fresh **content scope** is forked from `context.scope` for each
 * committed emission, inside the commit closure (which runs only on the app's
 * flush fiber). The previous content scope is closed before the new one is
 * opened, so nested fibers/pumps from the previous emission are cancelled on
 * re-emit rather than accumulating. The pump fiber itself lives in
 * `context.scope` (the enclosing scope), not in the content scope. Emissions
 * arriving faster than commits drain conflate to the newest value.
 *
 * `options.onFirstCommit` is the ack-or-exit settle hook (idempotent at the
 * caller): it fires on the first successful commit, when the cell is discarded
 * before one, or when the pump exits without ever writing (empty/failed
 * stream). Suspense passes its `settle` here (LM15).
 */
function handleStreamChild(
  stream: Stream.Stream<Renderable>,
  options?: { readonly onFirstCommit?: Effect.Effect<void> },
): Effect.Effect<
  readonly Node[],
  StreamSubscriptionError | RenderError | UnsupportedNodeTypeError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const boundary = yield* Effect.serviceOption(BoundaryContext);
    // Ambient snapshot for the commit closure: commits run on the flush fiber,
    // which has none of the subscribe-site's optional services (Boundary,
    // Suspense). The old pump inherited them via fork; re-provide explicitly.
    const ambient = yield* Effect.context<never>();

    // AC19: Create comment markers
    const streamId = yield* nextStreamId();
    const [startMarker, endMarker] = createStreamMarkers(streamId);

    // Mutable slot: the content scope from the most recent emission.
    // Closed before each new emission so nested fibers don't accumulate.
    let currentContentScope: Scope.Closeable | null = null;

    const cell = yield* context.loom.register<Renderable>({
      label: `child:stream-${streamId}`,
      scope: context.scope,
      boundary,
      reportUnhandled: context.reportUnhandled,
      onFirstCommit: options?.onFirstCommit,
      onDiscard: options?.onFirstCommit,
      commit: (value) =>
        Effect.gen(function* () {
          // Close the previous content scope (cancels any nested fibers/pumps).
          if (currentContentScope !== null) {
            yield* Scope.close(currentContentScope, Exit.void);
          }
          // Fork a fresh child scope for this emission from the enclosing scope.
          currentContentScope = yield* Scope.fork(context.scope, "sequential");
          const contentContext = { ...context, scope: currentContentScope };

          // Render under the content scope: RenderContext.scope and Scope.Scope
          // both point at currentContentScope per the governing rule.
          yield* updateStreamChild(startMarker, endMarker, value).pipe(
            Effect.provideService(RenderContext, contentContext),
            Effect.provideService(Scope.Scope, currentContentScope),
          );
        }).pipe(Effect.provide(ambient)),
    });

    // Pump: overwrite the cell per emission; commits run on the flush fiber.
    // Ack-or-exit: a stream that ends without ever writing settles here.
    let pump = Stream.runForEach(stream, cell.write);
    if (options?.onFirstCommit !== undefined) {
      const onSilentExit = options.onFirstCommit;
      pump = pipe(
        pump,
        Effect.ensuring(Effect.suspend(() => (cell.everWritten() ? Effect.void : onSilentExit))),
      );
    }

    // Pump fiber lives in the enclosing context.scope (not content scope).
    // Source failures route to the nearest BoundaryContext, or the app hub
    // when no boundary encloses the region (AC8).
    const fiber = yield* forkSupervised(
      pump,
      context.scope,
      `child:stream-${streamId}`,
      context.reportUnhandled,
    );
    cell.attachPumpFiber(fiber);

    // AC19: Return markers to be inserted.
    // Content will be committed asynchronously by the flush fiber.
    return [startMarker, endMarker] as const;
  });
}

/**
 * Creates start and end comment markers for stream child
 */
function createStreamMarkers(streamId: number): readonly [Comment, Comment] {
  const startMarker = document.createComment(streamStartText(streamId));
  const endMarker = document.createComment(streamEndText(streamId));
  return [startMarker, endMarker];
}

/**
 * Reconciles the region between the stream markers against `newNode`'s shape,
 * patching in place when the shape is unchanged rather than tearing down and
 * rebuilding (AC20, SP1–SP4). The new value's shape is read from its descriptor
 * / primitive type **before** rendering, so identity-preserving updates avoid
 * creating throwaway nodes and subscriptions:
 *
 * - **SP1/SP2** (text→text): the region holds one `Text` node and `newNode` is a
 *   `string`/`number`/`bigint` → update `.data` in place (only if it differs).
 * - **SP3** (same-tag element reuse): the region holds one `Element` whose tag
 *   matches `newNode`'s descriptor → reuse the node, re-apply props, recurse over
 *   children by position.
 * - **SP4** (fallback, any other shape change): remove the nodes between the
 *   markers, render `newNode`, and insert the result before the end marker.
 *
 * Content-scope rotation is owned by the caller (`handleStreamChild` /
 * `hydrateReactive`): it closes the previous emission's content scope before each
 * call, so SP3's re-applied props subscribe under a fresh scope and the prior
 * emission's prop subscriptions / event listeners are already torn down.
 *
 * Exported for reuse by the hydrator, which drives the same update flow against
 * markers adopted from server HTML rather than freshly created ones.
 */
export function updateStreamChild(
  startMarker: Comment,
  endMarker: Comment,
  newNode: Renderable,
): Effect.Effect<
  void,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const only = startMarker.nextSibling;
    const isSingle = only !== null && only !== endMarker && only.nextSibling === endMarker;

    // SP1/SP2 (text→text): patch the existing Text node in place.
    if (isSingle && only.nodeType === TEXT_NODE && isTextValue(newNode)) {
      const text = String(newNode);
      if ((only as Text).data !== text) {
        (only as Text).data = text;
      }
      return;
    }

    // SP3 (same-tag element reuse): keep the node, re-apply props, recurse children.
    if (isSingle && only.nodeType === ELEMENT_NODE) {
      const descriptor = staticElementDescriptor(newNode);
      if (
        descriptor !== undefined &&
        typeof descriptor.type === "string" &&
        (only as Element).tagName.toLowerCase() === descriptor.type.toLowerCase()
      ) {
        yield* patchElementInPlace(only as HTMLElement, descriptor);
        return;
      }
    }

    // SP4 (fallback): remove all nodes between markers, render, and insert.
    removeNodesBetweenMarkers(startMarker, endMarker);
    const result = yield* renderNode(newNode);
    const parent = startMarker.parentNode;
    if (parent !== null && result !== null) {
      if (Array.isArray(result)) {
        for (const node of result) {
          parent.insertBefore(node, endMarker);
        }
      } else {
        parent.insertBefore(result as Node, endMarker);
      }
    }
  });
}

/** Narrows a Renderable to the primitive values that render as a single Text node. */
function isTextValue(value: Renderable): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

/**
 * Reads the static {@link ElementDescriptor} a Renderable resolves to without
 * executing anything: a static-markup `Node` (carries its descriptor) or a bare
 * descriptor object. Returns `undefined` for primitives, iterables, and genuinely
 * reactive streams/effects (which have no statically-known shape).
 */
function staticElementDescriptor(node: Renderable): ElementDescriptor | undefined {
  const carried = getElementDescriptor(node);
  if (carried !== undefined) {
    return carried;
  }
  if (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    !(Symbol.iterator in node) &&
    !isStream(node) &&
    !Effect.isEffect(node)
  ) {
    return node as unknown as ElementDescriptor;
  }
  return undefined;
}

/**
 * SP3 element reuse: re-applies `descriptor.props` to a kept element (re-subscribing
 * reactive props under the caller's fresh content scope), then reconciles its
 * children. Children are patched positionally when each maps 1:1 to a single node
 * ({@link patchChildrenInPlace}); otherwise the element's children are rebuilt
 * wholesale, preserving the element node itself.
 */
function patchElementInPlace(
  element: HTMLElement,
  descriptor: ElementDescriptor,
): Effect.Effect<
  void,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    yield* setElementProps(element, descriptor.props);

    const children = descriptor.props["children"];
    const newChildren =
      children === undefined ? [] : Array.isArray(children) ? children : [children];

    const patched = yield* patchChildrenInPlace(element, newChildren as readonly Renderable[]);
    if (!patched) {
      while (element.firstChild !== null) {
        element.firstChild.remove();
      }
      yield* appendRenderedChildren(element, newChildren as readonly Renderable[]);
    }
  });
}

/**
 * Attempts an in-place positional patch of an element's children. Succeeds (returns
 * `true`, having patched) only when every new child maps to exactly one existing
 * DOM node of the matching kind: text→`Text`, same-tag element→`Element`. Any
 * mismatch (count, kind, multi-node child, reactive child) returns `false` having
 * mutated nothing, so the caller can rebuild cleanly. Element children recurse via
 * {@link patchElementInPlace}, preserving nested node identity.
 */
function patchChildrenInPlace(
  element: HTMLElement,
  newChildren: readonly Renderable[],
): Effect.Effect<
  boolean,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    const existing = Array.from(element.childNodes);
    if (existing.length !== newChildren.length) {
      return false;
    }

    // Validation pass (no mutation): every slot must be a 1:1, same-kind match.
    for (let i = 0; i < newChildren.length; i++) {
      const child = newChildren[i] as Renderable;
      const node = existing[i] as ChildNode;
      if (isTextValue(child)) {
        if (node.nodeType !== TEXT_NODE) {
          return false;
        }
      } else {
        const childDescriptor = staticElementDescriptor(child);
        if (
          childDescriptor === undefined ||
          typeof childDescriptor.type !== "string" ||
          node.nodeType !== ELEMENT_NODE ||
          (node as Element).tagName.toLowerCase() !== childDescriptor.type.toLowerCase()
        ) {
          return false;
        }
      }
    }

    // Apply pass: positions are stable (no inserts/removes at this level).
    for (let i = 0; i < newChildren.length; i++) {
      const child = newChildren[i] as Renderable;
      const node = existing[i] as ChildNode;
      if (isTextValue(child)) {
        const text = String(child);
        if ((node as Text).data !== text) {
          (node as Text).data = text;
        }
      } else {
        // Validated above: a static, string-typed, same-tag descriptor.
        const childDescriptor = staticElementDescriptor(child) as ElementDescriptor;
        yield* patchElementInPlace(node as HTMLElement, childDescriptor);
      }
    }

    return true;
  });
}

/**
 * Renders each child and appends it to `element`, mirroring {@link renderElement}'s
 * child loop. Used by {@link patchElementInPlace} to rebuild children when a
 * positional in-place patch is not possible.
 */
function appendRenderedChildren(
  element: HTMLElement,
  children: readonly Renderable[],
): Effect.Effect<
  void,
  UnsupportedNodeTypeError | StreamSubscriptionError | RenderError,
  RenderContext
> {
  return Effect.gen(function* () {
    for (const child of children) {
      if (isStream(child) || Effect.isEffect(child)) {
        const stream = toStream<Renderable>(child);
        const markers = yield* handleStreamChild(stream);
        for (const marker of markers) {
          element.appendChild(marker);
        }
      } else {
        const result = yield* renderNode(child);
        if (result !== null) {
          if (Array.isArray(result)) {
            for (const node of result) {
              element.appendChild(node);
            }
          } else {
            element.appendChild(result as Node);
          }
        }
      }
    }
  });
}

/**
 * Removes all nodes between start and end markers. Exported for reuse by the
 * hydrator.
 */
export function removeNodesBetweenMarkers(startMarker: Comment, endMarker: Comment): void {
  let current = startMarker.nextSibling;
  while (current !== null && current !== endMarker) {
    const next = current.nextSibling;
    current.remove();
    current = next;
  }
}

// ============================================================================
// Keyed list region (List.each)
// ============================================================================

/** Descriptor props carried by a `List.each` node (see `combinator/list.ts`). */
interface ListProps {
  readonly of: Source.Source<Iterable<unknown>>;
  readonly by?: (item: unknown, index: number) => unknown;
  readonly render: (item: unknown, index: number) => Renderable;
}

/**
 * A single keyed item rendered inside a `List.each` region. Its `scope` is forked
 * from the region scope and **persists across emissions**, closing only when the
 * item is removed or the region is torn down. That is what keeps per-item
 * subscription fibers (and therefore stream-driven content) alive while the item
 * survives reconciliation. See `client/list.specs.md`.
 */
interface ItemRecord {
  /** The reconciliation key (compared via Effect `Equal`, hashed via `Hash`). */
  readonly key: unknown;
  /** Per-item scope, forked from the region scope; persists across emissions. */
  readonly scope: Scope.Closeable;
  /** This item's opening comment marker (` list-item-start-<id> `). */
  readonly startMarker: Comment;
  /** This item's closing comment marker (` list-item-end-<id> `). */
  readonly endMarker: Comment;
  /**
   * The DOM nodes rendered for this item, between (exclusive) its markers, as of
   * first render. Consumed only when the item is first **inserted**; once the item
   * is reused across emissions, moves walk its live range ({@link collectItemRange})
   * rather than this snapshot, so the field may go stale and is not read again.
   */
  readonly nodes: readonly Node[];
}

/** Persistent reconciler state held across a region's emissions. */
interface ListState {
  /** Identity map: key → record. */
  readonly records: HashMap.HashMap<unknown, ItemRecord>;
  /** The keys in their last-rendered DOM order (drives LIS move computation). */
  readonly order: readonly unknown[];
}

/**
 * Renders a `List.each` keyed-list region.
 *
 * Unlike a generic reactive child ({@link handleStreamChild}), this path does
 * **not** rotate a single content scope per emission. It brackets the region with
 * the usual `stream-start`/`stream-end` markers, forks a persistent region scope,
 * consumes `Source.changes(of)` directly (no Subscribable hop, LM24), and
 * reconciles each committed snapshot against a persistent
 * `HashMap<K, ItemRecord>` so surviving keys keep both their DOM nodes and
 * their running subscription fibers (only added/removed/moved items touch the
 * DOM). Snapshots arriving faster than reconciles drain conflate to the newest
 * (latest-value-wins). Source/reconcile failures are routed to the nearest
 * `BoundaryContext`, mirroring {@link handleStreamChild}.
 */
function renderList(
  props: ListProps,
): Effect.Effect<
  readonly Node[],
  StreamSubscriptionError | RenderError | UnsupportedNodeTypeError,
  RenderContext
> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const { of, by, render } = props;

    // Region brackets, located on each emission like any reactive child.
    const streamId = yield* nextStreamId();
    const [startMarker, endMarker] = createStreamMarkers(streamId);

    // Region scope: parent of every per-item scope and of the `of` pump fiber.
    // Forked from the enclosing scope so region teardown (SC3) cascades to all
    // item scopes when the enclosing render scope closes.
    const regionScope = yield* Scope.fork(context.scope, "sequential");
    const boundary = yield* Effect.serviceOption(BoundaryContext);
    // Ambient snapshot for the commit closure (see handleStreamChild): item
    // renders during reconciliation must still see Boundary/Suspense services.
    const ambient = yield* Effect.context<never>();

    // The `of` change stream, hop-free (no SubscriptionRef/latch/pump). E/R
    // are satisfied by the captured runtime context; source failures surface
    // via the pump fiber's exit and are routed to a boundary.
    const changes = Source.changes(of) as Stream.Stream<Iterable<unknown>>;

    // Persistent reconciler state across emissions. Single-writer by
    // construction: only the flush fiber runs the commit below.
    let state: ListState = { records: HashMap.empty(), order: [] };

    const cell = yield* context.loom.register<Iterable<unknown>>({
      label: `list:stream-${streamId}`,
      scope: regionScope,
      boundary,
      reportUnhandled: context.reportUnhandled,
      commit: (iterable) =>
        Effect.gen(function* () {
          // KR6: materialize the iterable so iteration order is fixed for this emission.
          const items = Array.from(iterable);
          state = yield* reconcileList(items, by, render, state, regionScope, endMarker, context);
        }).pipe(
          // Commits run on the flush fiber: re-provide the region's context.
          Effect.provideService(RenderContext, context),
          Effect.provideService(Scope.Scope, regionScope),
          Effect.provide(ambient),
        ),
    });

    // Pump fiber lives in the region scope; source failures route to a
    // boundary, or are reported to the app hub when none encloses (AC8).
    const fiber = yield* forkSupervised(
      Stream.runForEach(changes, cell.write),
      regionScope,
      `list:stream-${streamId}`,
      context.reportUnhandled,
    );
    cell.attachPumpFiber(fiber);

    return [startMarker, endMarker] as const;
  });
}

/**
 * Projects each item to its reconciliation key (via `by`, or the item itself
 * under Effect `Equal`/`Hash`) and guards against duplicate keys within one
 * emission (KR1), failing with a descriptive {@link RenderError} *before* any
 * DOM is touched. Shared by {@link reconcileList} and {@link hydrateList}'s
 * first-emission adoption.
 */
function projectKeys(
  items: readonly unknown[],
  by: ((item: unknown, index: number) => unknown) | undefined,
): Effect.Effect<readonly unknown[], RenderError> {
  return Effect.gen(function* () {
    const keys: unknown[] = [];
    let seen = HashSet.empty<unknown>();
    for (let i = 0; i < items.length; i++) {
      const key = by === undefined ? items[i] : by(items[i], i);
      if (HashSet.has(seen, key)) {
        return yield* Effect.fail(
          new RenderError({
            cause: key,
            message: `List.each: duplicate key ${describeKey(key)} in a single emission; keys must be unique (set a stable \`by\`).`,
          }),
        );
      }
      seen = HashSet.add(seen, key);
      keys.push(key);
    }
    return keys;
  });
}

/**
 * Reconciles one emission of a `List.each` region against the previous
 * {@link ListState}, returning the next state. Vue 3 / Solid `<For>`-style:
 * duplicate-key guard (KR1), insert new keys (KR2), reuse persisted keys without
 * re-invoking `render` (KR3), remove dropped keys and close their scopes (KR4),
 * and reorder retained items with a longest-increasing-subsequence so only items
 * outside the LIS are moved (KR5).
 */
function reconcileList(
  items: readonly unknown[],
  by: ((item: unknown, index: number) => unknown) | undefined,
  render: (item: unknown, index: number) => Renderable,
  prev: ListState,
  regionScope: Scope.Scope,
  regionEnd: Comment,
  context: RenderContext["Service"],
): Effect.Effect<
  ListState,
  StreamSubscriptionError | RenderError | UnsupportedNodeTypeError,
  RenderContext
> {
  return Effect.gen(function* () {
    // 1. Project keys and guard duplicates *before* rendering anything (KR1).
    const keys = yield* projectKeys(items, by);

    // Previous key → DOM-order index, for LIS move computation (Effect-keyed so
    // structural keys compare via Equal).
    let prevIndex = HashMap.empty<unknown, number>();
    prev.order.forEach((key, i) => {
      prevIndex = HashMap.set(prevIndex, key, i);
    });

    // 2. Build the target records (reuse persisted keys, render new keys). The
    //    `sources[j]` is the item's previous DOM index, or -1 when newly created.
    const records: ItemRecord[] = [];
    const sources: number[] = [];
    for (let j = 0; j < items.length; j++) {
      const key = keys[j];
      const existing = HashMap.get(prev.records, key);
      if (Option.isSome(existing)) {
        records.push(existing.value); // KR3: reuse (no re-render, scope untouched).
        sources.push(Option.getOrElse(HashMap.get(prevIndex, key), () => -1));
      } else {
        const record = yield* renderItem(key, items[j], j, render, regionScope, context);
        records.push(record);
        sources.push(-1);
      }
    }

    // 3. Remove dropped keys: close their scopes (interrupting subscriptions) and
    //    delete their DOM range, markers included (KR4).
    let nextKeySet = HashSet.empty<unknown>();
    for (const key of keys) {
      nextKeySet = HashSet.add(nextKeySet, key);
    }
    for (const key of prev.order) {
      if (!HashSet.has(nextKeySet, key)) {
        const dropped = HashMap.get(prev.records, key);
        if (Option.isSome(dropped)) {
          yield* Scope.close(dropped.value.scope, Exit.void);
          removeItemRange(dropped.value.startMarker, dropped.value.endMarker);
        }
      }
    }

    // 4. Position items with minimal moves (KR5/KR2). Items whose previous indices
    //    form the LIS are already in relative order and are not touched; every
    //    other item (new, or retained-but-out-of-order) is (re)inserted before the
    //    next item's start marker, right-to-left so anchors are already in place.
    const keep = longestIncreasingSubsequence(sources);
    const parent = regionEnd.parentNode;
    if (parent !== null) {
      for (let j = records.length - 1; j >= 0; j--) {
        const record = records[j] as ItemRecord;
        if (sources[j] !== -1 && keep.has(j)) {
          continue; // in the LIS: already correctly positioned.
        }
        const anchor =
          j + 1 < records.length ? (records[j + 1] as ItemRecord).startMarker : regionEnd;
        const range =
          sources[j] === -1
            ? [record.startMarker, ...record.nodes, record.endMarker]
            : collectItemRange(record.startMarker, record.endMarker);
        for (const node of range) {
          parent.insertBefore(node, anchor);
        }
      }
    }

    // 5. New identity map + DOM order.
    let nextRecords = HashMap.empty<unknown, ItemRecord>();
    for (const record of records) {
      nextRecords = HashMap.set(nextRecords, record.key, record);
    }
    return { records: nextRecords, order: keys };
  });
}

/**
 * Renders a single new list item under a fresh per-item scope forked from the
 * region scope (MR2/KR2). The scope persists across emissions until the item is
 * removed; brackets the rendered nodes with per-item markers so the item moves
 * and is removed as a unit.
 */
function renderItem(
  key: unknown,
  item: unknown,
  index: number,
  render: (item: unknown, index: number) => Renderable,
  regionScope: Scope.Scope,
  context: RenderContext["Service"],
): Effect.Effect<
  ItemRecord,
  StreamSubscriptionError | RenderError | UnsupportedNodeTypeError,
  RenderContext
> {
  return Effect.gen(function* () {
    const itemScope = yield* Scope.fork(regionScope, "sequential");
    const itemContext = { ...context, scope: itemScope };

    const itemId = yield* nextStreamId();
    const startMarker = document.createComment(listItemStartText(itemId));
    const endMarker = document.createComment(listItemEndText(itemId));

    const result = yield* renderNode(render(item, index)).pipe(
      Effect.provideService(RenderContext, itemContext),
      Effect.provideService(Scope.Scope, itemScope),
    );

    const nodes: Node[] =
      result === null ? [] : Array.isArray(result) ? (result as Node[]) : [result as Node];

    return { key, scope: itemScope, startMarker, endMarker, nodes };
  });
}

/**
 * Collects an item's live DOM range (its start marker through its end marker,
 * inclusive) into an array so the whole unit can be moved with `insertBefore`
 * without the live `nextSibling` chain shifting mid-move.
 */
function collectItemRange(startMarker: Comment, endMarker: Comment): Node[] {
  const nodes: Node[] = [];
  let current: ChildNode | null = startMarker;
  while (current !== null) {
    nodes.push(current);
    if (current === endMarker) {
      break;
    }
    current = current.nextSibling;
  }
  return nodes;
}

/**
 * Removes an item's DOM range (its start marker through its end marker,
 * inclusive), handling any nested reactive content that accrued between them.
 */
function removeItemRange(startMarker: Comment, endMarker: Comment): void {
  let current: ChildNode | null = startMarker;
  while (current !== null) {
    const next: ChildNode | null = current.nextSibling;
    current.remove();
    if (current === endMarker) {
      break;
    }
    current = next;
  }
}

/** Describes a reconciliation key for a duplicate-key {@link RenderError} message. */
function describeKey(key: unknown): string {
  if (typeof key === "string") return JSON.stringify(key);
  if (typeof key === "object" && key !== null) {
    try {
      return JSON.stringify(key);
    } catch {
      return Object.prototype.toString.call(key);
    }
  }
  return String(key);
}

/**
 * Computes a longest strictly-increasing subsequence over `seq` and returns the
 * **set of indices into `seq`** that participate in it (patience-sorting,
 * O(n log n)). Entries equal to `-1` mark newly created items and are excluded:
 * they always need insertion. The returned indices are the retained items that
 * are already in relative DOM order and must not be moved (KR5).
 */
function longestIncreasingSubsequence(seq: readonly number[]): Set<number> {
  const n = seq.length;
  // piles[k] = index into seq of the smallest tail of an increasing run of length k+1.
  const piles: number[] = [];
  const parent: number[] = Array.from({ length: n }, () => -1);

  for (let i = 0; i < n; i++) {
    const x = seq[i] as number;
    if (x === -1) {
      continue; // new item: never part of the retained LIS.
    }
    let lo = 0;
    let hi = piles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[piles[mid] as number] as number) < x) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      parent[i] = piles[lo - 1] as number;
    }
    piles[lo] = i;
  }

  const set = new Set<number>();
  let idx = piles.length > 0 ? (piles[piles.length - 1] as number) : -1;
  while (idx !== -1) {
    set.add(idx);
    idx = parent[idx] as number;
  }
  return set;
}

// ============================================================================
// Hydrate: adopt walk
// ============================================================================

type HydrateError =
  | UnsupportedNodeTypeError
  | StreamSubscriptionError
  | RenderError
  | HydrationMismatchError;

/**
 * Hydrates a single Renderable against the DOM, consuming the node(s) starting at
 * `cursor` and returning the next unconsumed sibling.
 */
export function hydrateNode(
  node: Renderable,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    // Primitives that render text
    if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
      return yield* hydrateText(String(node), cursor, path);
    }

    // boolean/null/undefined render nothing, so consume no DOM
    if (typeof node === "boolean" || node === null || node === undefined) {
      return cursor;
    }

    // Reactive region (checked before iterables, since a Stream may be iterable)
    if (isStream(node) || Effect.isEffect(node)) {
      // Static markup carries its descriptor: hydrate it directly, no execution.
      const descriptor = getElementDescriptor(node);
      if (descriptor !== undefined) {
        return yield* hydrateNode(descriptor, cursor, path);
      }
      // Untagged Effect: probe for synchronous resolution; a genuinely async
      // Effect resolves to a failure exit (AsyncFiberException) and falls through
      // to reactive-region handling below.
      if (Effect.isEffect(node)) {
        // @effect-diagnostics-next-line runEffectInsideEffect:off -- intentional sync probe
        const exit = Effect.runSyncExit(node as Effect.Effect<Renderable, never, never>);
        if (Exit.isSuccess(exit)) {
          return yield* hydrateNode(exit.value, cursor, path);
        }
      }
      return yield* hydrateReactive(toStream<Renderable>(node), cursor, path);
    }

    // Iterables: hydrate children in order, threading the cursor
    if (typeof node === "object" && Symbol.iterator in node && !("type" in node)) {
      let next = cursor;
      let index = 0;
      for (const child of node as Iterable<Renderable>) {
        next = yield* hydrateNode(child, next, `${path}[${index}]`);
        index++;
      }
      return next;
    }

    // JSX elements: { type, props }
    if (typeof node === "object" && "type" in node && !(Symbol.iterator in node)) {
      const element = node as { type: unknown; props: object };
      const { type, props } = element;

      if (type === FRAGMENT) {
        return yield* hydrateChildren(props, cursor, path);
      }

      if (type === SUSPENSE_BOUNDARY) {
        // A retained suspense-start marker at the cursor is the server's
        // failure-replay patch (AC-FH7): the region resolved to a handled
        // failure and was substituted. Replay it instead of walking (AC-H14).
        if (cursor !== null && cursor.nodeType === COMMENT_NODE) {
          const marker = parseSuspenseMarker(cursor as Comment);
          if (marker !== null && marker.kind === "start") {
            return yield* hydrateSubstitutedSuspense(cursor as Comment, path);
          }
        }
        // Standard case: the SSR patch script has already resolved the
        // boundary. The fallback and markers are gone and the children are
        // inline in the DOM. Hydrate the children directly from the current
        // cursor; the Suspense wrapper is transparent to the DOM walk.
        return yield* hydrateChildren(props, cursor, path);
      }

      if (type === FAILURE_BOUNDARY) {
        return yield* hydrateFailureBoundary(
          props as Boundary.FailureProps & { children: Renderable[] },
          cursor,
          path,
        );
      }

      if (type === SERVER_BOUNDARY) {
        return yield* hydrateServerBoundary(props as ServerBoundaryProps, cursor, path);
      }

      if (type === LIST) {
        return yield* hydrateList(props as ListProps, cursor, path);
      }

      if (typeof type === "string") {
        return yield* hydrateElement(type, props, cursor, path);
      }

      if (typeof type === "function") {
        // Components are ephemeral: call once, hydrate the result in place.
        const result = (type as (props: object) => Renderable)(props);
        return yield* hydrateNode(result, cursor, path);
      }

      return yield* Effect.fail(
        new UnsupportedNodeTypeError({
          type,
          message: `Invalid Renderable type during hydration at ${path}: expected string, FRAGMENT, or function, got ${typeof type}`,
        }),
      );
    }

    return cursor;
  });
}

/**
 * Hydrates a text value. Adjacent text children coalesce into a single DOM text
 * node, so when the node is longer than the expected string it is split with
 * `Text.splitText` and the tail left for the next sibling.
 */
function hydrateText(
  expected: string,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    // Empty string contributes no DOM node (the server emits nothing).
    if (expected.length === 0) {
      return cursor;
    }

    if (cursor === null || cursor.nodeType !== TEXT_NODE) {
      return yield* mismatch(`text ${JSON.stringify(expected)}`, describeNode(cursor), path);
    }

    const textNode = cursor as Text;
    if (!textNode.data.startsWith(expected)) {
      return yield* mismatch(`text ${JSON.stringify(expected)}`, describeNode(cursor), path);
    }

    // Coalesced text node holds more than this child: split off the remainder.
    if (textNode.data.length > expected.length) {
      return textNode.splitText(expected.length);
    }

    return textNode.nextSibling;
  });
}

/**
 * Builds the hydration interactivity-barrier latch: a countdown `Ref` seeded with
 * a sentinel of `1` (so a fast region can't settle before the adopt walk has
 * registered all siblings) plus a `Deferred` that completes when the count
 * returns to zero. Generalizes the Suspense readiness latch
 * (`renderSuspenseBoundary`).
 */
export function makeHydrationReady(): Effect.Effect<HydrationReady> {
  return Effect.gen(function* () {
    const pendingRef = yield* Ref.make(1);
    const allSettled = yield* Deferred.make<void>();
    const settle: Effect.Effect<void> = pipe(
      Ref.updateAndGet(pendingRef, (n) => n - 1),
      Effect.flatMap((n) =>
        n <= 0 ? Effect.asVoid(Deferred.succeed(allSettled, undefined)) : Effect.void,
      ),
    );
    return {
      register: Ref.update(pendingRef, (n) => n + 1),
      settle,
      awaitReady: Deferred.await(allSettled),
    };
  });
}

/**
 * Builds an idempotent `settle` for the interactivity-barrier latch. The
 * underlying {@link HydrationReady.settle} decrements a shared counter, so it must
 * fire exactly once per registered region; this guards against the two settle
 * sites (first-emission completion and stream-exit `ensuring`) both decrementing.
 * A no-op when no latch is present.
 */
function makeSettleOnce(ready: HydrationReady | undefined): Effect.Effect<void> {
  let settled = false;
  return Effect.suspend(() => {
    if (settled || ready === undefined) return Effect.void;
    settled = true;
    return ready.settle;
  });
}

/**
 * Hydrates a reactive region: pairs the start/end markers around the
 * server-rendered content, then subscribes to the stream. The **first** emission
 * is hydrated against the adopted content in place (see {@link hydrateFirstEmission});
 * subsequent emissions patch the region via {@link updateStreamChild}.
 */
function hydrateReactive(
  stream: Stream.Stream<Renderable>,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;

    if (cursor === null || cursor.nodeType !== COMMENT_NODE) {
      return yield* mismatch("reactive region start marker", describeNode(cursor), path);
    }
    const startMarker = cursor as Comment;
    const parsed = parseStreamMarker(startMarker);
    if (parsed === null || parsed.kind !== "start") {
      return yield* mismatch("reactive region start marker", describeNode(cursor), path);
    }

    const endMarker = findMatchingEnd(startMarker);
    if (endMarker === null) {
      return yield* mismatch(
        "reactive region end marker",
        `unterminated region starting at ${JSON.stringify(startMarker.data)}`,
        path,
      );
    }

    // The first emission was server-rendered: hydrate it against the adopted
    // content (flash-free). Later emissions are client-rendered: patch via the
    // shared update flow. Content scope is rotated per committed emission (same
    // rule as handleStreamChild) so nested fibers don't accumulate.
    // Interactivity latch, ack-or-exit (LM12-LM14): settle once the first
    // emission has *committed* to the DOM, when the cell dies before one, or
    // on a silent stream exit, so the region never hangs hydrate's barrier.
    const settleOnce = makeSettleOnce(context.hydrationReady);
    const boundary = yield* Effect.serviceOption(BoundaryContext);
    // Ambient snapshot for the commit closure (see handleStreamChild).
    const ambient = yield* Effect.context<never>();

    let isFirst = true;
    let currentContentScope: Scope.Closeable | null = null;
    const cell = yield* context.loom.register<Renderable>({
      label: `hydrate:stream-${parsed.id} (${path})`,
      scope: context.scope,
      boundary,
      reportUnhandled: context.reportUnhandled,
      onFirstCommit: settleOnce,
      onDiscard: settleOnce,
      commit: (value) =>
        Effect.gen(function* () {
          if (currentContentScope !== null) {
            yield* Scope.close(currentContentScope, Exit.void);
          }
          currentContentScope = yield* Scope.fork(context.scope, "sequential");
          const contentContext = { ...context, scope: currentContentScope };

          yield* Effect.gen(function* () {
            if (isFirst) {
              isFirst = false;
              yield* hydrateFirstEmission(value, startMarker, endMarker, path);
            } else {
              yield* updateStreamChild(startMarker, endMarker, value);
            }
          }).pipe(
            Effect.provideService(RenderContext, contentContext),
            Effect.provideService(Scope.Scope, currentContentScope),
          );
        }).pipe(Effect.provide(ambient)),
    });

    // Ack-or-exit: a stream that ends or fails without ever writing settles.
    const pump = pipe(
      Stream.runForEach(stream, cell.write),
      Effect.ensuring(Effect.suspend(() => (cell.everWritten() ? Effect.void : settleOnce))),
    );

    // Register before the fork so hydrate's sentinel release can't settle the
    // latch before this region is accounted for.
    if (context.hydrationReady !== undefined) {
      yield* context.hydrationReady.register;
    }
    // Route stream failures to the nearest BoundaryContext, or the app hub
    // when no boundary encloses (AC-H15, parity with handleStreamChild).
    // Covers post-hydrate live failures such as a page failing after
    // client-side navigation.
    const fiber = yield* forkSupervised(
      pump,
      context.scope,
      `hydrate:stream-${parsed.id} (${path})`,
      context.reportUnhandled,
    );
    cell.attachPumpFiber(fiber);

    return endMarker.nextSibling;
  });
}

/**
 * Hydrates a reactive region's first (server-rendered) emission against the DOM
 * already present between its markers, reusing the adopt-walk. If the adopted
 * content exactly matches the emission (cursor lands on the end marker), nothing
 * is mutated: node identity is preserved and there is no flash. If it diverges
 * (a `HydrationMismatchError`, or the walk doesn't consume the whole region), the
 * region is patched via {@link updateStreamChild} as a recoverable fallback and a
 * `console.error` is logged.
 */
function hydrateFirstEmission(
  value: Renderable,
  startMarker: Comment,
  endMarker: Comment,
  path: string,
): Effect.Effect<void, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    // `null` => the adopted content exactly matched the first emission;
    // a string => the reason it diverged (logged before patching).
    const divergence = yield* hydrateNode(value, startMarker.nextSibling, `${path}<resume>`).pipe(
      Effect.map((nextCursor) =>
        nextCursor === endMarker ? null : "adopted content did not align with the end marker",
      ),
      Effect.catchTag("HydrationMismatchError", (error) =>
        Effect.succeed(`expected ${error.expected}, found ${error.actual} at ${error.path}`),
      ),
    );

    if (divergence === null) {
      return; // flash-free: nothing mutated, node identity preserved.
    }

    // Diverged from the server output: patch to the correct first value.
    console.error(
      `[weft] hydrate: reactive region at ${path} diverged from server output (${divergence}); patching.`,
    );
    yield* updateStreamChild(startMarker, endMarker, value);
  });
}

/**
 * Hydrates a **substituted** Suspense region (AC-H14): the server's
 * failure-replay patch (`streaming-shell.specs.md` AC-FH7) retained the
 * `suspense-start`/`suspense-end` markers and prepended a
 * `data-weft-suspense-failure` sentinel script carrying the Schema-encoded
 * failure. The region's static DOM is **not** hydrated or mutated: the parsed
 * `error` payload is replayed as a `Cause.fail` to the nearest
 * {@link BoundaryContext} (whose recovery then swaps the whole boundary extent,
 * since the canonical fallback replaces this snapshot anyway), and the cursor
 * resumes after the end marker.
 *
 * Graceful degradations (never a hard hydrate failure): a missing/unparsable
 * sentinel, or no enclosing `BoundaryContext`, logs a `console.error` and
 * leaves the substituted static DOM standing. The replayed value is the raw
 * encoded object (matched structurally by `_tag`), not a class instance.
 */
function hydrateSubstitutedSuspense(
  startMarker: Comment,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const endMarker = findMatchingSuspenseEnd(startMarker);
    if (endMarker === null) {
      return yield* mismatch(
        "substituted suspense end marker",
        `unterminated region starting at ${JSON.stringify(startMarker.data)}`,
        path,
      );
    }

    // The sentinel is the first substituted child: scan the region's direct
    // siblings for it.
    let sentinel: HTMLScriptElement | null = null;
    for (
      let node: ChildNode | null = startMarker.nextSibling;
      node !== null && node !== endMarker;
      node = node.nextSibling
    ) {
      if (
        node.nodeType === ELEMENT_NODE &&
        (node as Element).tagName === "SCRIPT" &&
        (node as Element).getAttribute("type") === "application/json" &&
        (node as Element).hasAttribute(SUSPENSE_FAILURE_ATTR)
      ) {
        sentinel = node as HTMLScriptElement;
        break;
      }
    }

    let payload: unknown = null;
    if (sentinel !== null) {
      const raw = sentinel.textContent ?? "";
      payload = yield* Effect.try({
        try: () => JSON.parse(raw) as unknown,
        catch: (cause) => cause,
      }).pipe(Effect.catch(() => Effect.succeed(null)));
    }

    if (payload === null || typeof payload !== "object" || !("error" in payload)) {
      console.error(
        `[weft] hydrate: substituted suspense region at ${path} has no decodable failure sentinel; leaving its static content.`,
      );
      return endMarker.nextSibling;
    }

    const boundary = yield* Effect.serviceOption(BoundaryContext);
    if (Option.isNone(boundary)) {
      console.error(
        `[weft] hydrate: substituted suspense region at ${path} has no enclosing Boundary to replay its failure to; leaving its static content.`,
        payload.error,
      );
      return endMarker.nextSibling;
    }

    yield* boundary.value.reportError(Cause.fail(payload.error));
    return endMarker.nextSibling;
  });
}

/**
 * Walks forward from a suspense start marker to its depth-matched suspense end
 * marker (nested substituted regions tracked by depth). Returns `null` if no
 * matching end is found.
 */
function findMatchingSuspenseEnd(startMarker: Comment): Comment | null {
  let depth = 0;
  let current: ChildNode | null = startMarker.nextSibling;

  while (current !== null) {
    if (current.nodeType === COMMENT_NODE) {
      const marker = parseSuspenseMarker(current as Comment);
      if (marker !== null) {
        if (marker.kind === "start") {
          depth++;
        } else if (depth === 0) {
          return current as Comment;
        } else {
          depth--;
        }
      }
    }
    current = current.nextSibling;
  }

  return null;
}

/**
 * Hydrates a failure `Boundary` region. Two cases, distinguished by the cursor:
 *
 * - **Success (no failure marker):** the server rendered the boundary's children
 *   inline. The children are hydrated from the cursor, and the boundary's
 *   **live machinery** is installed (AC-H13, parity with `renderBoundary`): a
 *   `BoundaryContext` (error deferred) is provided to the walk, invisible
 *   `boundary-start`/`boundary-end` comment markers are inserted around the
 *   adopted extent, and a recovery fiber swaps the extent to `props.match`'s
 *   fallback when a live failure is reported (including an AC-H14 sentinel
 *   replay). Construction-time `HydrateError`s are **not** routed through
 *   `match`. Static mismatches keep hard-failing (AC-H8). An empty extent
 *   skips the recovery install (nothing to swap) with a `console.error`.
 * - **Typed-failure replay:** the cursor is the
 *   `<script type="application/json" data-weft-boundary-failure>` the server
 *   emitted (carrying `{ index, error }`). The client does **not** run `load`: it
 *   locates the `index`-th statically-reachable {@link Boundary.server} in
 *   `props.children`, `Schema.decodeUnknownEffect`s `error` via **that** boundary's `failure`
 *   schema, `Cause.fail`s the rebuilt typed error, and feeds it to `props.match`
 *   to obtain the **same** fallback the server rendered, hydrating it against the
 *   adopted DOM at `script.nextSibling` and removing the script.
 *
 * A parse/decode miss, a missing/locate-less boundary, or a `match` that declines
 * the rebuilt cause is a recoverable {@link HydrationMismatchError} (logged),
 * consistent with {@link hydrateServerBoundary}.
 */
function hydrateFailureBoundary(
  props: Boundary.FailureProps & { children: Renderable[] },
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    // Success path: anything other than a failure-marked payload script means the
    // boundary rendered its children inline. Walk them with the live
    // failure-boundary machinery installed (AC-H13).
    if (
      cursor === null ||
      cursor.nodeType !== ELEMENT_NODE ||
      (cursor as Element).tagName !== "SCRIPT" ||
      (cursor as Element).getAttribute("type") !== "application/json" ||
      !(cursor as Element).hasAttribute(BOUNDARY_FAILURE_ATTR)
    ) {
      const context = yield* RenderContext;
      const parentBoundary = yield* Effect.serviceOption(BoundaryContext);

      const subtreeScope = yield* Scope.fork(context.scope, "sequential");
      const subtreeContext = { ...context, scope: subtreeScope };

      const errorDeferred = yield* Deferred.make<void, Cause.Cause<unknown>>();
      const boundaryService: BoundaryContext["Service"] = {
        reportError: (cause) => Deferred.fail(errorDeferred, cause).pipe(Effect.asVoid),
      };

      // No construction-time catch (unlike renderBoundary): a HydrateError here
      // hard-fails per AC-H8. Only deferred live failures route to the boundary.
      const next = yield* hydrateChildren(props, cursor, path).pipe(
        Effect.provideService(BoundaryContext, boundaryService),
        Effect.provideService(RenderContext, subtreeContext),
        Effect.provideService(Scope.Scope, subtreeScope),
      );

      // Bracket the adopted extent [cursor, next) with boundary markers so the
      // recovery swap has a target, the only success-path DOM mutation
      // (AC-H11 note). An empty extent has nothing to swap: skip the install.
      const extentParent = cursor?.parentNode ?? null;
      if (cursor === null || cursor === next || extentParent === null) {
        console.error(
          `[weft] hydrate: boundary at ${path} adopted an empty extent; live failure recovery is not installed for it.`,
        );
        return next;
      }

      const id = nextBoundaryId();
      const startMarker = document.createComment(boundaryStartText(id));
      const endMarker = document.createComment(boundaryEndText(id));
      extentParent.insertBefore(startMarker, cursor);
      if (next === null) {
        extentParent.appendChild(endMarker);
      } else {
        extentParent.insertBefore(endMarker, next);
      }

      yield* Effect.forkIn(
        boundaryRecoveryEffect(
          props,
          errorDeferred,
          subtreeScope,
          parentBoundary,
          startMarker,
          endMarker,
        ),
        context.scope,
      );

      return next;
    }

    const script = cursor as HTMLScriptElement;
    const raw = script.textContent ?? "";

    // Rebuild the fallback from the encoded typed failure. A failure to parse,
    // locate the boundary, or decode is a recoverable mismatch (logged): the
    // wire contract changed across a deploy and the region cannot be replayed.
    const fallbackNode = yield* Effect.gen(function* () {
      const payload = yield* Effect.try({
        try: () => JSON.parse(raw) as { readonly index: number; readonly error: unknown },
        catch: (cause) => cause,
      });
      const owner = collectServerBoundaries(props.children)[payload.index];
      // Boundary not statically locatable: degrade to a recoverable mismatch.
      if (owner === undefined) {
        return null;
      }
      const decoded = yield* Schema.decodeUnknownEffect(owner.errorSchema)(payload.error);
      return props.match(Cause.fail(decoded));
    }).pipe(
      Effect.catch((cause) => {
        console.error(
          `[weft] hydrate: boundary failure payload at ${path} failed to decode; cannot replay.`,
          cause,
        );
        return Effect.succeed<ReturnType<typeof props.match>>(null);
      }),
    );

    // `match` declined the rebuilt cause (or decoding failed): the fallback DOM
    // cannot be reproduced from here. Surface a recoverable mismatch.
    if (fallbackNode === null) {
      return yield* mismatch("replayable boundary failure", "undecodable failure payload", path);
    }

    // Hydrate the fallback against the adopted DOM following the payload script,
    // then drop the script: it is consumed only by hydration.
    const next = yield* hydrateNode(fallbackNode as Renderable, script.nextSibling, path);
    script.remove();
    return next;
  });
}

/**
 * Client-side props read from a {@link Boundary.rpc} descriptor. There is no
 * co-located `load`: the client resolves the boundary's data through the ambient
 * {@link AppRpcClientTag} by calling `call(tag, payload())`. On hydrate it
 * **replays** the inline SSR payload (decoded via `successSchema`) rather than
 * re-calling; later refetches and a client-first mount call the rpc. The fields
 * the client keeps are `tag` (the rpc identity), `payload` (a thunk producing a
 * fresh payload per call), `successSchema` (to decode the inline SSR payload),
 * `render` (to build the subtree from the live {@link Boundary.Resource}) and
 * `fallback` (shown during a client-first mount).
 */
interface ServerBoundaryProps {
  readonly tag: string;
  readonly payload: () => unknown;
  readonly successSchema: Schema.Codec<unknown, unknown>;
  readonly render: (resource: Boundary.Resource<unknown>) => Renderable;
  readonly fallback?: Renderable;
}

/**
 * Builds the live, client-side {@link Boundary.Resource} a {@link Boundary.rpc}
 * region hands to `render`. `value` is seeded from `data` (the replayed SSR
 * payload on hydrate, or the freshly-resolved value on a client-first mount) so
 * its first emission matches the rendered DOM; `refetch` re-reads the data through
 * the injected {@link AppRpcClientTag} by calling `call(tag, payload())` (the
 * rpc client returns an already-decoded success), then `SubscriptionRef.set`s
 * `value` so the subtree patches in place. A refetch is **stale-on-error**: any
 * failure **or defect** (captured via `Effect.exit`) leaves the previous `value`
 * intact, sets `error` to `Some`, and never raises into an enclosing failure
 * `Boundary`; `pending` is always cleared (`Effect.ensuring`). A refetch
 * triggered while one is already in flight is **ignored** (the `pending` guard),
 * so concurrent triggers cannot clobber `value` out of completion order. When no
 * client is present (`Option.none`: server, or a router-less mount) `refetch` is
 * a no-op.
 */
function makeClientResource(
  tag: string,
  payload: () => unknown,
  data: unknown,
  client: Option.Option<AppRpcClient>,
): Effect.Effect<Boundary.Resource<unknown>> {
  return Effect.gen(function* () {
    const valueRef = yield* SubscriptionRef.make(data);
    const pendingRef = yield* SubscriptionRef.make(false);
    const errorRef = yield* SubscriptionRef.make<Option.Option<unknown>>(Option.none());

    const refetch: Effect.Effect<void> = Option.match(client, {
      // No client (server / router-less mount): refetch cannot reach the rpc, so
      // it is a no-op. The region stays at its seeded value.
      onNone: () => Effect.void,
      onSome: (rpcClient) =>
        Effect.gen(function* () {
          // Ignore-while-pending: a refetch triggered while one is already in
          // flight is a no-op, so concurrent triggers (e.g. a double click) cannot
          // race and clobber `value` out of completion order. The guard sits
          // outside the `ensuring` below so an ignored trigger does not clear the
          // in-flight refetch's `pending`.
          if (yield* SubscriptionRef.get(pendingRef)) return;
          yield* SubscriptionRef.set(pendingRef, true);
          // The rpc client returns an already-decoded success value, so no schema
          // decode is needed here (unlike the inline SSR payload, which is the
          // encoded form). A fresh `payload()` is produced per call. `Effect.exit`
          // captures defects too (not just the typed error channel), so a transport
          // defect is stale-on-error like any failure rather than escaping as an
          // uncaught defect; `ensuring` always clears `pending`.
          yield* Effect.gen(function* () {
            const exit = yield* Effect.exit(rpcClient.call(tag, payload()));
            if (Exit.isSuccess(exit)) {
              // Success: push the new value (subtree patches in place), clear error.
              yield* SubscriptionRef.set(valueRef, exit.value);
              yield* SubscriptionRef.set(errorRef, Option.none());
            } else {
              // Stale-on-error: keep the previous value, surface the error inline.
              yield* SubscriptionRef.set(errorRef, Option.some(Cause.squash(exit.cause)));
            }
          }).pipe(Effect.ensuring(SubscriptionRef.set(pendingRef, false)));
        }),
    });

    return {
      value: Subscribable.make({
        get: SubscriptionRef.get(valueRef),
        changes: SubscriptionRef.changes(valueRef),
      }),
      refetch,
      pending: Subscribable.make({
        get: SubscriptionRef.get(pendingRef),
        changes: SubscriptionRef.changes(pendingRef),
      }),
      error: Subscribable.make({
        get: SubscriptionRef.get(errorRef),
        changes: SubscriptionRef.changes(errorRef),
      }),
    };
  });
}

/**
 * Hydrates a {@link Boundary.rpc} region. The hydratable server renderer
 * emitted the encoded rpc result inline as a `<script type="application/json">`
 * payload at the region cursor, followed by the `render(resource)` HTML. Here we
 * **replay** that result. The rpc is never called on the client: the payload is
 * decoded through `successSchema`, seeded into a live {@link Boundary.Resource}
 * (see {@link makeClientResource}), and `render(resource)` is hydrated against the
 * adopted DOM at `script.nextSibling`. The payload script is then removed so it
 * does not linger in the live document. The region stays **live**: a later
 * `resource.refetch` re-calls the rpc and patches it in place.
 *
 * A missing payload, malformed JSON, or a value that fails `successSchema`
 * decoding is a {@link HydrationMismatchError} (recoverable, logged), since the
 * region cannot be located/replayed without the data. It is the same typed,
 * non-defect failure surfaced by every other adopt-walk divergence.
 */
function hydrateServerBoundary(
  props: ServerBoundaryProps,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    // The region opens with the inline payload script emitted by the hydratable
    // server renderer; anything else means the server output diverged.
    if (
      cursor === null ||
      cursor.nodeType !== ELEMENT_NODE ||
      (cursor as Element).tagName !== "SCRIPT" ||
      (cursor as Element).getAttribute("type") !== "application/json"
    ) {
      return yield* mismatch(
        'server boundary payload <script type="application/json">',
        describeNode(cursor),
        path,
      );
    }

    // Defensive: a failure payload is consumed at the enclosing failure boundary
    // before descent ever reaches a server boundary's success path. If one slips
    // through, treat it as a mismatch rather than mis-decoding it as success data.
    if ((cursor as Element).hasAttribute(BOUNDARY_FAILURE_ATTR)) {
      return yield* mismatch(
        'server boundary success payload <script type="application/json">',
        "boundary failure payload",
        path,
      );
    }

    const script = cursor as HTMLScriptElement;
    const raw = script.textContent ?? "";

    // Decode the payload through the boundary's schema, replaying the server
    // result. A parse/decode failure is treated as a recoverable hydration
    // mismatch (logged) rather than a defect: the data is corrupt or the wire
    // contract changed across a deploy, and the region cannot be replayed.
    const data = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => cause,
    }).pipe(
      Effect.flatMap((encoded) => Schema.decodeUnknownEffect(props.successSchema)(encoded)),
      Effect.catch((cause) => {
        console.error(
          `[weft] hydrate: server boundary payload at ${path} failed to decode; cannot replay.`,
          cause,
        );
        return mismatch("decodable server boundary payload", "undecodable payload", path);
      }),
    );

    // Seed a live Resource from the replayed data and (optionally) the injected
    // rpc client, then hydrate render(resource) against the adopted DOM following
    // the payload script. `value`'s first emission is the seeded data, so the
    // adopt-walk matches the server DOM (no fallback flash). The script is then
    // dropped: it is consumed only by hydration; the region stays live for
    // subsequent refetches.
    const client = yield* Effect.serviceOption(AppRpcClientTag);
    const resource = yield* makeClientResource(props.tag, props.payload, data, client);
    const next = yield* hydrateNode(props.render(resource), script.nextSibling, path);
    script.remove();
    return next;
  });
}

/**
 * Hydrates a string-typed element: matches the tag, re-applies props (attaching
 * event handlers and reactive subscriptions; static attributes are idempotent),
 * then hydrates the element's children.
 */
function hydrateElement(
  type: string,
  props: object,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    if (cursor === null || cursor.nodeType !== ELEMENT_NODE) {
      return yield* mismatch(`<${type}>`, describeNode(cursor), path);
    }

    const element = cursor as HTMLElement;
    if (element.tagName.toLowerCase() !== type.toLowerCase()) {
      return yield* mismatch(`<${type}>`, describeNode(cursor), path);
    }

    // Re-apply props in place: event handlers attach, reactive props subscribe,
    // static attributes are set idempotently.
    yield* setElementProps(element, props);

    yield* hydrateChildren(props, element.firstChild, `${path} > ${type}`);

    return element.nextSibling;
  });
}

/**
 * Hydrates the `children` prop of an element or fragment against the DOM nodes
 * starting at `cursor`.
 */
function hydrateChildren(
  props: object,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const children = "children" in props ? (props as { children?: unknown }).children : undefined;

    if (children === undefined) {
      return cursor;
    }

    const childArray = Array.isArray(children) ? children : [children];
    let next = cursor;
    let index = 0;
    for (const child of childArray) {
      next = yield* hydrateNode(child as Renderable, next, `${path}[${index}]`);
      index++;
    }
    return next;
  });
}

// ============================================================================
// Hydrate: keyed list region (List.each)
// ============================================================================

/**
 * An item's DOM range adopted from server HTML during list hydration: its
 * per-item markers and the nodes between them (exclusive). The reconciliation
 * key is not yet known. It is paired positionally with the first emission's
 * projected keys in {@link hydrateFirstListEmission}.
 */
interface AdoptedItem {
  readonly startMarker: Comment;
  readonly endMarker: Comment;
  readonly nodes: readonly Node[];
}

/**
 * Hydrates a `List.each` region (HY2). Pairs the region's `stream-start`/
 * `stream-end` markers, collects the server-rendered per-item ranges, then
 * subscribes to `of`. The **first** emission is adopted in place, paired
 * positionally with the server items and hydrated flash-free (node identity and
 * per-item subscriptions preserved), building the persistent
 * `HashMap<K, ItemRecord>`. Later emissions reconcile normally via
 * {@link reconcileList}. Divergence (item-count or per-item content mismatch)
 * patches the DOM and logs `console.error`, mirroring {@link hydrateReactive}.
 */
function hydrateList(
  props: ListProps,
  cursor: ChildNode | null,
  path: string,
): Effect.Effect<ChildNode | null, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    const { of, by, render } = props;

    // Region start marker: same brackets as any reactive region.
    if (cursor === null || cursor.nodeType !== COMMENT_NODE) {
      return yield* mismatch("list region start marker", describeNode(cursor), path);
    }
    const startMarker = cursor as Comment;
    const parsed = parseStreamMarker(startMarker);
    if (parsed === null || parsed.kind !== "start") {
      return yield* mismatch("list region start marker", describeNode(cursor), path);
    }
    const endMarker = findMatchingEnd(startMarker);
    if (endMarker === null) {
      return yield* mismatch(
        "list region end marker",
        `unterminated region starting at ${JSON.stringify(startMarker.data)}`,
        path,
      );
    }

    // Adopt the server-rendered item ranges (positional; keys learned below).
    const adopted = collectAdoptedItems(startMarker, endMarker);

    // Region scope: parent of every per-item scope and of the `of` pump fiber
    // (mirrors renderList). Closing the enclosing scope cascades teardown.
    const regionScope = yield* Scope.fork(context.scope, "sequential");
    const boundary = yield* Effect.serviceOption(BoundaryContext);
    // Ambient snapshot for the commit closure (see handleStreamChild).
    const ambient = yield* Effect.context<never>();
    // Hop-free change stream (mirrors renderList, LM24).
    const changes = Source.changes(of) as Stream.Stream<Iterable<unknown>>;

    let state: ListState = { records: HashMap.empty(), order: [] };
    let isFirst = true;

    // Interactivity latch, ack-or-exit (LM12-LM14): settle once the first
    // emission has committed, when the cell dies before one, or on a silent
    // stream exit, so the region never hangs hydrate's barrier.
    const settleOnce = makeSettleOnce(context.hydrationReady);

    const cell = yield* context.loom.register<Iterable<unknown>>({
      label: `hydrate:list-${parsed.id} (${path})`,
      scope: regionScope,
      boundary,
      reportUnhandled: context.reportUnhandled,
      onFirstCommit: settleOnce,
      onDiscard: settleOnce,
      commit: (iterable) =>
        Effect.gen(function* () {
          const items = Array.from(iterable);
          if (isFirst) {
            isFirst = false;
            state = yield* hydrateFirstListEmission(
              items,
              by,
              render,
              adopted,
              regionScope,
              startMarker,
              endMarker,
              context,
              path,
            );
          } else {
            // KR6 already materialized; later emissions reconcile like mount.
            state = yield* reconcileList(items, by, render, state, regionScope, endMarker, context);
          }
        }).pipe(
          // Commits run on the flush fiber: re-provide the region's context.
          Effect.provideService(RenderContext, context),
          Effect.provideService(Scope.Scope, regionScope),
          Effect.provide(ambient),
        ),
    });

    const pump = pipe(
      Stream.runForEach(changes, cell.write),
      Effect.ensuring(Effect.suspend(() => (cell.everWritten() ? Effect.void : settleOnce))),
    );

    // Register before the fork so hydrate's sentinel release can't settle the
    // latch before this region is accounted for.
    if (context.hydrationReady !== undefined) {
      yield* context.hydrationReady.register;
    }
    // Pump fiber lives in the region scope; failures route to a boundary, or
    // are reported to the app hub when none encloses (AC-H15).
    const fiber = yield* forkSupervised(
      pump,
      regionScope,
      `hydrate:list-${parsed.id} (${path})`,
      context.reportUnhandled,
    );
    cell.attachPumpFiber(fiber);

    return endMarker.nextSibling;
  });
}

/**
 * Walks a hydrated list region and collects its per-item DOM ranges in document
 * order. Item boundaries are the `list-item-start`/`list-item-end` markers;
 * nesting is tracked with a depth counter so a nested `List.each` inside an item
 * doesn't terminate the outer item early. Stream markers (nested reactive
 * children) are stepped over: they belong to the item's node range.
 */
function collectAdoptedItems(regionStart: Comment, regionEnd: Comment): AdoptedItem[] {
  const items: AdoptedItem[] = [];
  let current: ChildNode | null = regionStart.nextSibling;

  while (current !== null && current !== regionEnd) {
    const marker =
      current.nodeType === COMMENT_NODE ? parseListItemMarker(current as Comment) : null;
    if (marker === null || marker.kind !== "start") {
      current = current.nextSibling;
      continue;
    }

    const itemStart = current as Comment;
    const nodes: Node[] = [];
    let depth = 0;
    let itemEnd: Comment | null = null;
    let scan: ChildNode | null = itemStart.nextSibling;
    while (scan !== null && scan !== regionEnd) {
      if (scan.nodeType === COMMENT_NODE) {
        const inner = parseListItemMarker(scan as Comment);
        if (inner !== null) {
          if (inner.kind === "start") {
            depth++;
          } else if (depth === 0) {
            itemEnd = scan as Comment;
            break;
          } else {
            depth--;
          }
        }
      }
      nodes.push(scan);
      scan = scan.nextSibling;
    }

    if (itemEnd === null) {
      // Unterminated item: stop collecting; the count mismatch will trigger a
      // rebuild on the first emission.
      break;
    }
    items.push({ startMarker: itemStart, endMarker: itemEnd, nodes });
    current = itemEnd.nextSibling;
  }

  return items;
}

/**
 * Adopts the first (server-rendered) emission of a hydrated list region. Pairs
 * the projected keys with the collected server item ranges positionally and
 * hydrates each in place (flash-free), producing the initial {@link ListState}.
 *
 * If the server item count differs from the emission's, the region diverged:
 * the adopted DOM is discarded and the emission is rendered fresh via
 * {@link reconcileList} (logged, recoverable). Per-item content divergence is
 * handled within {@link hydrateItem}.
 */
function hydrateFirstListEmission(
  items: readonly unknown[],
  by: ((item: unknown, index: number) => unknown) | undefined,
  render: (item: unknown, index: number) => Renderable,
  adopted: readonly AdoptedItem[],
  regionScope: Scope.Scope,
  regionStart: Comment,
  regionEnd: Comment,
  context: RenderContext["Service"],
  path: string,
): Effect.Effect<ListState, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const keys = yield* projectKeys(items, by);

    // Region-level divergence: server item count != first emission count.
    if (keys.length !== adopted.length) {
      console.error(
        `[weft] hydrate: list region at ${path} had ${adopted.length} server item(s) but the first emission has ${keys.length}; rebuilding.`,
      );
      removeNodesBetweenMarkers(regionStart, regionEnd);
      return yield* reconcileList(
        items,
        by,
        render,
        { records: HashMap.empty(), order: [] },
        regionScope,
        regionEnd,
        context,
      );
    }

    // Counts match: adopt each item positionally, hydrating its content in place.
    const records: ItemRecord[] = [];
    for (let i = 0; i < items.length; i++) {
      const record = yield* hydrateItem(
        keys[i],
        items[i],
        i,
        render,
        adopted[i] as AdoptedItem,
        regionScope,
        context,
        path,
      );
      records.push(record);
    }

    let nextRecords = HashMap.empty<unknown, ItemRecord>();
    for (const record of records) {
      nextRecords = HashMap.set(nextRecords, record.key, record);
    }
    return { records: nextRecords, order: keys };
  });
}

/**
 * Hydrates a single server-rendered list item in place: forks a persistent
 * per-item scope, then hydrates `render(item)`'s output against the adopted DOM
 * range (attaching event handlers and reactive subscriptions, preserving node
 * identity, flash-free). `render` runs once per key, consistent with mount.
 *
 * If the item's content diverges from the server output, the item's scope is
 * closed and re-forked, its adopted nodes are removed, and it is rendered fresh
 * into the (preserved) marker range, logged and recoverable, mirroring
 * {@link hydrateFirstEmission}.
 */
function hydrateItem(
  key: unknown,
  item: unknown,
  index: number,
  render: (item: unknown, index: number) => Renderable,
  adopted: AdoptedItem,
  regionScope: Scope.Scope,
  context: RenderContext["Service"],
  path: string,
): Effect.Effect<ItemRecord, HydrateError, RenderContext> {
  return Effect.gen(function* () {
    const itemScope = yield* Scope.fork(regionScope, "sequential");
    const itemContext = { ...context, scope: itemScope };
    const node = render(item, index);

    const divergence = yield* hydrateNode(
      node,
      adopted.startMarker.nextSibling,
      `${path}<item>`,
    ).pipe(
      Effect.provideService(RenderContext, itemContext),
      Effect.provideService(Scope.Scope, itemScope),
      Effect.map((next) =>
        next === adopted.endMarker
          ? null
          : "adopted item content did not align with its end marker",
      ),
      Effect.catchTag("HydrationMismatchError", (error) =>
        Effect.succeed(`expected ${error.expected}, found ${error.actual} at ${error.path}`),
      ),
    );

    if (divergence === null) {
      // Flash-free: server nodes adopted, identity preserved.
      return {
        key,
        scope: itemScope,
        startMarker: adopted.startMarker,
        endMarker: adopted.endMarker,
        nodes: adopted.nodes,
      };
    }

    // Diverged: discard the failed hydration's partial scope and re-render fresh
    // into the preserved marker range.
    console.error(
      `[weft] hydrate: list item at ${path} diverged from server output (${divergence}); patching.`,
    );
    yield* Scope.close(itemScope, Exit.void);
    const freshScope = yield* Scope.fork(regionScope, "sequential");
    const freshContext = { ...context, scope: freshScope };

    removeNodesBetweenMarkers(adopted.startMarker, adopted.endMarker);
    const result = yield* renderNode(node).pipe(
      Effect.provideService(RenderContext, freshContext),
      Effect.provideService(Scope.Scope, freshScope),
    );
    const nodes: Node[] =
      result === null ? [] : Array.isArray(result) ? (result as Node[]) : [result as Node];
    const parent = adopted.endMarker.parentNode;
    if (parent !== null) {
      for (const n of nodes) {
        parent.insertBefore(n, adopted.endMarker);
      }
    }

    return {
      key,
      scope: freshScope,
      startMarker: adopted.startMarker,
      endMarker: adopted.endMarker,
      nodes,
    };
  });
}

// ============================================================================
// DOM helpers (hydration)
// ============================================================================

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const SHOW_COMMENT = 128;

/**
 * Advances `counter` past the highest marker id present in the server-rendered
 * DOM under `root`. Stream, suspense, and list-item markers all draw from this
 * one counter (see `shared.ts`), so any of them can set the high-water mark.
 * Without this, ids minted after hydration restart at 1 and collide with adopted
 * markers, harmless for location (markers are matched positionally / by depth)
 * but it leaves duplicate ids in the live DOM.
 */
export function seedStreamIdCounter(root: Node, counter: { current: number }): void {
  const walker = document.createTreeWalker(root, SHOW_COMMENT);
  let max = counter.current;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const comment = node as Comment;
    const marker =
      parseStreamMarker(comment) ?? parseSuspenseMarker(comment) ?? parseListItemMarker(comment);
    if (marker !== null && marker.id > max) {
      max = marker.id;
    }
  }
  counter.current = max;
}

/**
 * Walks forward from a start marker to its depth-matched end marker, accounting
 * for nested reactive regions. Returns `null` if no matching end is found.
 */
function findMatchingEnd(startMarker: Comment): Comment | null {
  let depth = 0;
  let current: ChildNode | null = startMarker.nextSibling;

  while (current !== null) {
    if (current.nodeType === COMMENT_NODE) {
      const marker = parseStreamMarker(current as Comment);
      if (marker !== null) {
        if (marker.kind === "start") {
          depth++;
        } else if (depth === 0) {
          return current as Comment;
        } else {
          depth--;
        }
      }
    }
    current = current.nextSibling;
  }

  return null;
}

/**
 * Renders a short description of a DOM node for mismatch diagnostics.
 */
function describeNode(node: ChildNode | null): string {
  if (node === null) {
    return "end of children";
  }
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return `<${(node as Element).tagName.toLowerCase()}>`;
    case TEXT_NODE:
      return `text ${JSON.stringify((node as Text).data)}`;
    case COMMENT_NODE:
      return `comment ${JSON.stringify((node as Comment).data)}`;
    default:
      return `node(type ${node.nodeType})`;
  }
}

function mismatch(
  expected: string,
  actual: string,
  path: string,
): Effect.Effect<never, HydrationMismatchError> {
  return Effect.fail(new HydrationMismatchError({ expected, actual, path }));
}
