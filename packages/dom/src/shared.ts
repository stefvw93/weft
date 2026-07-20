/**
 * Comment-marker vocabulary shared between the client renderer, the hydratable
 * server renderer, and the Suspense boundary implementation.
 *
 * **Reactive regions** (`stream-start-N` / `stream-end-N`): bracket the DOM
 * nodes produced by a `Stream`/`Effect` child. Used by the client renderer to
 * locate the region on each emission, and by the server hydratable renderer so
 * the hydrator can find reactive regions in server-rendered HTML.
 *
 * **Suspense boundaries** (`suspense-start-N` / `suspense-end-N`): bracket the
 * fallback DOM nodes while async children are pending. Removed from the DOM
 * after the client-side swap (or replaced by the SSR patch script on the
 * server). IDs for both marker kinds are drawn from the same monotonic counter
 * (`RenderContext.streamIdCounter`) and are therefore unique within a single
 * render tree.
 */

/**
 * Text content (without the `<!--`/`-->` delimiters) of a reactive region's
 * opening comment marker, e.g. `" stream-start-3 "`.
 */
export function streamStartText(id: number): string {
  return ` stream-start-${id} `;
}

/**
 * Text content of a reactive region's closing comment marker, e.g.
 * `" stream-end-3 "`.
 */
export function streamEndText(id: number): string {
  return ` stream-end-${id} `;
}

/**
 * The kind and id parsed from a stream marker comment.
 */
export interface StreamMarker {
  readonly kind: "start" | "end";
  readonly id: number;
}

// ============================================================================
// Suspense boundary markers
// ============================================================================

/**
 * Text content (without the `<!--`/`-->` delimiters) of a Suspense boundary's
 * opening comment marker, e.g. `" suspense-start-3 "`.
 *
 * On the client, this marker is inserted before the fallback content while async
 * children are pending and removed after the DOM swap completes.
 * On the server, it is emitted inline so the SSR patch script can locate the
 * boundary via `TreeWalker`.
 */
export function suspenseStartText(id: number): string {
  return ` suspense-start-${id} `;
}

/**
 * Text content of a Suspense boundary's closing comment marker, e.g.
 * `" suspense-end-3 "`.
 */
export function suspenseEndText(id: number): string {
  return ` suspense-end-${id} `;
}

/**
 * Marker attribute on the inline `<script type="application/json">` sentinel a
 * failure-replay Suspense patch (AC-FH7) prepends to its substituted content.
 * The script carries `{"error":<encoded failure>}`; the client `hydrate`
 * recognises it inside a retained suspense-marker region and replays the
 * failure to the nearest boundary (AC-H14). Shared so server and client agree
 * on the exact wire marker (mirrors `BOUNDARY_FAILURE_ATTR`).
 */
export const SUSPENSE_FAILURE_ATTR = "data-weft-suspense-failure";

/**
 * The kind and id parsed from a suspense boundary marker comment.
 */
export interface SuspenseMarker {
  readonly kind: "start" | "end";
  readonly id: number;
}

const SUSPENSE_MARKER_PATTERN = /^ suspense-(start|end)-(\d+) $/;

/**
 * Recognises a comment node as a Suspense boundary start/end marker, returning
 * its kind and id, or `null` if the comment is not a suspense marker.
 */
export function parseSuspenseMarker(comment: Comment): SuspenseMarker | null {
  const match = SUSPENSE_MARKER_PATTERN.exec(comment.data);
  if (match === null) {
    return null;
  }
  const kind = match[1] as "start" | "end";
  // biome-ignore lint/style/noNonNullAssertion: regex guarantees group 2 on match
  const id = Number.parseInt(match[2]!, 10);
  return { kind, id };
}

// ============================================================================
// Stream region markers
// ============================================================================

// ============================================================================
// Boundary error markers
// ============================================================================

