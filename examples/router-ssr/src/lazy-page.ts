/**
 * A page component loaded lazily via `Router.lazy`, in its own chunk, imported only when
 * the `/lazy` route renders. Kept in a separate module so a real dynamic `import()` code-
 * splits it out of the initial graph (see `packages/router/src/lazy-component.specs.md`).
 * Consumed by `lazy-route.browser.test.ts`.
 */

import { Component, h } from "@weftui/core";

/** The lazily-loaded page body. */
export const LazyPage = Component.make(() => h.div({ id: "lazy" }, "lazy loaded"));
