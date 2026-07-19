import { Effect } from "effect";
import { RenderContext } from "./data";

/**
 * Generates the next unique stream-region ID.
 */
export function nextStreamId(): Effect.Effect<number, never, RenderContext> {
  return Effect.gen(function* () {
    const context = yield* RenderContext;
    return ++context.streamIdCounter.current;
  });
}

/**
 * Generates the next unique Suspense-boundary ID.
 *
 * IDs are drawn from the same monotonic counter as stream-region IDs.
 * They only need to be unique within a single render tree.
 */
export const nextSuspenseId = nextStreamId;

let boundaryIdCounter = 0;

/**
 * Generates the next unique Boundary ID.
 * Uses a module-level counter separate from the stream/suspense counter.
 */
export const nextBoundaryId = (): number => ++boundaryIdCounter;
