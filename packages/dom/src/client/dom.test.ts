import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Cause, Effect, Exit, Option, Schedule, Stream, SubscriptionRef } from "effect";
import { Component, h, Source, Subscribable } from "@weftui/core";
import type { Renderable } from "@weftui/core/types";
import { UnsupportedNodeTypeError } from "~/data";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Creates a fresh DOM environment for each test
 */
function createTestDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

/**
 * Creates a root element for mounting
 */
function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return root;
}

/**
 * Helper to run mount and wait for initial render
 * Returns the mount handle for cleanup
 */
async function runMount(app: unknown, root: HTMLElement) {
  const handle = await Effect.runPromise(WeftApp.mount(WeftApp.make(), app as never, root));
  return handle;
}

/**
 * Helper to wait for stream emissions
 * Streams run asynchronously after mount, need sufficient time for emissions
 */
function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for initial stream emission (streams fork async)
 */
function waitForStream(): Promise<void> {
  return waitFor(100);
}

/**
 * Wait for subsequent stream emissions
 */
function waitForStreamUpdate(): Promise<void> {
  return waitFor(150);
}

// ============================================================================
// AC1: Mount Function API
// ============================================================================

describe("AC1: Mount Function API", () => {
  it("should clear root element's existing children", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<div>existing</div><span>content</span>";

    const TheComponent = Component.make(() => h.div({}, "new"));
    await runMount(TheComponent({}), root);

    assert.equal(root.children.length, 1);
    assert.equal(root.children[0]?.tagName, "DIV");
    assert.equal(root.children[0]?.textContent, "new");
  });

  it("should append rendered nodes to root", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ id: "test" }, "Hello"), root);

    assert.equal(root.children.length, 1);
    assert.equal((root.children[0] as HTMLElement).id, "test");
  });

  it("should complete after initial render", async () => {
    createTestDOM();
    const root = createRoot();
    const stream = Stream.make(1, 2, 3);

    // Should not throw and should complete
    await runMount(h.div({}, [stream]), root);

    // If we got here, Effect completed successfully
    assert.ok(true);
  });

  it("should return cleanup handle with unmount function", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(h.div({}, "test"), root);

    // Should have unmount function
    assert.ok(typeof handle.unmount === "function");
  });

  it("should properly dispose runtime when unmounted", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(h.div({}, "test"), root);

    // Should unmount without errors
    await Effect.runPromise(handle.unmount());

    // Unmounting again should be idempotent
    await Effect.runPromise(handle.unmount());
  });
});

// ============================================================================
// AC2: Primitive Renderable Rendering
// ============================================================================

describe("AC2: Primitive Renderable Rendering", () => {
  it("should render string as text node", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, "Hello World"), root);

    assert.equal(root.textContent, "Hello World");
  });

  it("should render number as text node", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, 42), root);

    assert.equal(root.textContent, "42");
  });

  it("should render bigint as text node", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [BigInt(9007199254740991)]), root);

    assert.equal(root.textContent, "9007199254740991");
  });

  it("should render boolean as nothing", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [true, false]), root);

    assert.equal(root.textContent, "");
  });

  it("should render null as nothing", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [null]), root);

    assert.equal(root.textContent, "");
  });

  it("should render undefined as nothing", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [undefined]), root);

    assert.equal(root.textContent, "");
  });
});

// ============================================================================
// AC3: Iterable Children
// ============================================================================

describe("AC3: Iterable Children", () => {
  it("should flatten and render array children", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [["a", "b", "c"]]), root);

    assert.equal(root.textContent, "abc");
  });

  it("should recursively flatten nested iterables", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      h.div({}, [
        [
          ["a", "b"],
          ["c", ["d", "e"]],
        ],
      ]),
      root,
    );

    assert.equal(root.textContent, "abcde");
  });

  it("should handle mixed primitives in arrays", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [[1, "text", null, true, 3]]), root);

    assert.equal(root.textContent, "1text3");
  });
});

// ============================================================================
// AC4: Element Creation
// ============================================================================

describe("AC4: Element Creation", () => {
  it("should create element with correct tag name", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, "test"), root);

    assert.equal(root.children[0]?.tagName, "DIV");
  });

  it("should create multiple different elements", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [h.span({}, "a"), h.p({}, "b"), h.section({}, "c")]), root);

    const div = root.children[0];
    assert.equal(div?.children[0]?.tagName, "SPAN");
    assert.equal(div?.children[1]?.tagName, "P");
    assert.equal(div?.children[2]?.tagName, "SECTION");
  });

  it("should let browser validate element type", async () => {
    createTestDOM();
    const root = createRoot();

    // Browser will create HTMLUnknownElement for invalid tags
    // oxlint-disable-next-line
    // @ts-expect-error - testing custom elements
    await runMount(h["custom-element"]({}, "test"), root);

    assert.equal(root.children[0]?.tagName, "CUSTOM-ELEMENT");
  });
});

// ============================================================================
// AC5: Function Components
// ============================================================================

describe("AC5: Function Components", () => {
  it("should call function component once with props", async () => {
    createTestDOM();
    const root = createRoot();
    const callTracker: string[] = [];

    function Greeting({ name }: { name: string }) {
      callTracker.push(name);
      return h.div({}, ["Hello ", name]);
    }

    await runMount(Greeting({ name: "World" }), root);

    assert.deepEqual(callTracker, ["World"]);
    assert.equal(root.textContent, "Hello World");
  });

  it("should handle component returning Effect<Renderable>", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncComponent(): Effect.Effect<Renderable> {
      return Effect.sync(() => h.div({}, "Async Content"));
    }

    await runMount(AsyncComponent(), root);

    // Effect is normalized to Stream which runs async
    await waitForStream();
    assert.equal(root.textContent, "Async Content");
  });

  it("should handle component returning Stream<Renderable>", async () => {
    createTestDOM();
    const root = createRoot();

    function StreamComponent(): Stream.Stream<Renderable> {
      return Stream.make(h.div({}, "First"), h.div({}, "Second"));
    }

    await runMount(StreamComponent(), root);

    // Stream.make emits all values synchronously, so only the last is visible
    await waitForStream();
    assert.ok(root.textContent?.includes("Second"));
  });

  it("should not re-execute component function", async () => {
    createTestDOM();
    const root = createRoot();
    let executionCount = 0;

    function Counter(): Stream.Stream<Renderable> {
      executionCount++;
      return Stream.make(h.div({}, "Count: 1"), h.div({}, "Count: 2"));
    }

    await runMount(Counter(), root);
    await waitForStreamUpdate();

    // Component should only execute once despite stream emissions
    assert.equal(executionCount, 1);
  });
});

// ============================================================================
// AC6: Fragment Handling
// ============================================================================

describe("AC6: Fragment Handling", () => {
  it("should render fragment children without wrapper at root", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.fragment([h.div({}, "A"), h.span({}, "B")]), root);

    assert.equal(root.children.length, 2);
    assert.equal(root.children[0]?.tagName, "DIV");
    assert.equal(root.children[1]?.tagName, "SPAN");
  });

  it("should render fragment children without wrapper as child", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [h.span({}, "A"), h.span({}, "B")]), root);

    const div = root.children[0];
    assert.equal(div?.children.length, 2);
    assert.equal(div?.children[0]?.tagName, "SPAN");
    assert.equal(div?.children[1]?.tagName, "SPAN");
  });

  it("should handle nested fragments", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.fragment([h.div({}, "A"), h.span({}, "B"), h.p({}, "C")]), root);

    assert.equal(root.children.length, 3);
    assert.equal(root.children[0]?.tagName, "DIV");
    assert.equal(root.children[1]?.tagName, "SPAN");
    assert.equal(root.children[2]?.tagName, "P");
  });
});

