import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let container: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  // Dispose the app: root scope closes (unmount), then AtomRegistry.layer releases.
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
});

// The scoped `AtomRegistry.layer` is owned by the app runtime: built on first
// mount, alive across every interaction, released only at `WeftApp.dispose` —
// no scope/Deferred lifetime dance needed.
const mountApp = async () => {
  app = WeftApp.make(AtomRegistry.layer);
  await Effect.runPromise(WeftApp.mount(app, App(), container));
};

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("effect-atom example", () => {
  it("renders the counter atom and its derived double", async () => {
    await mountApp();
    await vi.waitFor(() => {
      expect(byTestId("count")?.textContent).toBe("0");
      expect(byTestId("double")?.textContent).toBe("0");
    });
  });

  it("updates the counter and derived atom on click", async () => {
    await mountApp();
    // Wait for the counter to render its initial value, not just for the button:
    // v4 atoms are lazy — an update fired before the first subscriber is live
    // (the `Atom.toStream` child) is not retained by the registry.
    await vi.waitFor(() => expect(byTestId("count")?.textContent).toBe("0"));

    byTestId("increment")?.click();
    await vi.waitFor(() => {
      expect(byTestId("count")?.textContent).toBe("1");
      expect(byTestId("double")?.textContent).toBe("2");
    });

    byTestId("decrement")?.click();
    await vi.waitFor(() => {
      expect(byTestId("count")?.textContent).toBe("0");
      expect(byTestId("double")?.textContent).toBe("0");
    });
  });

  it("renders the async atom through its AsyncResult states", async () => {
    await mountApp();
    await vi.waitFor(() => expect(byTestId("greeting")?.textContent).toBe("Loading…"));
    await vi.waitFor(() =>
      expect(byTestId("greeting")?.textContent).toBe("Hello from effect-atom"),
    );
  });

  it("re-runs the async atom on refresh", async () => {
    await mountApp();
    await vi.waitFor(() =>
      expect(byTestId("greeting")?.textContent).toBe("Hello from effect-atom"),
    );

    byTestId("reload")?.click();
    await vi.waitFor(() => expect(byTestId("greeting")?.textContent).toBe("Reloading…"));
    await vi.waitFor(() =>
      expect(byTestId("greeting")?.textContent).toBe("Hello from effect-atom"),
    );
  });

  // Issue #123: the previously-broken composition now works. The registry is
  // owned by the app runtime, so it stays alive across interactions (updates
  // keep flowing); after `WeftApp.dispose` the roots are unmounted and
  // post-dispose clicks no longer patch the DOM.
  it("keeps the registry alive across interactions, then stops after dispose", async () => {
    await mountApp();
    await vi.waitFor(() => expect(byTestId("count")?.textContent).toBe("0"));

    byTestId("increment")?.click();
    await vi.waitFor(() => expect(byTestId("count")?.textContent).toBe("1"));
    byTestId("increment")?.click();
    await vi.waitFor(() => expect(byTestId("count")?.textContent).toBe("2"));

    // Dispose: root scopes close (unmount), then the registry layer releases.
    await Effect.runPromise(WeftApp.dispose(app!));

    // Nodes remain (unmount does not clear the root) but the handler work is
    // interrupted, so a further click no longer updates the atom-driven DOM.
    const frozen = byTestId("count")?.textContent;
    expect(frozen).toBe("2");
    byTestId("increment")?.click();
    await wait(150);
    expect(byTestId("count")?.textContent).toBe(frozen);
  });
});
