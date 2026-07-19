export { RouterLive } from "./router-live";
export { installLinkInterceptor } from "./link";
export { back, forward, navigate, patchQuery, push, replace, setQuery } from "./navigation";
// The outlet/root nodes are universal (no DOM specifics), re-exported here for the
// client entry. Mount `RouterApp(def)`: it wraps the outlet in the internal
// not-found boundary (the documented `hydrate(RouterApp(def), root)` flow).
// `RouterOutlet` (= `outletNode`) is the bare nested-outlet without that boundary,
// for callers placing their own not-found handling.
export { RouterApp, outletNode, outletNode as RouterOutlet } from "../outlet";
export { Router } from "../router-service";
export type { NavState } from "../router-service";