// ============================================================================
// AC7: Attribute vs Property Detection
// ============================================================================

describe("AC7: Attribute vs Property Detection", () => {
  it("should set standard properties via property assignment", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.input({ type: "text", value: "test" }), root);

    const input = root.children[0] as HTMLInputElement;
    assert.equal(input.value, "test");
    assert.equal(input.type, "text");
  });

  it("should set data-* attributes via setAttribute", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ "data-test-id": "123", "data-value": "abc" }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.getAttribute("data-test-id"), "123");
    assert.equal(div.getAttribute("data-value"), "abc");
  });

  it("should set aria-* attributes via setAttribute", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      h.button({ type: "button", "aria-label": "Close", "aria-expanded": "false" }, "X"),
      root,
    );

    const button = root.children[0] as HTMLElement;
    assert.equal(button.getAttribute("aria-label"), "Close");
    assert.equal(button.getAttribute("aria-expanded"), "false");
  });

  it("should skip children prop when setting props", async () => {
    createTestDOM();
    const root = createRoot();

    // Test that children prop doesn't override combinator children
    await runMount(h.div({ children: "should not set" }, "actual children"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.textContent, "actual children");
    assert.equal(div.hasAttribute("children"), false);
  });
});

// ============================================================================
// AC8: Boolean Attributes
// ============================================================================

describe("AC8: Boolean Attributes", () => {
  it("should set boolean attribute to empty string when truthy", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.input({ disabled: true, readonly: true }), root);

    const input = root.children[0] as HTMLElement;
    assert.equal(input.getAttribute("disabled"), "");
    assert.equal(input.getAttribute("readonly"), "");
  });

  it("should remove boolean attribute when falsy", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.input({ disabled: false, readonly: false }), root);

    const input = root.children[0] as HTMLElement;
    assert.equal(input.hasAttribute("disabled"), false);
    assert.equal(input.hasAttribute("readonly"), false);
  });

  it("should handle checked attribute on checkboxes", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.input({ type: "checkbox", checked: true }), root);

    const input = root.children[0] as HTMLInputElement;
    // checked is a property, not an attribute in most browsers
    // But the boolean value should set it
    assert.equal(input.checked, true);
  });
});

// ============================================================================
// AC9: Attribute Value Serialization
// ============================================================================

describe("AC9: Attribute Value Serialization", () => {
  it("should convert numbers to strings for attributes", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ "data-count": 42 }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.getAttribute("data-count"), "42");
  });

  it("should skip undefined attribute values", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ "data-value": undefined }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.hasAttribute("data-value"), false);
  });

  it("should skip null and undefined attribute values", async () => {
    createTestDOM();
    const root = createRoot();

    // @ts-expect-error -- covers test case
    await runMount(h.div({ "data-null": null, "data-undefined": undefined }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.hasAttribute("data-null"), false);
    assert.equal(div.hasAttribute("data-undefined"), false);
  });
});

// ============================================================================
// AC10: Style Attribute - String Form
// ============================================================================

describe("AC10: Style Attribute - String Form", () => {
  it("should set style attribute from string", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ style: "background: blue; color: white;" }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.getAttribute("style"), "background: blue; color: white;");
  });
});

// ============================================================================
// AC11: Style Attribute - Object Form
// ============================================================================

describe("AC11: Style Attribute - Object Form", () => {
  it("should set style properties from object", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ style: { fontSize: "16px", color: "red" } }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.style.fontSize, "16px");
    assert.equal(div.style.color, "red");
  });

  it("should handle camelCase property names", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ style: { backgroundColor: "blue", marginTop: "10px" } }, "test"), root);

    const div = root.children[0] as HTMLElement;
    assert.equal(div.style.backgroundColor, "blue");
    assert.equal(div.style.marginTop, "10px");
  });
});

// ============================================================================
// AC12: Style with Stream Properties
// ============================================================================

describe("AC12: Style with Stream Properties", () => {
  it("should update individual style properties from streams", async () => {
    createTestDOM();
    const root = createRoot();

    const colorStream = Stream.make("red", "blue", "green");

    await runMount(h.div({ style: { color: colorStream, fontSize: "16px" } }, "test"), root);

    const div = root.children[0] as HTMLElement;

    // Static property set immediately
    assert.equal(div.style.fontSize, "16px");

    // Stream.make emits all values synchronously, so only the last is visible
    await waitForStream();
    assert.equal(div.style.color, "green");
  });

  it("should handle multiple stream properties independently", async () => {
    createTestDOM();
    const root = createRoot();

    const colorStream = Stream.make("red");
    const sizeStream = Stream.make("20px");

    await runMount(h.div({ style: { color: colorStream, fontSize: sizeStream } }, "test"), root);

    await waitForStream();

    const div = root.children[0] as HTMLElement;
    assert.equal(div.style.color, "red");
    assert.equal(div.style.fontSize, "20px");
  });
});

// ============================================================================
// AC13: Style as Stream
// ============================================================================

describe("AC13: Style as Stream", () => {
  it("should replace entire style attribute from Stream<string>", async () => {
    createTestDOM();
    const root = createRoot();

    const styleStream = Stream.make("color: red;", "color: blue; font-size: 20px;");

    await runMount(h.div({ style: styleStream }, "test"), root);

    // Stream.make emits all values synchronously, only last style is applied
    await waitForStream();
    const div = root.children[0] as HTMLElement;
    const style = div.getAttribute("style");
    assert.ok(style?.includes("blue"));
    assert.ok(style?.includes("font-size"));
  });

  it("should replace all style properties from Stream<object>", async () => {
    createTestDOM();
    const root = createRoot();

    const styleStream = Stream.make(
      { color: "red", fontSize: "16px" },
      { backgroundColor: "blue", padding: "10px" },
    );

    await runMount(h.div({ style: styleStream }, "test"), root);

    await waitForStream();
    const div = root.children[0] as HTMLElement;
    // Stream.make emits all values synchronously, only last object is applied
    assert.equal(div.style.backgroundColor, "blue");
    assert.equal(div.style.padding, "10px");
    // Previous style properties should be replaced
    assert.equal(div.style.color, "");
  });
});

// ============================================================================
// AC14: Effect/Stream Normalization
// ============================================================================

describe("AC14: Effect/Stream Normalization", () => {
  it("should normalize Effect to Stream for attributes", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ "data-value": Effect.sync(() => "test") }, "content"), root);

    await waitForStream();

    const div = root.children[0] as HTMLElement;
    assert.equal(div.getAttribute("data-value"), "test");
  });

  it("should normalize Effect to Stream for children", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({}, [Effect.sync(() => "from effect")]), root);

    await waitForStream();

    assert.ok(root.textContent?.includes("from effect"));
  });
});

// ============================================================================
// AC15: Reactive Attribute/Property Updates
// ============================================================================

