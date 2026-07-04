# Report: Stream subscription failures are silently swallowed without a Boundary

**Severity:** High (debuggability) — failures produce zero output anywhere.
**Component:** `@weftui/dom` client renderer (`packages/dom/src/client/render.ts`)
**Discovered:** 2026-07-04, while building `examples/effect-atom` (PR #120). A disposed
effect-atom registry caused every reactive region to fail on subscription; the app
rendered empty markers with no error output of any kind. Diagnosing required patching
the packed `dist/` to print the swallowed `Exit`.

## Summary

Every reactive subscription in the client renderer forks a fiber that runs
`Stream.runForEach` and awaits its exit. On a failure exit, the cause is routed to the
nearest `BoundaryContext` — and **discarded entirely when no Boundary encloses the
region**. No `logError`, no console output, not even in development mode. The UI
simply stays empty (or stale) at that region.

This is inconsistent with the renderer's own event-handler path, which does log
handler failures in development (`Event handler error: ...`,
`packages/dom/src/client/render.ts:415`).

## Affected sites

All five swallow points share the same pattern
(`Exit.isFailure(exit) ? Option.isSome(boundaryCtx) ? reportError : Effect.void : Effect.void`):

| Site                  | Location         | Covers                                                                               |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `subscribeToStream`   | `render.ts:360`  | Stream/Effect props: attributes, properties, `style`, reactive event-handler sources |
| `handleStreamChild`   | `render.ts:1146` | Stream/Effect children (comment-marker regions)                                      |
| `renderList`          | `render.ts:1520` | `List.each` source subscriptions                                                     |
| hydrate stream region | `render.ts:2302` | Reactive regions during hydration                                                    |
| `hydrateList`         | `render.ts:2935` | List regions during hydration                                                        |

Note: `subscribeToStream` already accepts an `_errorContext: string` parameter
(`"property:<name>"`, `"attribute:<name>"`, `"style"`, `"event:<name>"`) that is
currently **unused** — the call sites already thread through exactly the context a log
line would need.

## Reproduction

Minimal — no effect-atom required:

```ts
import { h } from "@weftui/core";
import { mount } from "@weftui/dom/client";
import { Effect, Stream } from "effect";

// A child stream that fails immediately.
const App = h.div([Stream.fail(new Error("boom"))]);

await Effect.runPromise(mount(App, document.getElementById("root")!));
// Renders: <div><!-- stream-start-1 --><!-- stream-end-1 --></div>
// Console: nothing. Nothing anywhere.
```

The same holds for a failing attribute stream, a failing `List.each` source, and —
the real-world case that surfaced this — a defect raised inside a third-party stream
(`Cannot access Atom ...: registry is disposed`, see
`reports/mount-scoped-service-lifetime.md`).

## Impact

- Any failing reactive source dies invisibly; the region renders nothing or freezes
  at its last value. Users see a blank spot and have no thread to pull.
- Defects (bugs, not typed errors) are swallowed just as silently as typed failures.
  Swallowing _typed_ errors without a Boundary is a defensible design choice;
  swallowing _defects_ hides genuine bugs.
- Third-party Effect integrations are disproportionately hit: their failure modes are
  unfamiliar, and the only diagnostic path today is instrumenting Weft's built output.
- The `e2e` browser tests inherit the same blindness: a broken example asserts
  `textContent === ""` with no failure cause in the test output.

## Recommendation

Keep the Boundary routing exactly as is; fix only the no-Boundary branch:

1. In all five sites, when there is no enclosing Boundary and the exit is a failure
   that is not interruption-only (`Cause.isInterruptedOnly` guard, so unmount teardown
   stays quiet), log the cause in development mode, mirroring the existing
   event-handler convention at `render.ts:415`:

   ```ts
   Effect.logError(`[weft] unhandled stream failure (${errorContext})`, exit.cause);
   ```

2. Use the already-threaded `_errorContext` in `subscribeToStream` (rename to
   `errorContext`); for child/list/hydration regions, include the stream/region id
   from the comment markers.

3. Consider logging defects (non-`Fail` causes) even in production — a defect is never
   an expected error and currently has no escape hatch at all.

## Acceptance criteria

- A failing stream prop, child, or list source without an enclosing Boundary produces
  exactly one `logError` with the pretty-printed cause and a region/prop identifier,
  in development mode.
- Interruption during unmount produces no log output.
- Boundary routing behavior is unchanged when a Boundary is present.
- The effect-atom "registry is disposed" scenario is diagnosable from the browser
  console alone.
