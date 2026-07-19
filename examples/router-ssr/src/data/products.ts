/**
 * The shop's **isomorphic** product catalog.
 *
 * This module is imported by both server and client code (the listing grid, the
 * product cards, the detail page), so it deliberately contains **no Effect and no
 * server-only `ServerTag`**, only plain data and pure helpers. The slow-changing
 * product metadata (name, price, blurb) lives here and is safe to ship to the
 * browser; the **live** per-product stock lives behind a server-only service in
 * {@link file://./inventory.ts} and is loaded through a `Boundary.server`.
 */

import { Schema } from "effect";

/**
 * A catalog product. `priceCents` keeps money as an integer (no float drift);
 * render it with {@link formatPrice}. The `Schema` doubles as documentation and
 * could validate an external feed if the catalog ever moves off the module.
 */
export const Product = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  priceCents: Schema.Number,
  blurb: Schema.String,
  emoji: Schema.String,
});

/** Decoded product shape (what components receive). */
export type Product = typeof Product.Type;

/** The hardcoded catalog. Ordered by `id`, which is also the default sort. */
export const PRODUCTS: readonly Product[] = [
  {
    id: 1,
    name: "Aeropress Go",
    priceCents: 3999,
    blurb: "Single-cup espresso, anywhere.",
    emoji: "☕",
  },
  {
    id: 2,
    name: "Burr Grinder",
    priceCents: 8950,
    blurb: "40mm conical burrs, stepless.",
    emoji: "⚙️",
  },
  {
    id: 3,
    name: "Gooseneck Kettle",
    priceCents: 6500,
    blurb: "1°C pour control for filter.",
    emoji: "🫖",
  },
  {
    id: 4,
    name: "Pour-over Dripper",
    priceCents: 2499,
    blurb: "Ceramic V60, even extraction.",
    emoji: "🧪",
  },
  {
    id: 5,
    name: "Digital Scale",
    priceCents: 4200,
    blurb: "0.1g, built-in brew timer.",
    emoji: "⚖️",
  },
  { id: 6, name: "Travel Tumbler", priceCents: 2999, blurb: "Vacuum-sealed, 6h hot.", emoji: "🥤" },
];

/** The supported listing sort orders. `undefined` ⇒ catalog (id) order. */
export const SortValue = Schema.Literals(["price-asc", "price-desc", "name"]);

/** Decoded sort value. */
export type SortValue = typeof SortValue.Type;

/** Query-field schema for the listing's `?sort=` param (optional). */
export const SortOrder = { sort: Schema.optional(SortValue) };

/** Looks up a product by id; `undefined` for an unknown id (drives the dynamic 404). */
export const getProduct = (id: number): Product | undefined =>
  PRODUCTS.find((product) => product.id === id);

/**
 * Returns a new array of products ordered by `sort`. A missing/unknown `sort`
 * falls back to catalog (id) order. Pure, and never mutates the input.
 */
export const sortProducts = (
  products: readonly Product[],
  sort: SortValue | undefined,
): readonly Product[] => {
  const copy = [...products];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.priceCents - b.priceCents);
    case "price-desc":
      return copy.sort((a, b) => b.priceCents - a.priceCents);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.id - b.id);
  }
};

/** Formats integer cents as a `$d.dd` price string. */
export const formatPrice = (priceCents: number): string => `$${(priceCents / 100).toFixed(2)}`;