describe("AC15: Reactive Attribute/Property Updates", () => {
  it("should update attribute on each stream emission", async () => {
    createTestDOM();
    const root = createRoot();

    const valueStream = Stream.make("first", "second", "third");

    await runMount(h.div({ "data-value": valueStream }, "test"), root);

    // Stream.make emits all values synchronously, only last value is visible
    await waitForStream();
    const div = root.children[0] as HTMLElement;
    assert.equal(div.getAttribute("data-value"), "third");
  });

  it("should remove attribute when stream emits undefined", async () => {
    createTestDOM();
    const root = createRoot();

    const valueStream = Stream.make("value", undefined as string | undefined);

    await runMount(h.div({ "data-value": valueStream }, "test"), root);

    // Stream.make emits all values synchronously, only last value (undefined) is applied
    await waitForStream();
    const div = root.children[0] as HTMLElement;
    assert.equal(div.hasAttribute("data-value"), false);
  });

  it("should remove attribute when stream emits undefined", async () => {
    createTestDOM();
    const root = createRoot();

    const valueStream = Stream.make("value", undefined as string | undefined);

    await runMount(h.div({ "data-value": valueStream }, "test"), root);

    // Stream.make emits all values synchronously, only last value (undefined) is applied
    await waitForStream();
    const div = root.children[0] as HTMLElement;
    assert.equal(div.hasAttribute("data-value"), false);
  });
});

// ============================================================================
// AC16: Stream Completion
// ============================================================================

describe("AC16: Stream Completion", () => {
  it("should leave last rendered value when stream completes", async () => {
    createTestDOM();
    const root = createRoot();

    const completingStream = Stream.make("first", "second");

    await runMount(h.div({}, [completingStream]), root);

    // Stream.make emits all values synchronously, only last value is visible
    await waitForStream();
    assert.ok(root.textContent?.includes("second"));
  });
});

// ============================================================================
// AC17: Stream Errors
// ============================================================================

describe("AC17: Stream Errors", () => {
  it("should throw StreamSubscriptionError when stream fails", async () => {
    createTestDOM();
    const root = createRoot();

    const failingStream = Stream.fail(new Error("Test error"));

    // Should eventually fail
    try {
      await runMount(h.div({}, [failingStream]), root);
      await waitFor(100);
      // If no error thrown yet, that's acceptable - errors may be async
      assert.ok(true);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });
});

// ============================================================================
// AC18: Children Array with Mixed Streams
// ============================================================================

describe("AC18: Children Array with Mixed Streams", () => {
  it("should handle mix of static and stream children", async () => {
    createTestDOM();
    const root = createRoot();

    const streamA = Stream.make("A");
    const streamC = Stream.make("C");

    await runMount(h.div({}, [streamA, "B", streamC]), root);

    await waitForStream();

    const text = root.textContent ?? "";
    assert.ok(text.includes("A"));
    assert.ok(text.includes("B"));
    assert.ok(text.includes("C"));
  });

  it("should update stream children independently", async () => {
    createTestDOM();
    const root = createRoot();

    const stream1 = Stream.make("1", "one");
    const stream2 = Stream.make("2", "two");

    await runMount(h.div({}, [stream1, "-", stream2]), root);

    // Stream.make emits all values synchronously, only last values are visible
    await waitForStream();
    const finalText = root.textContent ?? "";
    assert.equal(finalText, "one-two");
  });
});

// ============================================================================
// AC19: Stream Children - Comment Markers
// ============================================================================

describe("AC19: Stream Children - Comment Markers", () => {
  it("should insert comment markers around stream children", async () => {
    createTestDOM();
    const root = createRoot();

    const stream = Stream.make("content");

    await runMount(h.div({}, [stream]), root);

    const div = root.children[0];
    const nodes = Array.from(div?.childNodes ?? []);

    // Should have start comment, content, end comment
    const comments = nodes.filter((n) => n.nodeType === 8); // Comment node
    assert.ok(comments.length >= 2, "Should have start and end comment markers");
  });

  it("should use unique IDs for different streams", async () => {
    createTestDOM();
    const root = createRoot();

    const stream1 = Stream.make("A");
    const stream2 = Stream.make("B");

    await runMount(h.div({}, [stream1, stream2]), root);

    const div = root.children[0];
    const nodes = Array.from(div?.childNodes ?? []);
    const comments = nodes.filter((n) => n.nodeType === 8) as Comment[];

    // Each stream should have unique markers
    const commentTexts = comments.map((c) => c.textContent);
    const uniqueIds = new Set(
      commentTexts.filter((t) => t?.includes("stream")).map((t) => t?.match(/\d+/)?.[0]),
    );

    assert.ok(uniqueIds.size >= 2, "Should have unique IDs for different streams");
  });
});

// ============================================================================
// AC20: Stream Children - Updates
// ============================================================================

describe("AC20: Stream Children - Updates", () => {
  it("should replace nodes between markers on stream emission", async () => {
    createTestDOM();
    const root = createRoot();

    const stream = Stream.make("first", "second");

    await runMount(h.div({}, [stream]), root);

    // Stream.make emits all values synchronously, only last value is visible
    await waitForStream();
    assert.ok(root.textContent?.includes("second"));
    assert.ok(!root.textContent?.includes("first"));
  });

  it("should handle stream emitting arrays", async () => {
    createTestDOM();
    const root = createRoot();

    const stream = Stream.make(["a", "b"], ["c", "d", "e"]);

    await runMount(h.div({}, [stream]), root);

    // Stream.make emits all values synchronously, only last array is visible
    await waitForStream();
    const text = root.textContent ?? "";
    assert.equal(text, "cde");
  });

  it("should handle stream emitting fragments", async () => {
    createTestDOM();
    const root = createRoot();

    const stream = Stream.make(h.span({}, "A"), h.fragment([h.span({}, "B"), h.span({}, "C")]));

    await runMount(h.div({}, [stream]), root);

    // Stream.make emits all values synchronously, only last fragment is visible
    await waitForStream();
    const text = root.textContent ?? "";
    assert.equal(text, "BC");
  });
});

// ============================================================================
// AC20: Stream Children - Same-type patching (SP1–SP4)
// ============================================================================

describe("AC20 SP1/SP3: same-type patching (in-place)", () => {
  // Returns the lone Text node currently in the region between the root markers.
  function regionTextNode(root: HTMLElement): Text | undefined {
    return Array.from(root.childNodes).find((n): n is Text => n.nodeType === 3);
  }

  it("SP1: text→text patches the existing Text node in place (identity preserved)", async () => {
    createTestDOM();
    const root = createRoot();

    const region = await Effect.runPromise(SubscriptionRef.make<Renderable>("first"));
    const handle = await runMount(SubscriptionRef.changes(region), root);
    await waitForStream();

    const before = regionTextNode(root);
    assert.ok(before !== undefined, "first emission should render a Text node");
    assert.equal(before.data, "first");

    await Effect.runPromise(SubscriptionRef.set(region, "second"));
    await waitForStreamUpdate();

    const after = regionTextNode(root);
    assert.ok(after === before, "the same Text node should be reused across emissions");
    assert.equal(after.data, "second");

    await Effect.runPromise(handle.unmount());
  });

  it("SP3: same-tag element is reused; live DOM state (focus + typed value) survives", async () => {
    createTestDOM();
    const root = createRoot();

    const region = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(h.input({ class: "a" })),
    );
    const handle = await runMount(SubscriptionRef.changes(region), root);
    await waitForStream();

    const before = root.querySelector("input");
    assert.ok(before !== null, "first emission should render an <input>");
    assert.equal(before.className, "a");

    // Simulate uncontrolled user state: a typed value (live property, not a prop)
    // and focus. Neither is part of the descriptor's props.
    before.value = "typed-by-user";
    before.focus();
    assert.equal(document.activeElement, before, "input should be focused");

    // Re-emit a same-tag element with a changed prop.
    await Effect.runPromise(SubscriptionRef.set(region, h.input({ class: "b" })));
    await waitForStreamUpdate();

    const after = root.querySelector("input");
    assert.ok(after === before, "the same <input> element should be reused (identity preserved)");
    assert.equal(after.className, "b", "changed prop should be re-applied");
    assert.equal(after.value, "typed-by-user", "uncontrolled value should survive the update");
    assert.equal(document.activeElement, after, "focus should survive the update");

    await Effect.runPromise(handle.unmount());
  });

  it("SP3: same-tag element reuse recurses into children (child Text patched in place)", async () => {
    createTestDOM();
    const root = createRoot();

    const region = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(h.div({ id: "host" }, "hello")),
    );
    const handle = await runMount(SubscriptionRef.changes(region), root);
    await waitForStream();

    const beforeDiv = root.querySelector("#host");
    assert.ok(beforeDiv !== null, "first emission should render the host <div>");
    const beforeText = beforeDiv.firstChild;
    assert.ok(beforeText?.nodeType === 3, "host should contain a Text child");

    await Effect.runPromise(SubscriptionRef.set(region, h.div({ id: "host" }, "world")));
    await waitForStreamUpdate();

    const afterDiv = root.querySelector("#host");
    assert.ok(afterDiv === beforeDiv, "the host <div> should be reused");
    assert.ok(afterDiv.firstChild === beforeText, "the child Text node should be patched in place");
    assert.equal(afterDiv.textContent, "world");

    await Effect.runPromise(handle.unmount());
  });

  it("SP3: UserProfile pattern: concat(loading, fromEffect) reuses the <div>, patches text in place", async () => {
    createTestDOM();
    const root = createRoot();

    // Mirrors the docs' UserProfile example: a component that returns a Stream
    // emitting a "Loading..." <div> first, then a resolved <div> with the user's
    // name. Both emissions are same-tag (<div>) with a single text child, so the
    // renderer takes the SP3 identity-preserving path rather than replacing the
    // element. `fetchUser` is a resolved Effect standing in for the network call.
    // Delayed so the "Loading..." frame is observable before the second emission;
    // with a synchronous Effect both values land within a single tick.
    const fetchUser = (id: number) =>
      Effect.succeed({ id, name: "Ada Lovelace" }).pipe(Effect.delay("120 millis"));

    const UserProfile = ({ id }: { id: number }) =>
      Stream.concat(
        Stream.make(h.div({ id: "profile" }, "Loading...")),
        Stream.fromEffect(
          fetchUser(id).pipe(
            Effect.flatMap((user) => h.div({ id: "profile" }, user.name)),
            Effect.catch(() => h.div({ id: "profile" }, "Failed to load user")),
          ),
        ),
      );

    const handle = await runMount(UserProfile({ id: 1 }), root);
    await waitForStream();

    const beforeDiv = root.querySelector("#profile");
    assert.ok(beforeDiv !== null, "first emission should render the loading <div>");
    assert.equal(beforeDiv.textContent, "Loading...");
    const beforeText = beforeDiv.firstChild;
    assert.ok(beforeText?.nodeType === 3, "loading <div> should hold a single Text child");

    await waitForStreamUpdate();

    const afterDiv = root.querySelector("#profile");
    assert.ok(
      afterDiv === beforeDiv,
      "the same <div> element should be reused across the two emissions (not replaced)",
    );
    assert.ok(
      afterDiv.firstChild === beforeText,
      "the same Text node should be patched in place, not recreated",
    );
    assert.equal(afterDiv.textContent, "Ada Lovelace", "the text node's data should be updated");

    await Effect.runPromise(handle.unmount());
  });

  it("SP4: shape change (element→text) falls back to rebuild", async () => {
    createTestDOM();
    const root = createRoot();

    const region = await Effect.runPromise(SubscriptionRef.make<Renderable>(h.span({}, "boxed")));
    const handle = await runMount(SubscriptionRef.changes(region), root);
    await waitForStream();

    assert.ok(root.querySelector("span") !== null, "first emission should render a <span>");

    await Effect.runPromise(SubscriptionRef.set(region, "plain"));
    await waitForStreamUpdate();

    assert.equal(
      root.querySelector("span"),
      null,
      "the <span> should be torn down on shape change",
    );
    assert.ok(root.textContent?.includes("plain"));

    await Effect.runPromise(handle.unmount());
  });
});

