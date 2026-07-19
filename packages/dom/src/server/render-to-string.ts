import type { Renderable } from "@weftui/core/types";
import type { AppRpcClientTag } from "@weftui/core";
import { type Effect, Stream } from "effect";
import { renderToStreamFallbackOnly, renderToStreamHydratable } from "./render-to-stream";

/**
 * Serializes an Effect-infused JSX tree (`Renderable`) into a single HTML string.
 * The server-side counterpart to the client DOM renderer, intended to produce
 * output isomorphic with what the client renderer creates in the browser.
 *
 * Suspense boundaries render their fallback directly: no comment markers
 * and no `<template>`/`<script>` patches. For streaming Suspense support use
 * {@link renderToStreamHydratable} / {@link renderToStream} instead.
 *
 * Requires an {@link AppRpcClientTag} in context when the tree contains a
 * `Boundary.rpc` (provided by `@weftui/router`'s `RouterServer`).
 */
export const renderToString = (node: Renderable): Effect.Effect<string, Error, AppRpcClientTag> =>
  renderToStreamFallbackOnly(node).pipe(Stream.mkString);

/**
 * Like {@link renderToString}, but emits the reactive-region comment markers
 * (`<!-- stream-start-N -->` … `<!-- stream-end-N -->`) that the client
 * `hydrate` needs to locate reactive regions. Use this when the page will be
 * hydrated on the client; use {@link renderToString} for static, non-hydrated
 * output.
 *
 * Re-derived from {@link renderToStreamHydratable} via `Stream.mkString`.
 */
export const renderToStringHydratable = (
  node: Renderable,
): Effect.Effect<string, Error, AppRpcClientTag> =>
  renderToStreamHydratable(node).pipe(Stream.mkString);
