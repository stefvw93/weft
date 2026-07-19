/**
 * Demo registry.
 *
 * Maps a stable `id` (the markdown `demo=<id>` contract) to a zero-arg factory that
 * returns a fresh, interactive Weft `Node`. Each demo is an ordinary subtree of the
 * one SSR-rendered + hydrated page, so it needs no island wiring: it renders on the
 * server and becomes interactive on hydrate. Every factory returns a new `Node` per
 * call so each mount gets its own instance scope.
 *
 * Demo modules import only `@weftui/core` + `effect` (no server/node-only deps), so
 * the registry is importable by both the client and server bundles.
 */

import type { Node } from "@weftui/core";
import { ReactiveCounter } from "./reactive-counter";
import { ReactiveInput } from "./reactive-input";

/** `id → () => Node` map of all live demos. */
export const demos: ReadonlyMap<string, () => Node> = new Map<string, () => Node>([
  ["reactive-counter", ReactiveCounter],
  ["reactive-input", ReactiveInput],
]);

/** Looks up a demo factory by id, or `undefined` if none is registered. */
export const getDemo = (id: string): (() => Node) | undefined => demos.get(id);
