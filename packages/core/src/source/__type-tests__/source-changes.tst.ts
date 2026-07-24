/**
 * Type tests for `Source.changes`: channel inference `Source<A, E, R>` →
 * `Stream<A, E, R>` across all four source kinds (static value ⇒ E/R `never`).
 */

import { expect, test } from "tstyche";
import { Effect, Stream } from "effect";
import { Subscribable } from "@weftui/core";
import { Source } from "../source";

// =============================================================================
// Mock channels and value types
// =============================================================================

interface DataService {
  readonly _: unique symbol;
}
class LoadError {
  readonly _tag = "LoadError";
}

interface Person {
  readonly id: string;
}

declare const staticSource: readonly Person[];
declare const streamSource: Stream.Stream<readonly Person[], LoadError, DataService>;
declare const effectSource: Effect.Effect<readonly Person[], LoadError, DataService>;
declare const subSource: Subscribable.Subscribable<readonly Person[], LoadError, DataService>;

// =============================================================================
// Channel inference per source kind
// =============================================================================

test("Source.changes: a stream passes through with identical channels", () => {
  expect(Source.changes(streamSource)).type.toBe<
    Stream.Stream<readonly Person[], LoadError, DataService>
  >();
});

test("Source.changes: effect and subscribable keep their channels", () => {
  expect(Source.changes(effectSource)).type.toBe<
    Stream.Stream<readonly Person[], LoadError, DataService>
  >();
  expect(Source.changes(subSource)).type.toBe<
    Stream.Stream<readonly Person[], LoadError, DataService>
  >();
});

test("Source.changes: a static value emits once with empty channels", () => {
  expect(Source.changes(staticSource)).type.toBe<Stream.Stream<readonly Person[], never, never>>();
});
