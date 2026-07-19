import { isStream, toStream } from "@weftui/core";
import { Effect, Option, Stream } from "effect";

/**
 * Determines whether a prop name is an event handler (`on` + lowercase letter),
 * which is skipped during attribute serialization.
 */
export function isEventHandler(name: string): boolean {
  if (name.length <= 2 || !name.startsWith("on")) {
    return false;
  }
  const thirdChar = name[2];
  // Must be a lowercase letter (a-z), not a number or uppercase
  return thirdChar !== undefined && thirdChar >= "a" && thirdChar <= "z";
}

/**
 * HTML void elements: rendered without a closing tag, children are ignored.
 */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const ESCAPE_MAP: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#x27;",
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * Escapes the five HTML-significant characters in text content and attribute
 * values. Fork of the `escape-html` package with `'` mapped to `&#x27;`
 * (matching React's Fizz renderer). Coerces input to string first.
 */
export function escapeHtml(value: string): string {
  return value.replace(/["'&<>]/g, (char) => ESCAPE_MAP[char] ?? char);
}

/**
 * UTF-16 code units that must be escaped to make JSON safe to embed inline
 * inside a `<script type="application/json">` element. `<` is the critical one.
 * Escaping it prevents an embedded `</script` from closing the script early and
 * `<!--` from opening an HTML comment; the JS line/paragraph separators
 * U+2028/U+2029 are escaped because they are valid JSON but illegal in a JS
 * string literal (some embedders reuse the JS tokenizer). `&` and `>` are
 * escaped defensively. Each maps to a `\uXXXX` escape, which is a valid JSON
 * string escape that `JSON.parse` restores to the original character.
 */
const SCRIPT_JSON_UNSAFE_CODES: ReadonlySet<number> = new Set([
  0x26, // &
  0x3c, // <
  0x3e, // >
  0x2028, // line separator
  0x2029, // paragraph separator
]);

/**
 * `JSON.stringify`s `value` and escapes the code units that are unsafe to embed
 * inline in a `<script type="application/json">` element (see
 * {@link SCRIPT_JSON_UNSAFE_CODES}). The result is still valid JSON: the escapes
 * only ever occur inside JSON string tokens and `JSON.parse` restores them.
 */
export function serializeJsonForScript(value: unknown): string {
  const json = JSON.stringify(value);
  let result = "";
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (SCRIPT_JSON_UNSAFE_CODES.has(code)) {
      result += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      result += json[i];
    }
  }
  return result;
}

/**
 * Converts camelCase to kebab-case for CSS properties.
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Serializes an element's props into an attribute string (including the leading
 * space for each emitted attribute). Mirrors the special-case ordering of the
 * client renderer's `setElementProps`: children, ref, and event handlers are
 * skipped; `style` is serialized as a declaration list; everything else becomes
 * a plain attribute. Prop names are emitted as-is (no renaming/normalization).
 */
export function serializeProps(props: Record<string, unknown>): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    let result = "";

    for (const [name, value] of Object.entries(props)) {
      if (name === "children" || name === "ref" || isEventHandler(name)) {
        continue;
      }

      if (name === "style") {
        result += yield* serializeStyle(value);
        continue;
      }

      result += yield* serializeAttribute(name, value);
    }

    return result;
  });
}

/**
 * Resolves a possibly Stream/Effect value to its first/current emission
 * (mirroring how children are rendered, and matching the client's initial
 * paint). Using the first emission also lets non-terminating streams (e.g.
 * `SubscriptionRef.changes`) resolve immediately instead of hanging. Static
 * values pass through.
 */
function resolveValue(value: unknown): Effect.Effect<unknown, Error> {
  if (isStream(value) || Effect.isEffect(value)) {
    return toStream(value).pipe(Stream.runHead, Effect.map(Option.getOrElse(() => undefined)));
  }
  return Effect.succeed(value);
}

/**
 * Serializes a single attribute into ` name="value"` (with leading space), or
 * an empty string if it should be omitted. Mirrors the client's attribute
 * semantics: null/undefined omitted, booleans render as `name=""`/omitted,
 * everything else is coerced to a string and escaped.
 */
function serializeAttribute(name: string, value: unknown): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const resolved = yield* resolveValue(value);

    if (resolved === null || resolved === undefined) {
      return "";
    }

    if (typeof resolved === "boolean") {
      return resolved ? ` ${name}=""` : "";
    }

    // oxlint-disable-next-line typescript/no-base-to-string
    return ` ${name}="${escapeHtml(String(resolved))}"`;
  });
}

/**
 * Serializes the `style` prop into ` style="..."` (with leading space), or an
 * empty string if it produces no declarations. Accepts a string, an object of
 * (possibly Stream/Effect) declarations, or a Stream/Effect resolving to either.
 */
function serializeStyle(value: unknown): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const resolved = yield* resolveValue(value);

    if (resolved === null || resolved === undefined) {
      return "";
    }

    if (typeof resolved === "string") {
      return resolved === "" ? "" : ` style="${escapeHtml(resolved)}"`;
    }

    if (typeof resolved === "object") {
      const declarations: string[] = [];

      for (const [key, raw] of Object.entries(resolved as Record<string, unknown>)) {
        const propValue = yield* resolveValue(raw);
        if (propValue === null || propValue === undefined) {
          continue;
        }
        // oxlint-disable-next-line typescript/no-base-to-string
        declarations.push(`${camelToKebab(key)}: ${String(propValue)}`);
      }

      if (declarations.length === 0) {
        return "";
      }

      return ` style="${escapeHtml(declarations.join("; "))}"`;
    }

    return "";
  });
}