/**
 * Text content (without the `<!--`/`-->` delimiters) of a Boundary's
 * opening comment marker, e.g. `" boundary-start-3 "`.
 */
export function boundaryStartText(id: number): string {
  return ` boundary-start-${id} `;
}

/**
 * Text content of a Boundary's closing comment marker, e.g.
 * `" boundary-end-3 "`.
 */
export function boundaryEndText(id: number): string {
  return ` boundary-end-${id} `;
}

// ============================================================================
// Stream region markers
// ============================================================================

const MARKER_PATTERN = /^ stream-(start|end)-(\d+) $/;

/**
 * Recognises a comment node as a reactive-region start/end marker, returning its
 * kind and id, or `null` if the comment is not a stream marker.
 */
export function parseStreamMarker(comment: Comment): StreamMarker | null {
  const match = MARKER_PATTERN.exec(comment.data);
  if (match === null) {
    return null;
  }
  const kind = match[1] as "start" | "end";
  // biome-ignore lint/style/noNonNullAssertion: regex guarantees group 2 on match
  const id = Number.parseInt(match[2]!, 10);
  return { kind, id };
}

// ============================================================================
// Keyed-list per-item markers
// ============================================================================

/**
 * Text content (without the `<!--`/`-->` delimiters) of a keyed-list item's
 * opening comment marker, e.g. `" list-item-start-7 "`.
 *
 * A `List.each` region (bracketed by the usual `stream-start`/`stream-end`
 * markers) brackets each of its items with a `list-item-start`/`list-item-end`
 * pair so that a multi-node item moves and is removed as a single unit, and so
 * the hydratable server renderer can emit adoptable per-item boundaries. IDs are
 * drawn from the same monotonic counter (`RenderContext.streamIdCounter`) as the
 * stream/suspense markers and are therefore unique within one render tree.
 */
export function listItemStartText(id: number): string {
  return ` list-item-start-${id} `;
}

/**
 * Text content of a keyed-list item's closing comment marker, e.g.
 * `" list-item-end-7 "`.
 */
export function listItemEndText(id: number): string {
  return ` list-item-end-${id} `;
}

/**
 * The kind and id parsed from a keyed-list per-item marker comment.
 */
export interface ListItemMarker {
  readonly kind: "start" | "end";
  readonly id: number;
}

const LIST_ITEM_MARKER_PATTERN = /^ list-item-(start|end)-(\d+) $/;

/**
 * Recognises a comment node as a keyed-list per-item start/end marker, returning
 * its kind and id, or `null` if the comment is not a list-item marker.
 *
 * Note: list-item markers are intentionally distinct from stream markers, so
 * {@link parseStreamMarker} returns `null` for them and region-depth walks
 * (`findMatchingEnd`) step over per-item markers without treating them as nested
 * reactive regions.
 */
export function parseListItemMarker(comment: Comment): ListItemMarker | null {
  const match = LIST_ITEM_MARKER_PATTERN.exec(comment.data);
  if (match === null) {
    return null;
  }
  const kind = match[1] as "start" | "end";
  // biome-ignore lint/style/noNonNullAssertion: regex guarantees group 2 on match
  const id = Number.parseInt(match[2]!, 10);
  return { kind, id };
}

/**
 * Determines whether a prop name is an event handler: `on` followed by a
 * lowercase letter. Weft's DOM handler props are all lowercase (`onclick`), so
 * a camelCase `onClick` is an ordinary attribute.
 *
 * Shared by the client renderer (which attaches listeners), the server
 * serializer (which skips handlers), and `Props.merge` (which chains them), so
 * the three cannot drift apart.
 */
export function isEventHandler(name: string): boolean {
  if (name.length <= 2 || !name.startsWith("on")) {
    return false;
  }
  const thirdChar = name[2];
  // Must be a lowercase letter (a-z), not a number or uppercase
  return thirdChar !== undefined && thirdChar >= "a" && thirdChar <= "z";
}