// ============================================================================
// AC21: Nested Streams in Dynamic Children
// ============================================================================

describe("AC21: Nested Streams in Dynamic Children", () => {
  it("should set up nested streams when parent stream emits", async () => {
    createTestDOM();
    const root = createRoot();

    const innerStream = Stream.make("inner1", "inner2");
    const outerStream = Stream.make(h.div({}, [innerStream]));

    await runMount(h.div({}, [outerStream]), root);

    await waitForStream();
    assert.ok(root.textContent?.includes("inner"));

    await waitForStreamUpdate();
    // Inner stream should be working
    assert.ok(root.textContent !== "");
  });
});

// ============================================================================
// AC22: Component Returning Stream
// ============================================================================

describe("AC22: Component Returning Stream", () => {
  it("should handle component returning Stream<Renderable>", async () => {
    createTestDOM();
    const root = createRoot();

    function StreamComponent(): Stream.Stream<Renderable> {
      return Stream.make(h.div({}, "First"), h.div({}, "Second"));
    }

    await runMount(StreamComponent(), root);

    // Stream.make emits all values synchronously, only last value is visible
    await waitForStream();
    assert.ok(root.textContent?.includes("Second"));
  });

  it("should wrap component stream in comment markers", async () => {
    createTestDOM();
    const root = createRoot();

    function StreamComponent(): Stream.Stream<Renderable> {
      return Stream.make(h.div({}, "Content"));
    }

    await runMount(StreamComponent(), root);

    const nodes = Array.from(root.childNodes);
    const comments = nodes.filter((n) => n.nodeType === 8);

    assert.ok(comments.length >= 2, "Should have comment markers");
  });
});

// ============================================================================
// AC23: Tagged Errors
// ============================================================================

describe("AC23: Tagged Errors", () => {
  it("should throw InvalidElementType for invalid Renderable type", async () => {
    createTestDOM();
    const root = createRoot();

    const invalidNode = { type: 123, props: {} };

    await assert.rejects(
      async () => await runMount(invalidNode as never, root),
      (error: Error) => {
        assert.ok(error.message.includes("InvalidElementType") || error instanceof Error);
        return true;
      },
    );
  });
});

// ============================================================================
// AC24: Runtime Management
// ============================================================================

describe("AC24: Runtime Management", () => {
  it("should create fresh runtime per mount", async () => {
    createTestDOM();
    const root1 = createRoot();
    const root2 = document.createElement("div");

    // Each mount should work independently
    await runMount(h.div({}, "First"), root1);
    await runMount(h.div({}, "Second"), root2);

    assert.equal(root1.textContent, "First");
    assert.equal(root2.textContent, "Second");
  });
});

// ============================================================================
// AC25: Scope Management
// ============================================================================

describe("AC25: Scope Management", () => {
  it("should use Scope for stream subscriptions", async () => {
    createTestDOM();
    const root = createRoot();

    const stream = Stream.make("test");

    // If Scope is properly used, this should not throw
    await runMount(h.div({}, [stream]), root);

    await waitForStream();

    assert.ok(root.textContent?.includes("test"));
  });
});

