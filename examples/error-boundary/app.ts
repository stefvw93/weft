/**
 * Error Boundary Example
 *
 * Demonstrates all six `Boundary.*` variants for intercepting rendering-path
 * errors in a subtree. Each section shows a distinct pattern: catching all
 * typed failures, catching by tag, conditional catches, and nested re-raise.
 */

import { Boundary, h } from "@weftui/core";
import { Data, Effect, Filter, Result, Stream, SubscriptionRef } from "effect";

// ============================================================================
// Error types
// ============================================================================

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly status: number;
  readonly url: string;
}> {}

class AuthError extends Data.TaggedError("AuthError")<{
  readonly reason: string;
}> {}

// ============================================================================
// Simulated async operations that may fail
// ============================================================================

/** Simulates a failing API call after a short delay. */
function failingFetch(url: string): Effect.Effect<never, NetworkError> {
  return Effect.gen(function* () {
    yield* Effect.sleep("800 millis");
    return yield* Effect.fail(new NetworkError({ status: 503, url }));
  });
}

/** Simulates an auth check that fails. */
function checkAuth(): Effect.Effect<never, AuthError> {
  return Effect.gen(function* () {
    yield* Effect.sleep("400 millis");
    return yield* Effect.fail(new AuthError({ reason: "session expired" }));
  });
}

/** Child that can fail with either NetworkError or AuthError. */
function mixedChild(failAuth: boolean): Effect.Effect<never, NetworkError | AuthError> {
  return failAuth ? checkAuth() : failingFetch("/api/mixed");
}

/** A stream that initially shows content, then fails after a delay. */
function liveStreamThatFails(): Stream.Stream<ReturnType<typeof h.span>, NetworkError> {
  return Stream.concat(
    Stream.make(h.span({ class: "live" }, "● Live data connected")),
    Stream.fromEffect(
      Effect.gen(function* () {
        yield* Effect.sleep("2000 millis");
        return yield* Effect.fail(new NetworkError({ status: 503, url: "/stream" }));
      }),
    ),
  );
}

// ============================================================================
// Section 1: catchAll, catching all typed failures
// ============================================================================

