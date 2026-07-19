import type { AppRpcClientTag, Renderable } from "@weftui/core";
import { Effect, Exit, Scope, Stream } from "effect";
import { makeHydratableSSR } from "./render-to-stream";
// oxlint-disable-next-line no-unused-vars -- JSDoc reference
import type { SuspenseFailureHandlerTag } from "./suspense-failure-handler";

/**
 * The result of {@link renderToHydratableShell}: the fully buffered main
 * document walk plus the trailing Suspense patch stream.
 */
export interface HydratableShell {
  /**
   * The fully buffered main walk, byte-identical to the `mainStream` portion
   * of `renderToStreamHydratable` for the same tree: reactive-region markers,
   * Suspense fallbacks inline with their markers, resolved (blocking)
   * `Boundary.rpc` regions, and failure-boundary fallbacks with payloads.
   */
  readonly shell: string;
  /**
   * The Suspense patch queue as a stream. Never fails (resolution fibers
   * handle their own errors, see {@link SuspenseFailureHandlerTag}); completes
   * once all pending boundaries have resolved, or immediately if the tree has
   * no `Boundary.suspend`.
   */
  readonly patches: Stream.Stream<string>;
}

/**
 * Shell-split variant of `renderToStreamHydratable` (spec:
 * `streaming-shell.specs.md`). Buffers the main document walk into `shell` so
 * an HTTP consumer can decide status/headers before flushing any bytes, then
 * streams Suspense patches separately.
 *
 * Errors raised during the main walk fail this Effect. Nothing has been
 * handed to the consumer yet, so the caller may respond with a different
 * document and a real status (AC-SH2).
 *
 * Suspense resolution fibers are forked into the ambient `Scope.Scope`: keep
 * it open until `patches` completes; closing it interrupts pending fibers
 * (consumer disconnect, AC-SH6).
 */
export const renderToHydratableShell = (
  node: Renderable,
): Effect.Effect<HydratableShell, Error, AppRpcClientTag | Scope.Scope> =>
  Effect.gen(function* () {
    const outer = yield* Effect.scope;
    // Resolution fibers live in a child scope: it closes with the parent
    // (consumer disconnect, AC-SH6) and is closed eagerly on a walk failure so
    // no resolution fiber outlives a failed shell (AC-SH2).
    const inner = yield* Scope.fork(outer, "sequential");
    const { mainStream, patches } = yield* makeHydratableSSR(node, inner);
    const shell = yield* Stream.mkString(mainStream).pipe(
      Effect.onError((cause) => Scope.close(inner, Exit.failCause(cause))),
    );
    return { shell, patches };
  });