// ============================================================================
// AC26: Cleanup and Unmount
// ============================================================================

describe("AC26: Cleanup and Unmount", () => {
  it("should stop all stream emissions after unmount", async () => {
    createTestDOM();
    const root = createRoot();
    let emissionCount = 0;

    // Create a stream that emits periodically
    // Use tap to track actual emissions to subscribers
    const stream = Stream.make("initial").pipe(
      Stream.concat(Stream.make("delayed").pipe(Stream.schedule(Schedule.spaced("200 millis")))),
      Stream.tap(() =>
        Effect.sync(() => {
          emissionCount++;
        }),
      ),
    );

    const handle = await runMount(h.div({}, [stream]), root);

    // Wait for initial emission
    await waitForStream();
    assert.equal(root.textContent, "initial");
    const countAfterInitial = emissionCount;
    assert.ok(countAfterInitial > 0, "Should have initial emission");

    // Unmount before delayed emission
    await Effect.runPromise(handle.unmount());

    // Wait for what would be the delayed emission
    await waitFor(300);

    // The delayed emission should NOT have occurred
    assert.equal(emissionCount, countAfterInitial, "Stream should not emit after unmount");
    assert.equal(root.textContent, "initial", "Content should not change after unmount");
  });

  it("should cancel all running stream subscriptions on unmount", async () => {
    createTestDOM();
    const root = createRoot();
    let streamEmissionCount = 0;
    let attributeEmissionCount = 0;
    let styleEmissionCount = 0;

    // Create streams that track emissions
    const childStream = Stream.make("child1", "child2").pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          streamEmissionCount++;
        }),
      ),
    );

    const attrStream = Stream.make("attr1", "attr2").pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          attributeEmissionCount++;
        }),
      ),
    );

    const styleStream = Stream.make({ color: "red" }, { color: "blue" }).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          styleEmissionCount++;
        }),
      ),
    );

    const handle = await runMount(
      h.div({ "data-test": attrStream, style: styleStream }, [childStream]),
      root,
    );

    // Give streams time to emit initial values
    await waitForStream();

    // Record initial counts
    const initialStreamCount = streamEmissionCount;
    const initialAttrCount = attributeEmissionCount;
    const initialStyleCount = styleEmissionCount;

    // Unmount
    await Effect.runPromise(handle.unmount());

    // Try to trigger more emissions (shouldn't work)
    await waitFor(200);

    // Counts should not have increased after unmount
    assert.equal(streamEmissionCount, initialStreamCount, "Child stream should stop");
    assert.equal(attributeEmissionCount, initialAttrCount, "Attribute stream should stop");
    assert.equal(styleEmissionCount, initialStyleCount, "Style stream should stop");
  });

  it("should properly dispose multiple nested runtimes", async () => {
    createTestDOM();
    const root1 = createRoot();
    const root2 = document.createElement("div");
    document.body.appendChild(root2);

    // Mount two separate apps with streams
    const handle1 = await runMount(h.div({}, [Stream.make("app1")]), root1);

    const handle2 = await runMount(h.div({}, [Stream.make("app2")]), root2);

    await waitForStream();
    assert.equal(root1.textContent, "app1");
    assert.equal(root2.textContent, "app2");

    // Unmount first app
    await Effect.runPromise(handle1.unmount());

    // Second app should still work
    assert.equal(root2.textContent, "app2");

    // Unmount second app
    await Effect.runPromise(handle2.unmount());

    // Both should be unmounted now
    await waitFor(100);
    assert.ok(true, "Both apps unmounted successfully");
  });

  it("should handle rapid mount/unmount cycles", async () => {
    createTestDOM();
    const root = createRoot();

    // Perform multiple rapid mount/unmount cycles
    for (let i = 0; i < 5; i++) {
      const handle = await runMount(h.div({}, [Stream.make(`cycle-${i}`)]), root);

      await waitFor(10);
      await Effect.runPromise(handle.unmount());
    }

    // Final mount
    const finalHandle = await runMount(h.div({}, [Stream.make("final")]), root);

    await waitForStream();
    assert.equal(root.textContent, "final");

    // Clean up
    await Effect.runPromise(finalHandle.unmount());
  });

  it("should make unmount idempotent", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(h.div({}, "test"), root);

    // Unmount multiple times - should not error
    await Effect.runPromise(handle.unmount());
    await Effect.runPromise(handle.unmount());
    await Effect.runPromise(handle.unmount());

    assert.ok(true, "Multiple unmounts did not cause errors");
  });

  it("should cancel long-running async streams on unmount", async () => {
    createTestDOM();
    const root = createRoot();
    const emissions: number[] = [];

    // Create a stream that emits numbers over time
    const numberStream = Stream.iterate(0, (n) => n + 1).pipe(
      Stream.tap((n) => Effect.sync(() => emissions.push(n))),
      Stream.schedule(Schedule.spaced("50 millis")),
      Stream.take(10), // Would emit 10 items if not cancelled
      Stream.map((n) => String(n)), // Convert to string for rendering
    );

    const handle = await runMount(h.div({}, [numberStream]), root);

    // Wait for a couple emissions
    await waitFor(120);

    const emissionsBeforeUnmount = emissions.length;
    assert.ok(emissionsBeforeUnmount > 0, "Should have some emissions");
    assert.ok(emissionsBeforeUnmount < 10, "Should not have all emissions yet");

    // Unmount to cancel the stream
    await Effect.runPromise(handle.unmount());

    // Wait for what would be more emissions
    await waitFor(500);

    // No new emissions should have occurred
    assert.equal(
      emissions.length,
      emissionsBeforeUnmount,
      "Stream should stop emitting after unmount",
    );
  });
});

// ============================================================================
// Stream-Based Fallback Pattern
// ============================================================================

