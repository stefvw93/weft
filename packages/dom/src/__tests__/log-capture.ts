import { Cause, Logger, References } from "effect";

/** An `Error`-level log entry captured by {@link makeErrorLogCapture}. */
export interface CapturedErrorLog {
  readonly message: unknown;
  readonly cause: Cause.Cause<unknown>;
  readonly annotations: Record<string, unknown>;
}

/**
 * Builds a replacement logger `Layer` that records every `Error`-level log
 * entry carrying a non-empty `Cause`. That is the shape of both the Effect
 * runtime's unhandled-error report and an explicit
 * `Effect.logError(message, cause)`. This lets tests assert that unhandled
 * failures are surfaced (with their `weft.region` annotation) rather than
 * silently swallowed. Provide `logger` to
 * the mount/hydrate Effect; `entries` populates asynchronously as failures occur.
 */
export function makeErrorLogCapture() {
  const entries: CapturedErrorLog[] = [];
  const logger = Logger.layer([
    Logger.make(({ logLevel, message, cause, fiber }) => {
      // Effect 4: `logLevel` is a string union, `Cause` is flattened (`reasons`),
      // and log annotations are read from the fiber's `CurrentLogAnnotations`.
      if (logLevel === "Error" && Cause.isCause(cause) && cause.reasons.length > 0) {
        entries.push({
          message,
          cause,
          annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
        });
      }
    }),
  ]);
  return { entries, logger };
}
