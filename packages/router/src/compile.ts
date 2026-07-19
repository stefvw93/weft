import type { Node } from "@weftui/core";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Schema } from "effect";
import { RouterNotFound } from "./errors";
import type { ComponentSlot, LayoutNode, RouteNode, TreeE, TreeNode, TreeR } from "./route-tree";

/**
 * A compiled layout level: its component slot plus the dedupe `patternPrefix` used
 * by the client outlet to key the level. A layout owns no path of its own, so the
 * prefix is derived as the **longest common path-segment prefix of every leaf in
 * the layout's subtree**: it changes (and the level re-renders) exactly when a
 * param shared by all those leaves changes, and persists otherwise.
 */
export interface CompiledLayout {
  /** Longest common path prefix of the layout's subtree leaves, e.g. `/users/:id`. */
  readonly patternPrefix: string;
  /** Param names appearing in `patternPrefix`. */
  readonly paramNames: readonly string[];
  /** The layout's component slot; invoked per render with the outlet injected via `Router.Outlet`. */
  readonly component: ComponentSlot;
}

/**
 * A compiled leaf route: the flattened routing contract for one page. `pathSchema`
 * merges every path field declared down the branch (leaf wins on collision) and
 * covers every `:name` placeholder (defaulting to `Schema.String`).
 */
export interface CompiledLeaf {
  /** Stable identifier derived from the full pattern; used as the HttpApi endpoint name. */
  readonly id: string;
  /** Full path pattern from the root, e.g. `/users/:id/settings` (root ⇒ `/`). */
  readonly fullPathPattern: string;
  /** Ordered param names in `fullPathPattern`. */
  readonly paramNames: readonly string[];
  /**
   * Path-param schema. Its **encoded** side is typed string-encodeable
   * (`Record<string, string | undefined>`) so it satisfies platform's
   * `HttpApiEndpoint` `params` constraint without an `as any` cast: param schemas
   * round-trip strings, so the `Schema.Struct` value is asserted to this shape.
   */
  readonly pathSchema: Schema.Codec<
    Record<string, unknown>,
    Readonly<Record<string, string | undefined>>
  >;
  /**
   * Query schema. Its **encoded** side is typed string-encodeable
   * (`Record<string, string | ReadonlyArray<string> | undefined>`) so it satisfies
   * platform's `HttpApiEndpoint` `query` constraint without a cast.
   */
  readonly querySchema: Schema.Codec<
    Record<string, unknown>,
    Readonly<Record<string, string | ReadonlyArray<string> | undefined>>
  >;
  /** The page's component slot; invoked per render, reads params via `Router.params` / `Router.query`. */
  readonly component: ComponentSlot;
  /** Ancestor layouts (root → parent) wrapping this leaf. */
  readonly layoutChain: readonly CompiledLayout[];
}

/** The result of compiling a route tree: a flat leaf list plus the not-found page. */
export interface Compiled {
  readonly leaves: readonly CompiledLeaf[];
  readonly notFound: () => Node<any, any>;
}

/**
 * A sealed, compiled router definition. The unit passed to the client and server.
 * `E`/`R` are phantom: they carry the aggregate error / requirement channels of
 * the whole tree (plus the not-found page) so {@link RouterApp} / {@link outletNode}
 * can surface a precise `Node` type instead of `Node<any, any>`.
 */
export interface RouterDef<E = any, R = any> {
  readonly root: TreeNode;
  readonly notFound: () => Node<any, any>;
  readonly compiled: Compiled;
  /**
   * The authoritative `HttpApi` for this tree (one `"pages"` group, one GET
   * endpoint per leaf). The single source of truth the server dispatch and the
   * client matcher both derive from; {@link Compiled} carries only the
   * nesting/render metadata platform's flat API can't represent. Built by
   * {@link buildHttpApi} during {@link makeRouter}.
   */
  readonly httpApi: HttpApi.Top;
  /**
   * Phantom marker for the tree's aggregate error channel. Covariant (stores `E`
   * directly) so a fully-static `RouterDef<never, never>` stays assignable to the
   * `RouterDef<any, any>` arms used internally (mirrors {@link LayoutNode}).
   */
  readonly _E?: E;
  /** Phantom marker for the tree's aggregate requirement channel. */
  readonly _R?: R;
}

