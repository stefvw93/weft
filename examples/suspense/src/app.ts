/**
 * Isomorphic App demonstrating Suspense boundaries.
 *
 * Rendered to streaming hydratable HTML on the server, then hydrated on the
 * client. The Dashboard shows three sibling async cards under one shared
 * fallback. All three must settle before the fallback is replaced. The
 * NestedExample shows an inner boundary resolving independently of the outer.
 *
 * On the server (`renderToStreamHydratable`):
 *   - Fallback + comment markers emitted inline immediately
 *   - `<template>` + `<script>` patch appended as each boundary resolves
 *   - Patch script swaps fallback → resolved content before hydrate() runs
 *
 * On the client (`mount`):
 *   - Fallback shown while all sibling children are pending
 *   - Single atomic DOM swap once every child has emitted its first value
 */

import { Boundary, h } from "@weftui/core";
import { Effect, pipe } from "effect";

// ============================================================================
// Simulated data layer
// ============================================================================

interface CardData {
  readonly title: string;
  readonly body: string;
}

/** Simulates a network fetch with a configurable delay. */
function fetchCard(id: number): Effect.Effect<CardData> {
  return pipe(
    Effect.succeed<CardData>({
      title: `Card ${id}`,
      body: `Loaded after ${id * 300}ms`,
    }),
    Effect.delay(`${id * 300} millis`),
  );
}

// ============================================================================
// Card component
// ============================================================================

/**
 * Async card: returns an `Effect<ElementDescriptor>` so it triggers Suspense.
 * The delay is proportional to `id` so the three cards resolve at different
 * times (but the shared fallback waits for all of them).
 */
function Card({ id }: { id: number }) {
  return fetchCard(id).pipe(
    Effect.flatMap((data) =>
      h.div({ class: "card" }, [
        h.h3({ class: "card-title" }, data.title),
        h.p({ class: "card-body" }, data.body),
      ]),
    ),
  );
}

// ============================================================================
// Dashboard: three sibling cards under one Suspense
// ============================================================================

/**
 * Three Card siblings share a single Suspense boundary. The fallback
 * persists until all three have settled, then all are revealed together.
 */
function Dashboard() {
  return h.section({ class: "section" }, [
    h.h2({ class: "section-title" }, "Shared Fallback (3 sibling cards)"),
    h.p(
      { class: "section-desc" },
      "One fallback covers all three cards. The resolved layout appears only once every card has loaded. Cards resolve at 300 ms, 600 ms, and 900 ms.",
    ),
    Boundary.suspend(
      {
        fallback: h.div({ class: "fallback" }, [
          h.span({ class: "spinner", "aria-hidden": "true" }, "⏳"),
          " Loading all cards…",
        ]),
      },
      [h.div({ class: "card-grid" }, [Card({ id: 1 }), Card({ id: 2 }), Card({ id: 3 })])],
    ),
  ]);
}

// ============================================================================
// NestedExample: inner boundary resolves before outer
// ============================================================================

/**
 * The inner Suspense resolves at 200 ms; the outer resolves at 800 ms.
 * Each boundary is independent, so the inner swap happens first without
 * disturbing the outer fallback.
 */
function SlowOuter() {
  return pipe(
    h.p({ class: "outer-content" }, "Outer async content loaded."),
    Effect.delay("800 millis"),
  );
}

function SlowInner() {
  return pipe(
    h.p({ class: "inner-content" }, "Inner resolved first (200 ms)."),
    Effect.delay("200 millis"),
  );
}

function NestedExample() {
  return h.section({ class: "section" }, [
    h.h2({ class: "section-title" }, "Nested Boundaries"),
    h.p(
      { class: "section-desc" },
      "Inner boundary resolves at 200 ms; outer at 800 ms. Each swap is independent.",
    ),
    Boundary.suspend(
      {
        fallback: h.div({ class: "fallback" }, [
          h.span({ class: "spinner", "aria-hidden": "true" }, "⏳"),
          " Outer loading…",
        ]),
      },
      [
        h.div({ class: "nested-outer" }, [
          SlowOuter(),
          Boundary.suspend(
            {
              fallback: h.div({ class: "fallback fallback--inner" }, [
                h.span({ class: "spinner", "aria-hidden": "true" }, "⏳"),
                " Inner loading…",
              ]),
            },
            [SlowInner()],
          ),
        ]),
      ],
    ),
  ]);
}

// ============================================================================
// Root component
// ============================================================================

export function App() {
  return h.div({ class: "app" }, [
    h.header({ class: "header" }, [
      h.h1("Weft: Suspense"),
      h.p(
        { class: "subtitle" },
        "Streaming SSR with fallback → patch swap, and client-side boundary coordination.",
      ),
    ]),
    h.main({ class: "main" }, [Dashboard(), NestedExample()]),
    h.footer({ class: "footer" }, [
      h.span({ class: "status", id: "status" }, "[SSR: not yet interactive]"),
    ]),
  ]);
}