function CatchAllSection() {
  return h.section({ class: "section" }, [
    h.h2("1. catchAll"),
    h.p(
      "Catches any typed failure and renders a fallback. Defects (thrown exceptions) are not caught.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catch(
        {
          fallback: (e) =>
            h.div({ class: "error-box" }, [
              h.strong("Network error"),
              h.span(`: ${e.status} ${e.url}`),
            ]),
        },
        [failingFetch("/api/data")],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 2: catchTag, catching a specific error tag
// ============================================================================

function CatchTagSection() {
  return h.section({ class: "section" }, [
    h.h2("2. catchTag"),
    h.p(
      "Catches only AuthError. If the child raised a NetworkError, it would re-raise to a parent boundary.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catchTag(
        {
          tag: "AuthError",
          fallback: (e) =>
            h.div({ class: "error-box error-box--auth" }, [
              h.strong("Session expired"),
              h.span(`: ${e.reason}`),
              h.button(
                {
                  class: "btn",
                  onclick: () => Effect.log("redirect to login"),
                },
                "Log in again",
              ),
            ]),
        },
        [checkAuth()],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 3: catchTags, catching multiple tags
// ============================================================================

function CatchTagsSection() {
  return h.section({ class: "section" }, [
    h.h2("3. catchTags"),
    h.p("Routes each error tag to its own handler. Each child is wrapped in its own boundary."),
    h.div({ class: "demo" }, [
      h.div({ class: "demo-row" }, [
        // Handles NetworkError from failingFetch
        Boundary.catchTags(
          {
            NetworkError: (e) => h.div({ class: "error-box" }, `Network ${e.status}: ${e.url}`),
          },
          [failingFetch("/api/users")],
        ),
        // Handles AuthError from checkAuth
        Boundary.catchTags(
          {
            AuthError: (e) => h.div({ class: "error-box error-box--auth" }, `Auth: ${e.reason}`),
          },
          [checkAuth()],
        ),
        // Handles both error types from a mixed child
        Boundary.catchTags(
          {
            NetworkError: (e) => h.div({ class: "error-box" }, `Network ${e.status}`),
            AuthError: (e) => h.div({ class: "error-box error-box--auth" }, `Auth: ${e.reason}`),
          },
          [mixedChild(true)],
        ),
      ]),
    ]),
  ]);
}

// ============================================================================
// Section 4: catchSome, catching optionally based on the error value
// ============================================================================

function CatchSomeSection() {
  return h.section({ class: "section" }, [
    h.h2("4. catchSome"),
    h.p(
      "Catches 503 errors only. A non-503 NetworkError fails the Filter and re-raises to the outer boundary.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catch(
        {
          fallback: (e) =>
            h.div({ class: "error-box error-box--outer" }, `Outer caught: ${e.status} ${e.url}`),
        },
        [
          Boundary.catchFilter(
            Filter.make((e: NetworkError) =>
              e.status === 503 ? Result.succeed(e) : Result.fail(e),
            ),
            (e) => h.div({ class: "error-box" }, `Service unavailable: ${e.url}`),
            [failingFetch("/api/resource")],
          ),
        ],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 5: catchIf, catching when a predicate is true
// ============================================================================

function CatchIfSection() {
  return h.section({ class: "section" }, [
    h.h2("5. catchIf"),
    h.p("Catches only server errors (5xx). Client errors (4xx) would re-raise."),
    h.div({ class: "demo" }, [
      Boundary.catchIf(
        {
          predicate: (e) => e.status >= 500,
          fallback: (e) =>
            h.div({ class: "error-box" }, [h.strong("Server error"), h.span(`: ${e.status}`)]),
        },
        [failingFetch("/api/server-error")],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 6: Nested boundaries. Inner catches, outer is the fallback
// ============================================================================

function NestedSection() {
  return h.section({ class: "section" }, [
    h.h2("6. Nested boundaries"),
    h.p(
      "Inner boundary catches AuthError. NetworkError re-raises from the inner boundary to the outer.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catch(
        {
          fallback: (e) =>
            h.div({ class: "error-box error-box--outer" }, [
              h.strong("Outer caught:"),
              h.span(` NetworkError ${e.status}`),
            ]),
        },
        [
          h.div({ class: "inner-region" }, [
            // Auth error: caught by inner boundary
            Boundary.catchTag(
              {
                tag: "AuthError",
                fallback: (e) => h.span({ class: "error-box" }, `Auth (inner): ${e.reason}`),
              },
              [checkAuth()],
            ),
            // Network error: inner boundary only handles AuthError, so NetworkError re-raises
            Boundary.catchTag(
              {
                tag: "AuthError",
                fallback: (e) => h.span({ class: "error-box" }, `Auth: ${e.reason}`),
              },
              [mixedChild(false)],
            ),
          ]),
        ],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 7: Post-mount stream error (live recovery)
// ============================================================================

function StreamErrorSection() {
  return h.section({ class: "section" }, [
    h.h2("7. Post-mount stream failure"),
    h.p(
      "The stream shows live data for 2 seconds, then fails. The boundary swaps to the fallback.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catch(
        {
          fallback: (e) =>
            h.div({ class: "error-box" }, [
              h.strong("Stream disconnected"),
              h.span(`: ${e.status}`),
            ]),
        },
        [liveStreamThatFails()],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 8: catchAllCause, catching defects too
// ============================================================================

function ThrowingComponent() {
  return Effect.gen(function* () {
    yield* Effect.sleep("600 millis");
    // Throws synchronously inside Effect.gen, becoming a defect (Cause.die)
    throw new TypeError("Unexpected null reference");
  });
}

function CatchAllCauseSection() {
  return h.section({ class: "section" }, [
    h.h2("8. catchAllCause"),
    h.p(
      "Catches defects (thrown exceptions) as well as typed failures. The fallback receives the full Cause.",
    ),
    h.div({ class: "demo" }, [
      Boundary.catchCause(
        {
          fallback: (cause) =>
            h.div({ class: "error-box" }, [
              h.strong("Defect caught"),
              h.span(`: ${String(cause)}`),
            ]),
        },
        [ThrowingComponent()],
      ),
    ]),
  ]);
}

// ============================================================================
// Section 9: Toggle. Boundary resets on remount
// ============================================================================

function ToggleSection() {
  const show = Effect.runSync(SubscriptionRef.make(true));

  const toggle = h.button(
    {
      class: "btn",
      onclick: () => SubscriptionRef.update(show, (v: boolean) => !v),
    },
    "Toggle demo",
  );

  const demo = SubscriptionRef.changes(show).pipe(
    Stream.flatMap((visible: boolean) => {
      if (!visible) return Stream.fromEffect(h.span({ class: "muted" }, "(unmounted)"));
      return Stream.fromEffect(
        Boundary.catch({ fallback: () => h.span({ class: "error-box" }, "Caught after remount") }, [
          failingFetch("/api/toggle"),
        ]),
      );
    }),
  );

  return h.section({ class: "section" }, [
    h.h2("9. Remount: boundary resets"),
    h.p("Toggle the demo off and on. Each remount creates a fresh boundary."),
    h.div({ class: "demo" }, [toggle, h.div({ style: { marginTop: "0.5rem" } }, [demo])]),
  ]);
}

// ============================================================================
// App
// ============================================================================

export function App() {
  return h.div({ class: "app" }, [
    h.header([
      h.h1("Weft: Error Boundaries"),
      h.p(
        { class: "subtitle" },
        "Six variants for intercepting rendering-path errors and recovering with fallback UI.",
      ),
    ]),
    h.main([
      CatchAllSection(),
      CatchTagSection(),
      CatchTagsSection(),
      CatchSomeSection(),
      CatchIfSection(),
      NestedSection(),
      StreamErrorSection(),
      CatchAllCauseSection(),
      ToggleSection(),
    ]),
  ]);
}