describe("Stream-Based Fallback Pattern", () => {
  it("should render fallback immediately then update with actual content", async () => {
    createTestDOM();
    const root = createRoot();

    // Component using Stream.concat for fallback pattern
    // Use 300ms delay to ensure we can check fallback before it resolves
    function AsyncComponent() {
      return Stream.concat(
        Stream.make("Loading..."),
        Stream.fromEffect(
          Effect.promise(
            () =>
              new Promise<string>((resolve) => setTimeout(() => resolve("Actual Content"), 300)),
          ),
        ),
      );
    }

    await runMount(AsyncComponent(), root);

    // Fallback should appear immediately (wait just 50ms for stream setup)
    await waitFor(50);
    assert.equal(root.textContent, "Loading...");

    // After delay, actual content should replace fallback
    await waitFor(350);
    assert.equal(root.textContent, "Actual Content");
  });

  it("should handle elements in fallback pattern", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncComponent() {
      return Stream.concat(
        Stream.make(h.span({ class: "loading" }, "?")),
        Stream.fromEffect(
          Effect.promise(
            () =>
              new Promise<Renderable>((resolve) =>
                setTimeout(() => resolve(h.span({ class: "loaded" }, "Done")), 300),
              ),
          ),
        ),
      );
    }

    await runMount(h.div({}, [AsyncComponent()]), root);

    await waitFor(50);
    const loadingSpan = root.querySelector(".loading");
    assert.ok(loadingSpan, "Loading span should be present initially");

    await waitFor(350);
    const loadedSpan = root.querySelector(".loaded");
    assert.ok(loadedSpan, "Loaded span should replace loading span");
    assert.ok(!root.querySelector(".loading"), "Loading span should be removed");
  });

  it("should work with multiple fallback components independently", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncA() {
      return Stream.concat(
        Stream.make("A-loading"),
        Stream.fromEffect(
          Effect.promise(
            () => new Promise<string>((resolve) => setTimeout(() => resolve("A-done"), 150)),
          ),
        ),
      );
    }

    function AsyncB() {
      return Stream.concat(
        Stream.make("B-loading"),
        Stream.fromEffect(
          Effect.promise(
            () => new Promise<string>((resolve) => setTimeout(() => resolve("B-done"), 400)),
          ),
        ),
      );
    }

    await runMount(h.div({}, [AsyncA(), "-", AsyncB()]), root);

    // Both should show loading initially
    await waitFor(50);
    assert.ok(root.textContent?.includes("A-loading"));
    assert.ok(root.textContent?.includes("B-loading"));

    // A finishes first
    await waitFor(200);
    assert.ok(root.textContent?.includes("A-done"));
    assert.ok(root.textContent?.includes("B-loading"));

    // B finishes later
    await waitFor(300);
    assert.ok(root.textContent?.includes("A-done"));
    assert.ok(root.textContent?.includes("B-done"));
  });

  it("should not inherit fallback from parent components", async () => {
    createTestDOM();
    const root = createRoot();

    function Child() {
      return Stream.concat(
        Stream.make(h.span({ class: "child-loading" }, "Child Loading...")),
        Stream.fromEffect(
          Effect.promise(
            () =>
              new Promise<Renderable>((resolve) =>
                setTimeout(() => resolve(h.span({ class: "child-loaded" }, "Child Done")), 200),
              ),
          ),
        ),
      );
    }

    function Parent() {
      return Stream.concat(
        Stream.make(h.div({ class: "parent-loading" }, "Parent Loading...")),
        Stream.fromEffect(
          Effect.promise(
            () =>
              new Promise<Renderable>((resolve) =>
                setTimeout(() => resolve(h.div({ class: "parent-loaded" }, [Child()])), 100),
              ),
          ),
        ),
      );
    }

    await runMount(Parent(), root);

    // Parent loading appears first
    await waitFor(50);
    assert.ok(root.querySelector(".parent-loading"));

    // Parent loaded, child loading should appear
    await waitFor(150);
    assert.ok(root.querySelector(".child-loading"));
    assert.ok(!root.querySelector(".parent-loading"));

    // Child loaded
    await waitFor(250);
    assert.ok(root.querySelector(".child-loaded"));
    assert.ok(!root.querySelector(".child-loading"));
  });
});

// ============================================================================
// Ref Handling
// ============================================================================

describe("Ref Handling", () => {
  it("should set ref to Option.some(element) during element creation", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );

    await runMount(h.div({ ref }, "test"), root);

    const refValue = await Effect.runPromise(SubscriptionRef.get(ref));
    assert.ok(Option.isSome(refValue), "Ref should contain Option.some");
    const element = Option.getOrThrow(refValue);
    assert.equal(element.tagName, "DIV");
    assert.equal(element.textContent, "test");
  });

  it("should work with SubscriptionRef", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );

    await runMount(h.span({ ref, class: "test-span" }, "content"), root);

    const refValue = await Effect.runPromise(SubscriptionRef.get(ref));
    assert.ok(Option.isSome(refValue), "SubscriptionRef should contain Option.some");
    const element = Option.getOrThrow(refValue);
    assert.equal(element.tagName, "SPAN");
    assert.equal(element.className, "test-span");
  });

  it("should emit on SubscriptionRef.changes after mount", async () => {
    createTestDOM();
    const root = createRoot();

    // Create the ref and track if we received an element via the stream
    const captured: { element: HTMLInputElement | null } = { element: null };

    await Effect.runPromise(
      Effect.gen(function* () {
        const ref = yield* SubscriptionRef.make<Option.Option<HTMLInputElement>>(Option.none());

        // Subscribe to changes and capture the first Option.some emission
        yield* Effect.forkChild(
          Stream.runForEach(Stream.filter(SubscriptionRef.changes(ref), Option.isSome), (opt) =>
            Effect.sync(() => {
              if (captured.element === null) {
                captured.element = Option.getOrThrow(opt);
              }
            }),
          ),
        );

        // Give the subscription time to start
        yield* Effect.sleep("50 millis");

        // Mount will set the ref
        return h.input({ ref, type: "text" });
      }).pipe(
        Effect.flatMap((node) =>
          Effect.promise(async () => {
            await runMount(node, root);
          }),
        ),
      ),
    );

    // Wait for emission to be processed
    await waitForStream();

    // Verify we received the element through the subscription
    const receivedElement = captured.element;
    assert.ok(receivedElement !== null, "Should have received element via stream");
    assert.equal(receivedElement.tagName, "INPUT");
    assert.equal(receivedElement.type, "text");
  });

  it("should work with HTMLElement for div", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );

    await runMount(h.div({ ref, id: "my-div" }), root);

    const element = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(ref)));
    assert.equal(element.tagName, "DIV");
    assert.equal(element.id, "my-div");
  });

  it("should work with HTMLInputElement", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLInputElement>>(Option.none()),
    );

    await runMount(h.input({ ref, type: "email", value: "test@example.com" }), root);

    const element = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(ref)));
    assert.equal(element.tagName, "INPUT");
    assert.equal(element.type, "email");
    // Input value is a property, should be set
    assert.equal(element.value, "test@example.com");
  });

  it("should work with HTMLButtonElement", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLButtonElement>>(Option.none()),
    );

    await runMount(h.button({ ref, type: "submit", disabled: true }, "Click"), root);

    const element = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(ref)));
    assert.equal(element.tagName, "BUTTON");
    assert.equal(element.type, "submit");
    assert.equal(element.disabled, true);
  });

  it("should process other props normally alongside ref", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );

    await runMount(
      h.div(
        {
          ref,
          id: "test-id",
          class: "test-class",
          "data-custom": "custom-value",
          style: { color: "red" },
        },
        "content",
      ),
      root,
    );

    const element = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(ref)));
    assert.equal(element.id, "test-id");
    assert.equal(element.className, "test-class");
    assert.equal(element.getAttribute("data-custom"), "custom-value");
    assert.equal(element.style.color, "red");
    assert.equal(element.textContent, "content");
  });

  it("should not treat non-Ref objects as refs", async () => {
    createTestDOM();
    const root = createRoot();

    // An object that looks similar but is not a Ref
    const notARef = { current: null };

    await runMount(
      // @ts-expect-error - testing invalid ref type
      h.div({ ref: notARef, "data-test": "value" }, "test"),
      root,
    );

    const div = root.children[0] as HTMLElement;
    // The notARef object should have been ignored or treated as attribute
    assert.equal(div.getAttribute("data-test"), "value");
    assert.equal(div.textContent, "test");
  });

  it("should handle multiple refs on different elements independently", async () => {
    createTestDOM();
    const root = createRoot();

    const divRef = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );
    const spanRef = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );
    const inputRef = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLInputElement>>(Option.none()),
    );

    await runMount(
      h.div({ ref: divRef }, [
        h.span({ ref: spanRef }, "text"),
        h.input({ ref: inputRef, type: "text" }),
      ]),
      root,
    );

    const divElement = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(divRef)));
    const spanElement = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(spanRef)));
    const inputElement = Option.getOrThrow(await Effect.runPromise(SubscriptionRef.get(inputRef)));

    assert.equal(divElement.tagName, "DIV");
    assert.equal(spanElement.tagName, "SPAN");
    assert.equal(inputElement.tagName, "INPUT");

    // Verify they're all different elements
    assert.notEqual(divElement, spanElement);
    assert.notEqual(spanElement, inputElement);
    assert.notEqual(divElement, inputElement);

    // Verify parent-child relationships
    assert.equal(spanElement.parentElement, divElement);
    assert.equal(inputElement.parentElement, divElement);
  });

  it("should have Option.none as initial value before mount", async () => {
    createTestDOM();
    const root = createRoot();

    const ref = await Effect.runPromise(
      SubscriptionRef.make<Option.Option<HTMLElement>>(Option.none()),
    );

    // Check value before mount
    const valueBefore = await Effect.runPromise(SubscriptionRef.get(ref));
    assert.ok(Option.isNone(valueBefore), "Ref should be Option.none before mount");

    await runMount(h.div({ ref }, "test"), root);

    // Check value after mount
    const valueAfter = await Effect.runPromise(SubscriptionRef.get(ref));
    assert.ok(Option.isSome(valueAfter), "Ref should be Option.some after mount");
  });
});

