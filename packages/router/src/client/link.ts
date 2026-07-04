import { Effect, Runtime, type Scope } from "effect";
import { stripBase } from "../base";
import type { RouterDef } from "../compile";
import { match } from "../matcher";

/**
 * Installs a global, delegated click interceptor (in the `Router` layer scope)
 * that turns plain same-origin `h.a({ href })` clicks into SPA navigation when
 * the href resolves to a route (L1). Modified clicks, non-left buttons,
 * `target=_blank`, `download`, external origins, same-document (hash-only or
 * identical-URL) navigations, and non-matching hrefs fall through to the
 * browser's native handling — the interceptor leaves `preventDefault` untouched
 * in those cases (L2). The listener is removed on scope teardown (L3).
 *
 * With a non-empty `base`, hrefs are matched after stripping it — an href
 * outside the base falls through to the browser (L2), and `navigate` receives
 * the canonical (base-less) url (see `base.specs.md`).
 *
 * @param def - The router definition, used to decide whether an href matches a route.
 * @param navigate - The router's `navigate`, run via the captured runtime on a match.
 * @param base - Normalized path prefix the app is served under (`""` for none).
 */
export function installLinkInterceptor(
  def: RouterDef,
  navigate: (to: string) => Effect.Effect<void>,
  base = "",
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* () {
    const runtime = yield* Effect.runtime<never>();

    const onClick = (event: MouseEvent): void => {
      // L2: ignore non-plain clicks.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element ? (target.closest("a") as HTMLAnchorElement | null) : null;
      if (anchor === null) return;

      // L2: skip anchors that should trigger a full load.
      const targetAttr = anchor.getAttribute("target");
      if (
        anchor.hasAttribute("download") ||
        (targetAttr !== null && targetAttr !== "_self") ||
        anchor.getAttribute("rel") === "external"
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (href === null || href.length === 0) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      // L2: external origin → full load.
      if (url.origin !== window.location.origin) return;

      const to = `${url.pathname}${url.search}`;
      // L2: same-document navigation (only the hash differs, or the exact same
      // URL) → let the browser handle it natively. Intercepting here would strip
      // the hash (breaking in-page anchors) and push a duplicate history entry.
      const current = `${window.location.pathname}${window.location.search}`;
      if (to === current) return;

      // L2: hrefs outside the base trigger a full load; under it, match and
      // navigate with the canonical (base-less) url.
      const canonical = stripBase(base, to);
      if (canonical === null) return;

      // L2: only intercept hrefs that resolve to a route; let others load fully.
      if (match(def, canonical)._tag !== "Matched") return;

      event.preventDefault();
      Runtime.runFork(runtime)(navigate(canonical));
    };

    yield* Effect.acquireRelease(
      Effect.sync(() => document.addEventListener("click", onClick)),
      () => Effect.sync(() => document.removeEventListener("click", onClick)),
    );
  });
}
