import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { ClientAssets } from "virtual:weft/assets";

/** The document shell: `ClientAssets()` supplies every script and stylesheet tag. */
export const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html({ lang: "en" }, [
    h.head([h.meta({ charset: "utf-8" }), h.title("Fixture"), ClientAssets()]),
    h.body([h.div({ id: "root" }, [app])]),
  ]);
});
