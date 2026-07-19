# ssr-hydration

A minimal, live server-side-rendering + client-hydration demo for `@weftui/dom`.

## Overview

A Node dev server renders `App()` to **hydratable** HTML on every request. The browser receives that server markup, then the client `hydrate()`s it: the static structure is adopted in place and the reactive counter region resumes flash-free, becoming interactive without re-rendering.

## How to run

```bash
vp run -F ssr-hydration dev
```

Then open <http://localhost:3100>.

## How it works

- **Server** (`server.ts` → `src/entry-server.ts`): `renderToStringHydratable(App({ initialValue: 3 }))` produces HTML that includes `<!-- stream-start-N -->` / `<!-- stream-end-N -->` comment markers around the reactive `SubscriptionRef.changes(count)` region. The server renders the stream's first emission — `3` — between those markers.
- **Client** (`src/entry-client.ts`): `WeftApp.make()` creates the app, then `WeftApp.hydrate(app, App({ initialValue: 3 }), root)` walks the component tree in lockstep with the existing DOM, adopting nodes in place and attaching event handlers. It locates the reactive region via the markers and hydrates the stream's first emission (`3`) against the adopted node. Because server and client first emissions match, the node keeps its identity — no flash, no re-mount.

## What to observe

- `curl -s http://localhost:3100` shows the static content plus the `<!-- stream-start-` / `<!-- stream-end-` markers wrapping the count `3` — proving hydratable HTML is produced before any JS runs.
- In the browser, the counter shows `3` immediately (server markup). After hydration the `+` / `-` buttons work, the status flips to `[hydrated]`, and the count node does not flicker on the first emission.
