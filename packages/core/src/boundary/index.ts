export { FAILURE_BOUNDARY, SERVER_BOUNDARY, SUSPENSE_BOUNDARY } from "./boundary-impl";
export type { CatchTagE, CatchTagsE } from "./boundary-impl";

/**
 * The `Boundary` namespace groups the failure and suspense boundary combinators
 * (`catch`, `catchCause`, `catchTag`, `catchTags`, `catchFilter`, `catchIf`,
 * `suspend`, `rpc`) plus their descriptor/`Resource` types. It is a re-export of
 * `./boundary-impl` as a namespace, because `catch` is a reserved word (exported
 * as `catch` from the module, mirroring Effect 4's own `Effect.catch`), which a
 * `namespace` block cannot express.
 */
export * as Boundary from "./boundary-impl";

export { AppRpcClientTag } from "./rpc-client";
export type { AppRpcClient } from "./rpc-client";