/** Options for {@link router}. */
export interface RouterOptions<NF extends Node<any, any> = Node<any, any>> {
  /** App-level not-found page, rendered when no route matches or a page raises `RouterNotFound`. */
  readonly notFound: () => NF;
}

/**
 * Maps each authored {@link RouteNode} to its {@link CompiledLeaf}. Populated by
 * {@link compile} (via {@link router}) and read by `href` so a leaf reference can
 * resolve its full pattern and schemas.
 */
export const leafRegistry: WeakMap<RouteNode<any, any, any, any>, CompiledLeaf> = new WeakMap();

/** Splits a segment string into its non-empty path parts. */
function splitSegment(segment: string): readonly string[] {
  return segment.split("/").filter((s) => s.length > 0);
}

/** Joins cumulative path parts into a normalized pattern (`/`-prefixed, no trailing `/`). */
function toPattern(parts: readonly string[]): string {
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** Extracts `:name` placeholder names from cumulative path parts, in order. */
function extractParams(parts: readonly string[]): readonly string[] {
  return parts.filter((p) => p.startsWith(":")).map((p) => p.slice(1));
}

/** Derives a stable, identifier-safe id from a full path pattern. */
function patternToId(pattern: string, index: number): string {
  const base = pattern
    .replace(/:/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base.length === 0 ? `root_${index}` : `${base}_${index}`;
}

/** The longest leading run of path parts shared by every entry in `partsList`. */
function longestCommonSegmentPrefix(partsList: readonly (readonly string[])[]): readonly string[] {
  const first = partsList[0];
  if (first === undefined) return [];
  const prefix: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const part = first[i];
    if (part === undefined) break;
    let common = true;
    for (let j = 1; j < partsList.length; j++) {
      if (partsList[j]?.[i] !== part) {
        common = false;
        break;
      }
    }
    if (!common) break;
    prefix.push(part);
  }
  return prefix;
}

/** A leaf collected during the walk, tagged with its ancestor layouts. */
interface LeafWork {
  readonly node: RouteNode<any, any, any, any>;
  /** Full path parts from the root (only routes contribute parts). */
  readonly parts: readonly string[];
  /** Path-param schemas declared on this leaf (and any ancestor route). */
  readonly pathFields: Record<string, Schema.Top>;
  readonly query: Record<string, Schema.Top>;
  /** Ancestor layout nodes, root → parent. */
  readonly ancestors: readonly LayoutNode<any, any>[];
}

/**
 * Compiles a route tree into a flat list of {@link CompiledLeaf}s (C1–C6).
 *
 * Pass 1 walks the tree: only **routes** contribute path parts (layouts own no
 * path), so each leaf's `parts` come solely from the route segments on its branch,
 * and its ancestor `LayoutNode`s are recorded in order. Pass 2 derives one shared
 * {@link CompiledLayout} per distinct layout node, whose `patternPrefix` is the
 * longest common path prefix of that layout's subtree leaves. It then assembles
 * each leaf's `layoutChain` (root → parent) and merged path schema.
 */
export function compile(def: { root: TreeNode; notFound: () => Node<any, any> }): Compiled {
  const leafWorks: LeafWork[] = [];

  const walk = (
    node: TreeNode,
    parentParts: readonly string[],
    parentPathFields: Record<string, Schema.Top>,
    ancestors: readonly LayoutNode<any, any>[],
  ): void => {
    if (node._tag === "Layout") {
      // Layouts own no path: recurse with the parent's parts unchanged. Their
      // dedupe `patternPrefix` is derived (pass 2) as the LCP of subtree leaves.
      for (const child of node.children) {
        walk(child, parentParts, parentPathFields, [...ancestors, node]);
      }
      return;
    }

    leafWorks.push({
      node,
      parts: [...parentParts, ...splitSegment(node.segment)],
      pathFields: { ...parentPathFields, ...(node.path as Record<string, Schema.Top>) },
      query: node.query as Record<string, Schema.Top>,
      ancestors,
    });
  };

  walk(def.root, [], {}, []);

  // Pass 2a: group each layout's subtree leaf-parts, then compute its LCP prefix.
  const layoutLeafParts = new Map<LayoutNode<any, any>, (readonly string[])[]>();
  for (const work of leafWorks) {
    for (const ancestor of work.ancestors) {
      const list = layoutLeafParts.get(ancestor) ?? [];
      list.push(work.parts);
      layoutLeafParts.set(ancestor, list);
    }
  }
  const compiledLayouts = new Map<LayoutNode<any, any>, CompiledLayout>();
  for (const [node, partsList] of layoutLeafParts) {
    const lcp = longestCommonSegmentPrefix(partsList);
    compiledLayouts.set(node, {
      patternPrefix: toPattern(lcp),
      paramNames: extractParams(lcp),
      component: node.component,
    });
  }

  // Pass 2b: assemble each leaf with its layout chain and merged path schema.
  const leaves: CompiledLeaf[] = [];
  for (const work of leafWorks) {
    const fullPathPattern = toPattern(work.parts);
    const paramNames = extractParams(work.parts);
    const pathFields: Record<string, Schema.Top> = {};
    for (const name of paramNames) {
      pathFields[name] = work.pathFields[name] ?? Schema.String;
    }
    const leaf: CompiledLeaf = {
      id: patternToId(fullPathPattern, leaves.length),
      fullPathPattern,
      paramNames,
      pathSchema: Schema.Struct(pathFields) as unknown as CompiledLeaf["pathSchema"],
      querySchema: Schema.Struct(work.query) as unknown as CompiledLeaf["querySchema"],
      component: work.node.component,
      // Every ancestor was compiled in pass 2a, so the lookup is total.
      layoutChain: work.ancestors.map((a) => compiledLayouts.get(a)!),
    };
    leaves.push(leaf);
    leafRegistry.set(work.node, leaf);
  }

  return { leaves, notFound: def.notFound };
}

/**
 * Builds the authoritative `HttpApi` for a compiled tree (S4): a single `"pages"`
 * group holding one GET endpoint per leaf, at each leaf's full path
 * pattern, carrying `params: pathSchema`, `query: querySchema`, a
 * `Schema.String` (text/HTML) success, and a `RouterNotFound → 404` error. The tree
 * (not `HttpApi`) is the authoring surface; this is the single source of truth the
 * server dispatch (`HttpApiBuilder`) and the client matcher / derived `HttpApiClient`
 * read from, so both sides agree on paths and schemas.
 *
 * Each leaf's `pathSchema`/`querySchema` are typed string-encodeable (see
 * {@link CompiledLeaf}), so the `params`/`query` options need no `as any` casts.
 *
 * `Boundary.rpc` data no longer rides this spine: it resolves through the app's
 * merged `RpcGroup` over the ambient `AppRpcClient` (`POST /_eui/rpc`), wired
 * explicitly into `RouterServer`/`RouterLive`. The matcher reads only `"pages"`.
 */
export function buildHttpApi(leaves: readonly CompiledLeaf[]): HttpApi.Top {
  // The group/endpoint types accumulate per-endpoint; a precise static type is not
  // expressible across a runtime loop, so the assembly is intentionally loose.
  const group = leaves.reduce(
    // oxlint-disable-next-line typescript/no-explicit-any
    (g: any, leaf) =>
      g.add(
        HttpApiEndpoint.get(leaf.id, leaf.fullPathPattern as `/${string}`, {
          params: leaf.pathSchema,
          query: leaf.querySchema,
          success: Schema.String,
          error: RouterNotFound.pipe(HttpApiSchema.status(404)),
        }),
      ),
    HttpApiGroup.make("pages"),
  );
  return HttpApi.make("router").add(group);
}

/**
 * Seals a route tree into a {@link RouterDef}, compiling it eagerly (so leaf
 * references are stamped for `href`), building its authoritative {@link buildHttpApi}
 * spine, and capturing the app-level not-found page. The tree's aggregate channels
 * (plus the not-found page's) are carried on the returned `RouterDef`'s phantom
 * `E`/`R` params.
 */
export function makeRouter<T extends TreeNode, NF extends Node<any, any> = Node>(
  root: T,
  options: RouterOptions<NF>,
): RouterDef<TreeE<T> | Node.Error<NF>, TreeR<T> | Node.Context<NF>> {
  const compiled = compile({ root, notFound: options.notFound });
  return {
    root,
    notFound: options.notFound,
    compiled,
    httpApi: buildHttpApi(compiled.leaves),
  };
}