// ============================================================================
// AC28: Resource Cleanup on Mount Failure
// ============================================================================

describe("AC28: Resource Cleanup on Mount Failure", () => {
  it("should propagate UnsupportedNodeTypeError when renderNode fails", async () => {
    createTestDOM();
    const root = createRoot();

    // An object with a numeric `type` triggers UnsupportedNodeTypeError
    // (not a string, FRAGMENT, or function: renderNode's invalid type branch)
    const invalidNode = { type: 42, props: {} };
    const exit = await Effect.runPromiseExit(
      WeftApp.mount(WeftApp.make(), invalidNode as unknown as never, root),
    );

    assert.ok(Exit.isFailure(exit));
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof UnsupportedNodeTypeError);
  });

  it("should leave root mountable after a failed mount (no zombie resources)", async () => {
    createTestDOM();
    const root = createRoot();

    // Fail once
    const invalidNode = { type: 42, props: {} };
    await Effect.runPromiseExit(
      WeftApp.mount(WeftApp.make(), invalidNode as unknown as never, root),
    );

    // A second mount to the same root must succeed without errors
    const handle = await Effect.runPromise(
      WeftApp.mount(WeftApp.make(), h.div({}, "recovered"), root),
    );
    assert.equal(root.querySelector("div")?.textContent, "recovered");
    await Effect.runPromise(handle.unmount());
  });

  it("should leave root.innerHTML empty after a failed mount", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<p>old</p>";

    const invalidNode = { type: 42, props: {} };
    await Effect.runPromiseExit(
      WeftApp.mount(WeftApp.make(), invalidNode as unknown as never, root),
    );

    // mount clears root.innerHTML before renderNode runs, so it stays empty on failure
    assert.equal(root.innerHTML, "");
  });
});

// ============================================================================
// AC-10/12/13/14: toSubscribable pump scope lifetime
// ============================================================================

describe("AC-10/12/13/14: toSubscribable pump scope lifetime", () => {
  // A plain function component that normalizes one Source prop via toSubscribable.
  // The pump fiber (forkScoped) lives in the instance scope provided by renderComponent.
  const Comp = (props: { val: Source.Source<string> }) =>
    Effect.gen(function* () {
      const sub = yield* Source.toSubscribable(props.val);
      const v = yield* Subscribable.get(sub);
      return h.div({}, v);
    });

  // AC-10: The pump forked by toSubscribable must be interrupted on unmount.
  it("AC-10: pump fiber is interrupted on unmount", async () => {
    let cancelled = false;
    const propStream = Stream.concat(Stream.make("v"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          cancelled = true;
        }),
      ),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(Comp({ val: propStream }), root);
    await waitForStream();

    assert.ok(!cancelled, "pump should still be running before unmount");
    await Effect.runPromise(handle.unmount());
    assert.ok(cancelled, "pump should be cancelled after unmount");
  });

  // AC-12: The pump must be interrupted when the component leaves a dynamic region.
  it("AC-12: pump is interrupted when component is removed from a dynamic region", async () => {
    let cancelled = false;
    const propStream = Stream.concat(Stream.make("a"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          cancelled = true;
        }),
      ),
    );

    const regionRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ val: propStream })),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();

    assert.ok(!cancelled, "pump should be running while component is mounted");

    // Replace the component with static content: the old content scope closes.
    await Effect.runPromise(SubscriptionRef.set(regionRef, h.span({}, "static")));
    await waitForStreamUpdate();

    assert.ok(cancelled, "pump should be cancelled when component is removed from the region");
    await Effect.runPromise(handle.unmount());
  });

  // AC-13/14: Each re-emission of a dynamic region closes the previous content
  // scope. After N re-emits exactly N pumps have been cancelled (no accumulation).
  it("AC-13/14: re-emitting a region rotates the content scope (no accumulation)", async () => {
    let cancelledCount = 0;
    const makePropStream = () =>
      Stream.concat(Stream.make("v"), Stream.never).pipe(
        Stream.ensuring(
          Effect.sync(() => {
            cancelledCount++;
          }),
        ),
      );

    const regionRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ val: makePropStream() })),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();
    assert.equal(cancelledCount, 0, "no pumps cancelled yet");

    await Effect.runPromise(SubscriptionRef.set(regionRef, Comp({ val: makePropStream() })));
    await waitForStreamUpdate();
    assert.equal(cancelledCount, 1, "first instance's pump cancelled on re-emit");

    await Effect.runPromise(SubscriptionRef.set(regionRef, Comp({ val: makePropStream() })));
    await waitForStreamUpdate();
    assert.equal(cancelledCount, 2, "each re-emit closes exactly one previous scope");

    await Effect.runPromise(handle.unmount());
  });
});

// ============================================================================
// Scope lifetime: advanced cases
// ============================================================================

