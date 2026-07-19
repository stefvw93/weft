/**
 * `@weftui/vite`: build-tooling shell for Weft.
 *
 * This package previously shipped `effectUiPrune`, a Vite plugin that stripped
 * co-located `load`/`provide` from `Boundary.server` call sites on the client
 * build. `Boundary.server` was replaced by `Boundary.rpc`, whose server handlers
 * live in a separate handler `Layer` the client never imports, so tree-shaking
 * does the client/server split with no bundler transform, and the prune plugin
 * was retired. The package is kept as a shell for future weft Vite plugins.
 */

export {};
