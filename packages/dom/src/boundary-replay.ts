import {
  FAILURE_BOUNDARY,
  FRAGMENT,
  getElementDescriptor,
  isStream,
  LIST,
  SERVER_BOUNDARY,
  SUSPENSE_BOUNDARY,
} from "@weftui/core";
import type { Boundary, ElementDescriptor, Renderable } from "@weftui/core";
import { Effect, type Schema } from "effect";

/**
 * Marker attribute on the inline `<script type="application/json">` that carries
 * an encoded `Boundary.rpc` **rpc failure** (as opposed to a success
 * payload, which is the same `<script>` with no attribute). The server emits it
 * on the enclosing failure `Boundary`, before the fallback HTML; the client
 * `hydrate` recognises it to replay the typed failure. Shared so server and
 * client agree on the exact wire marker.
 */
export const BOUNDARY_FAILURE_ATTR = "data-weft-boundary-failure";

/**
 * The fields of a `Boundary.rpc` descriptor's `props` that the typed-failure
 * replay path needs: `errorSchema` (to decode the encoded rpc error on the
 * client) plus the success-replay fields. Both the server SSR props and the
 * client hydrate props are structurally assignable to this, and the server
 * matches an entry by **reference identity** against the failing boundary's
 * `props`, so {@link collectServerBoundaries} returns the live descriptor `props`
 * objects (not copies).
 */
export interface ServerBoundaryReplayProps {
  readonly successSchema: Schema.Codec<unknown, unknown>;
  readonly render: (resource: Boundary.Resource<unknown>) => Renderable;
  readonly errorSchema: Schema.Codec<unknown, unknown>;
}

/**
 * Single pre-order traversal collecting every **statically reachable**
 * `Boundary.rpc` descriptor's `props` within `children`, in document order.
 * Imported by **both** the server SSR (to compute a failing boundary's index)
 * and the client `hydrate` (to locate the index-th boundary's `errorSchema`),
 * so the index is computed identically on both sides: the same positional
 * determinism the renderers already rely on.
 *
 * Traversal rules (mirrors the renderers' own walk):
 * - **Descends** arrays/iterables, fragments, suspense boundaries, failure
 *   boundaries, string-element children, and **function components** (called with
 *   their props, like the renderers do), and static-markup nodes carrying an
 *   {@link ElementDescriptor}.
 * - **Does not descend** into another `Boundary.rpc`'s `render` output (it is
 *   data-dependent, only produced once the rpc resolves) or a `List.each`
 *   projection (also data-dependent), and stops at a genuinely reactive
 *   `Effect`/`Stream` child with no static descriptor. A `Boundary.rpc` that
 *   is only reachable through one of those is therefore **not** indexed; a
 *   failure under it degrades to a recoverable hydration mismatch.
 */
export function collectServerBoundaries(
  children: Renderable,
): readonly ServerBoundaryReplayProps[] {
  const out: ServerBoundaryReplayProps[] = [];
  walk(children, out);
  return out;
}

function walk(node: Renderable, out: ServerBoundaryReplayProps[]): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return;

  if (isStream(node) || Effect.isEffect(node)) {
    // Static markup carries its descriptor, so descend it. A genuinely
    // reactive Effect/Stream has none and is not statically reachable.
    const descriptor = getElementDescriptor(node);
    if (descriptor !== undefined) {
      walkDescriptor(descriptor, out);
    }
    return;
  }

  if (typeof node === "object" && Symbol.iterator in node && !("type" in node)) {
    for (const child of node as Iterable<Renderable>) {
      walk(child, out);
    }
    return;
  }

  if (typeof node === "object" && "type" in node && !(Symbol.iterator in node)) {
    walkDescriptor(node as ElementDescriptor, out);
  }
}

function walkDescriptor(descriptor: ElementDescriptor, out: ServerBoundaryReplayProps[]): void {
  const { type, props } = descriptor;

  if (type === SERVER_BOUNDARY) {
    // Record the live props object (matched by reference on the server). Do NOT
    // descend into render(data): it is data-dependent, not statically reachable.
    out.push(props as unknown as ServerBoundaryReplayProps);
    return;
  }

  if (type === FRAGMENT || type === SUSPENSE_BOUNDARY || type === FAILURE_BOUNDARY) {
    walkChildren(props, out);
    return;
  }

  if (type === LIST) {
    // List.each `render` is data-dependent (per-item), not statically reachable.
    return;
  }

  if (typeof type === "string") {
    walkChildren(props, out);
    return;
  }

  if (typeof type === "function") {
    // Function components are called by the renderers; mirror that so the index
    // matches. The result is walked like any other node.
    walk((type as (p: Record<string, unknown>) => Renderable)(props), out);
  }
}

function walkChildren(props: Record<string, unknown>, out: ServerBoundaryReplayProps[]): void {
  const children = "children" in props ? props.children : undefined;
  if (children == null) return;
  const arr = Array.isArray(children) ? (children as Renderable[]) : [children as Renderable];
  for (const child of arr) {
    walk(child, out);
  }
}
