/**
 * Type tests for the `Source` channel accessors: `Source.Success`,
 * `Source.Error`, and `Source.Context` over each `Source` kind (Stream / Effect /
 * Subscribable / static value).
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

type StaticSource = readonly Person[];
type StreamSource = Stream.Stream<readonly Person[], LoadError, DataService>;
type EffectSource = Effect.Effect<readonly Person[], LoadError, DataService>;
type SubSource = Subscribable.Subscribable<readonly Person[], LoadError, DataService>;

// =============================================================================
// Source.Success: emitted value type
// =============================================================================

test("Source.Success: emitted value type", () => {
  // A static value is its own success type.
  expect<Source.Success<StaticSource>>().type.toBe<readonly Person[]>();
  // Stream / Effect / Subscribable contribute their value channel.
  expect<Source.Success<StreamSource>>().type.toBe<readonly Person[]>();
  expect<Source.Success<EffectSource>>().type.toBe<readonly Person[]>();
  expect<Source.Success<SubSource>>().type.toBe<readonly Person[]>();
});

// =============================================================================
// Source.Error: error channel (static ⇒ never)
// =============================================================================

test("Source.Error: error channel (static ⇒ never)", () => {
  expect<Source.Error<StaticSource>>().type.toBe<never>();
  expect<Source.Error<StreamSource>>().type.toBe<LoadError>();
  expect<Source.Error<EffectSource>>().type.toBe<LoadError>();
  expect<Source.Error<SubSource>>().type.toBe<LoadError>();
});

// =============================================================================
// Source.Context: requirement channel (static ⇒ never)
// =============================================================================

test("Source.Context: requirement channel (static ⇒ never)", () => {
  expect<Source.Context<StaticSource>>().type.toBe<never>();
  expect<Source.Context<StreamSource>>().type.toBe<DataService>();
  expect<Source.Context<EffectSource>>().type.toBe<DataService>();
  expect<Source.Context<SubSource>>().type.toBe<DataService>();
});