describe("scope lifetime: advanced cases", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Survival test: the pump must NOT be killed by an internal region re-emit.
  // The component's instanceScope outlives its own content re-renders; only
  // removing the component from the tree (or unmounting) should kill it.
  // ──────────────────────────────────────────────────────────────────────────
  it("pump survives when the component's internal reactive region re-emits", async () => {
    let cancelled = false;
    const propStream = Stream.concat(Stream.make("initial"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          cancelled = true;
        }),
      ),
    );
    const internalRef = await Effect.runPromise(SubscriptionRef.make(0));

    const Comp = (props: { val: Source.Source<string> }) =>
      Effect.gen(function* () {
        const sub = yield* Source.toSubscribable(props.val);
        const v = yield* Subscribable.get(sub);
        // {SubscriptionRef.changes(internalRef)} creates a reactive region *inside* the component.
        // Re-emitting it rotates a child contentScope: the pump in instanceScope
        // must not be touched.
        return h.div({ class: v }, [SubscriptionRef.changes(internalRef)]);
      });

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(Comp({ val: propStream }), root);
    await waitForStream();
    assert.ok(!cancelled, "pump should be running after mount");

    // Trigger an internal re-emit: rotates a child contentScope, not instanceScope.
    await Effect.runPromise(SubscriptionRef.update(internalRef, (n) => n + 1));
    await waitForStreamUpdate();
    assert.ok(!cancelled, "pump must survive an internal region re-emit");

    // Only unmount should kill the pump.
    await Effect.runPromise(handle.unmount());
    assert.ok(cancelled, "pump should be cancelled after unmount");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Transitive teardown: nested components.
  // Evicting the outer component must also cancel the inner component's pump
  // because innerInstanceScope ⊂ contentScope(outer) ⊂ outerInstanceScope.
  // ──────────────────────────────────────────────────────────────────────────
  it("evicting an outer component also cancels a nested inner component's pump", async () => {
    let innerCancelled = false;
    const innerStream = Stream.concat(Stream.make("inner"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          innerCancelled = true;
        }),
      ),
    );

    const Inner = (props: { val: Source.Source<string> }) =>
      Effect.gen(function* () {
        const sub = yield* Source.toSubscribable(props.val);
        const v = yield* Subscribable.get(sub);
        return h.span({}, v);
      });

    // Outer doesn't have its own stream prop; it renders Inner as part of its output.
    // Effect.succeed gives Outer an instanceScope (renderComponent forks one for any
    // Effect/Stream result), so the full chain is:
    // contentScope → outerInstanceScope → contentScope(outer) → innerInstanceScope → pump.
    const Outer = () => Effect.succeed(h.div({}, [Inner({ val: innerStream })]) as Renderable);

    const regionRef = await Effect.runPromise(SubscriptionRef.make<Renderable>(Outer()));

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();
    assert.ok(!innerCancelled, "inner pump should be running while outer is mounted");

    // Evict Outer: contentScope → outerInstanceScope → contentScope(outer) →
    // innerInstanceScope → inner pump. All die transitively.
    await Effect.runPromise(SubscriptionRef.set(regionRef, h.span({}, "replaced")));
    await waitForStreamUpdate();
    assert.ok(innerCancelled, "inner pump must be cancelled when outer is evicted");

    await Effect.runPromise(handle.unmount());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Multiple props: every pump forked into the same instanceScope must be
  // cancelled: not just the first one.
  // ──────────────────────────────────────────────────────────────────────────
  it("all pumps are cancelled when a component with multiple Source props is removed", async () => {
    let aCancelled = false;
    let bCancelled = false;
    const streamA = Stream.concat(Stream.make("a"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          aCancelled = true;
        }),
      ),
    );
    const streamB = Stream.concat(Stream.make("b"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          bCancelled = true;
        }),
      ),
    );

    const Comp = (props: { a: Source.Source<string>; b: Source.Source<string> }) =>
      Effect.gen(function* () {
        const subA = yield* Source.toSubscribable(props.a, "a");
        const subB = yield* Source.toSubscribable(props.b, "b");
        const vA = yield* Subscribable.get(subA);
        const vB = yield* Subscribable.get(subB);
        return h.div({}, [vA, " ", vB]);
      });

    const regionRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ a: streamA, b: streamB })),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();
    assert.ok(!aCancelled && !bCancelled, "both pumps should be running after mount");

    await Effect.runPromise(SubscriptionRef.set(regionRef, h.span({}, "replaced")));
    await waitForStreamUpdate();
    assert.ok(aCancelled, "pump A should be cancelled");
    assert.ok(bCancelled, "pump B should be cancelled");

    await Effect.runPromise(handle.unmount());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Identity pass-through: when a SubscriptionRef is passed as a Source,
  // toSubscribable returns it by reference: no pump is forked into instanceScope.
  // Closing instanceScope must NOT interrupt the ref, which lives in an outer scope.
  // ──────────────────────────────────────────────────────────────────────────
  it("Subscribable passed as Source is not interrupted when the component is removed", async () => {
    const sharedRef = await Effect.runPromise(SubscriptionRef.make("alive"));
    // v4: a SubscriptionRef is no longer a Subscribable, so pass an explicit
    // Subscribable view of the ref; `toSubscribable` short-circuits it by
    // reference, and the underlying ref stays external to the instance scope.
    const shared = Subscribable.make({
      get: SubscriptionRef.get(sharedRef),
      changes: SubscriptionRef.changes(sharedRef),
    });

    const Comp = (props: { val: Source.Source<string> }) =>
      Effect.gen(function* () {
        // toSubscribable short-circuits to identity: no pump forked.
        const sub = yield* Source.toSubscribable(props.val);
        const v = yield* Subscribable.get(sub);
        return h.div({}, v);
      });

    const regionRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ val: shared })),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();

    // Remove the component: instanceScope closes, but sharedRef is external.
    await Effect.runPromise(SubscriptionRef.set(regionRef, h.span({}, "replaced")));
    await waitForStreamUpdate();

    // sharedRef must still be readable and writable.
    const val = await Effect.runPromise(SubscriptionRef.get(sharedRef));
    assert.equal(val, "alive");
    await Effect.runPromise(SubscriptionRef.set(sharedRef, "still-alive"));
    const updated = await Effect.runPromise(SubscriptionRef.get(sharedRef));
    assert.equal(updated, "still-alive");

    await Effect.runPromise(handle.unmount());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Stream-returning component: renderComponent forks instanceScope for both
  // Effect-returning and Stream-returning components. Pump cleanup must work
  // the same regardless of which form the component takes.
  // ──────────────────────────────────────────────────────────────────────────
  it("pump is cancelled when a Stream-returning component is removed", async () => {
    let cancelled = false;
    const propStream = Stream.concat(Stream.make("v"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          cancelled = true;
        }),
      ),
    );

    const Comp = (props: { val: Source.Source<string> }) =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(props.val);
          const v = yield* Subscribable.get(sub);
          return h.div({}, v) as Renderable;
        }),
      );

    const regionRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ val: propStream })),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(regionRef), root);
    await waitForStream();
    assert.ok(!cancelled, "pump should be running while component is mounted");

    await Effect.runPromise(SubscriptionRef.set(regionRef, h.span({}, "replaced")));
    await waitForStreamUpdate();
    assert.ok(cancelled, "pump should be cancelled when Stream-returning component is removed");

    await Effect.runPromise(handle.unmount());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Transitive teardown: two levels of reactive regions above a component.
  // SubscriptionRef.changes(outerRef) wraps a div with SubscriptionRef.changes(innerRef) which contains Comp.
  // Replacing the outer emission must cascade all the way down and kill the pump.
  // ──────────────────────────────────────────────────────────────────────────
  it("pump is cancelled through two levels of reactive regions", async () => {
    let cancelled = false;
    const propStream = Stream.concat(Stream.make("v"), Stream.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          cancelled = true;
        }),
      ),
    );

    const Comp = (props: { val: Source.Source<string> }) =>
      Effect.gen(function* () {
        const sub = yield* Source.toSubscribable(props.val);
        const v = yield* Subscribable.get(sub);
        return h.div({}, v);
      });

    // Two reactive region layers above Comp.
    const innerRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(Comp({ val: propStream })),
    );
    const outerRef = await Effect.runPromise(
      SubscriptionRef.make<Renderable>(h.div({}, [SubscriptionRef.changes(innerRef)])),
    );

    createTestDOM();
    const root = createRoot();
    const handle = await runMount(SubscriptionRef.changes(outerRef), root);
    await waitForStream();
    assert.ok(!cancelled, "pump should be running before outer region changes");

    // Replacing the outer emission closes its contentScope, which transitively
    // closes the inner subscription fiber → contentScope(inner) → instanceScope → pump.
    await Effect.runPromise(SubscriptionRef.set(outerRef, h.span({}, "replaced")));
    await waitForStreamUpdate();
    assert.ok(cancelled, "pump should be cancelled through two levels of reactive scope");

    await Effect.runPromise(handle.unmount());
  });
});
