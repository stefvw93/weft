import type { Option, SubscriptionRef } from "effect";
import type { DOMAttributes } from "./dom";
import type { HTMLAttributeSource, StyleAttributeValue } from "./attributes";
import type { Renderable } from "..";

type SVGPreserveAspectRatio =
  | "none"
  | "xMinYMin"
  | "xMidYMin"
  | "xMaxYMin"
  | "xMinYMid"
  | "xMidYMid"
  | "xMaxYMid"
  | "xMinYMax"
  | "xMidYMax"
  | "xMaxYMax"
  | "xMinYMin meet"
  | "xMidYMin meet"
  | "xMaxYMin meet"
  | "xMinYMid meet"
  | "xMidYMid meet"
  | "xMaxYMid meet"
  | "xMinYMax meet"
  | "xMidYMax meet"
  | "xMaxYMax meet"
  | "xMinYMin slice"
  | "xMidYMin slice"
  | "xMaxYMin slice"
  | "xMinYMid slice"
  | "xMidYMid slice"
  | "xMaxYMid slice"
  | "xMinYMax slice"
  | "xMidYMax slice"
  | "xMaxYMax slice";
type ImagePreserveAspectRatio =
  | SVGPreserveAspectRatio
  | "defer none"
  | "defer xMinYMin"
  | "defer xMidYMin"
  | "defer xMaxYMin"
  | "defer xMinYMid"
  | "defer xMidYMid"
  | "defer xMaxYMid"
  | "defer xMinYMax"
  | "defer xMidYMax"
  | "defer xMaxYMax"
  | "defer xMinYMin meet"
  | "defer xMidYMin meet"
  | "defer xMaxYMin meet"
  | "defer xMinYMid meet"
  | "defer xMidYMid meet"
  | "defer xMaxYMid meet"
  | "defer xMinYMax meet"
  | "defer xMidYMax meet"
  | "defer xMaxYMax meet"
  | "defer xMinYMin slice"
  | "defer xMidYMin slice"
  | "defer xMaxYMin slice"
  | "defer xMinYMid slice"
  | "defer xMidYMid slice"
  | "defer xMaxYMid slice"
  | "defer xMinYMax slice"
  | "defer xMidYMax slice"
  | "defer xMaxYMax slice";
type SVGUnits = "userSpaceOnUse" | "objectBoundingBox";
export interface SVGAttributes<T> extends DOMAttributes<T> {
  // weft internals ========================================================
  children?: HTMLAttributeSource<Renderable>;
  /**
   * A ref to this element, or an array of refs that all receive it (fan-out,
   * typically from `Props.merge`). The array arm accepts refs of any element
   * type because `SubscriptionRef` is invariant; see the note on
   * `HTMLAttributes.ref`.
   */
  ref?:
    | SubscriptionRef.SubscriptionRef<Option.Option<T>>
    | ReadonlyArray<SubscriptionRef.SubscriptionRef<Option.Option<any>>>;
  // ============================================================================

  id?: HTMLAttributeSource<string>;
  lang?: HTMLAttributeSource<string>;
  /**
   * A space-separated list of the part names of the element. Part names allows CSS to select and style specific elements in a shadow tree via the ::part pseudo-element.
   */
  part?: HTMLAttributeSource<string>;
  /**
   * An integer attribute indicating if the element can take input focus (is focusable), if it should participate to sequential keyboard navigation, and if so, at what position. It can take several values: a negative value means that the element should be focusable, but should not be reachable via sequential keyboard navigation; 0 means that the element should be focusable and reachable via sequential keyboard navigation, but its relative order is defined by the platform convention; a positive value means that the element should be focusable and reachable via sequential keyboard navigation; the order in which the elements are focused is the increasing value of the tabindex. If several elements share the same tabindex, their relative order follows their relative positions in the document.
   */
  tabindex?: HTMLAttributeSource<number | string>;
}
interface StylableSVGAttributes {
  class?: HTMLAttributeSource<string>;
  style?: HTMLAttributeSource<StyleAttributeValue>;
}
interface TransformableSVGAttributes {
  transform?: HTMLAttributeSource<string>;
}
interface ConditionalProcessingSVGAttributes {
  requiredExtensions?: HTMLAttributeSource<string>;
  requiredFeatures?: HTMLAttributeSource<string>;
  systemLanguage?: HTMLAttributeSource<string>;
}
interface ExternalResourceSVGAttributes {
  externalResourcesRequired?: HTMLAttributeSource<"true" | "false">;
}
interface AnimationTimingSVGAttributes {
  begin?: HTMLAttributeSource<number | string>;
  dur?: HTMLAttributeSource<number | string>;
  end?: HTMLAttributeSource<number | string>;
  min?: HTMLAttributeSource<number | string>;
  max?: HTMLAttributeSource<number | string>;
  restart?: HTMLAttributeSource<"always" | "whenNotActive" | "never">;
  repeatCount?: HTMLAttributeSource<number | (string & {}) | "indefinite">;
  repeatDur?: HTMLAttributeSource<number | string>;
  fill?: HTMLAttributeSource<"freeze" | "remove">;
}
interface AnimationValueSVGAttributes {
  calcMode?: HTMLAttributeSource<"discrete" | "linear" | "paced" | "spline">;
  values?: HTMLAttributeSource<string>;
  keyTimes?: HTMLAttributeSource<string>;
  keySplines?: HTMLAttributeSource<string>;
  from?: HTMLAttributeSource<number | string>;
  to?: HTMLAttributeSource<number | string>;
  by?: HTMLAttributeSource<number | string>;
}
interface AnimationAdditionSVGAttributes {
  attributeName?: HTMLAttributeSource<string>;
  additive?: HTMLAttributeSource<"replace" | "sum">;
  accumulate?: HTMLAttributeSource<"none" | "sum">;
}
interface AnimationAttributeTargetSVGAttributes {
  attributeName?: HTMLAttributeSource<string>;
  attributeType?: HTMLAttributeSource<"CSS" | "XML" | "auto">;
}
interface PresentationSVGAttributes {
  "alignment-baseline"?: HTMLAttributeSource<
    | "auto"
    | "baseline"
    | "before-edge"
    | "text-before-edge"
    | "middle"
    | "central"
    | "after-edge"
    | "text-after-edge"
    | "ideographic"
    | "alphabetic"
    | "hanging"
    | "mathematical"
    | "inherit"
  >;
  "baseline-shift"?: HTMLAttributeSource<number | string>;
  clip?: HTMLAttributeSource<string>;
  "clip-path"?: HTMLAttributeSource<string>;
  "clip-rule"?: HTMLAttributeSource<"nonzero" | "evenodd" | "inherit">;
  color?: HTMLAttributeSource<string>;
  "color-interpolation"?: HTMLAttributeSource<"auto" | "sRGB" | "linearRGB" | "inherit">;
  "color-interpolation-filters"?: HTMLAttributeSource<"auto" | "sRGB" | "linearRGB" | "inherit">;
  "color-profile"?: HTMLAttributeSource<string>;
  "color-rendering"?: HTMLAttributeSource<"auto" | "optimizeSpeed" | "optimizeQuality" | "inherit">;
  cursor?: HTMLAttributeSource<string>;
  direction?: HTMLAttributeSource<"ltr" | "rtl" | "inherit">;
  display?: HTMLAttributeSource<string>;
  "dominant-baseline"?: HTMLAttributeSource<
    | "auto"
    | "text-bottom"
    | "alphabetic"
    | "ideographic"
    | "middle"
    | "central"
    | "mathematical"
    | "hanging"
    | "text-top"
    | "inherit"
  >;
  "enable-background"?: HTMLAttributeSource<string>;
  fill?: HTMLAttributeSource<string>;
  "fill-opacity"?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  "fill-rule"?: HTMLAttributeSource<"nonzero" | "evenodd" | "inherit">;
  filter?: HTMLAttributeSource<string>;
  "flood-color"?: HTMLAttributeSource<string>;
  "flood-opacity"?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  "font-family"?: HTMLAttributeSource<string>;
  "font-size"?: HTMLAttributeSource<number | string>;
  "font-size-adjust"?: HTMLAttributeSource<number | string>;
  "font-stretch"?: HTMLAttributeSource<string>;
  "font-style"?: HTMLAttributeSource<"normal" | "italic" | "oblique" | "inherit">;
  "font-variant"?: HTMLAttributeSource<string>;
  "font-weight"?: HTMLAttributeSource<number | string>;
  "glyph-orientation-horizontal"?: HTMLAttributeSource<string>;
  "glyph-orientation-vertical"?: HTMLAttributeSource<string>;
  "image-rendering"?: HTMLAttributeSource<"auto" | "optimizeQuality" | "optimizeSpeed" | "inherit">;
  kerning?: HTMLAttributeSource<string>;
  "letter-spacing"?: HTMLAttributeSource<number | string>;
  "lighting-color"?: HTMLAttributeSource<string>;
  "marker-end"?: HTMLAttributeSource<string>;
  "marker-mid"?: HTMLAttributeSource<string>;
  "marker-start"?: HTMLAttributeSource<string>;
  mask?: HTMLAttributeSource<string>;
  opacity?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  overflow?: HTMLAttributeSource<"visible" | "hidden" | "scroll" | "auto" | "inherit">;
  "pointer-events"?: HTMLAttributeSource<
    | "bounding-box"
    | "visiblePainted"
    | "visibleFill"
    | "visibleStroke"
    | "visible"
    | "painted"
    | "color"
    | "fill"
    | "stroke"
    | "all"
    | "none"
    | "inherit"
  >;
  "shape-rendering"?: HTMLAttributeSource<
    "auto" | "optimizeSpeed" | "crispEdges" | "geometricPrecision" | "inherit"
  >;
  "stop-color"?: HTMLAttributeSource<string>;
  "stop-opacity"?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  stroke?: HTMLAttributeSource<string>;
  "stroke-dasharray"?: HTMLAttributeSource<string>;
  "stroke-dashoffset"?: HTMLAttributeSource<number | string>;
  "stroke-linecap"?: HTMLAttributeSource<"butt" | "round" | "square" | "inherit">;
  "stroke-linejoin"?: HTMLAttributeSource<
    "arcs" | "bevel" | "miter" | "miter-clip" | "round" | "inherit"
  >;
  "stroke-miterlimit"?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  "stroke-opacity"?: HTMLAttributeSource<number | (string & {}) | "inherit">;
  "stroke-width"?: HTMLAttributeSource<number | string>;
  "text-anchor"?: HTMLAttributeSource<"start" | "middle" | "end" | "inherit">;
  "text-decoration"?: HTMLAttributeSource<
    "none" | "underline" | "overline" | "line-through" | "blink" | "inherit"
  >;
  "text-rendering"?: HTMLAttributeSource<
    "auto" | "optimizeSpeed" | "optimizeLegibility" | "geometricPrecision" | "inherit"
  >;
  "unicode-bidi"?: HTMLAttributeSource<string>;
  visibility?: HTMLAttributeSource<"visible" | "hidden" | "collapse" | "inherit">;
  "word-spacing"?: HTMLAttributeSource<number | string>;
  "writing-mode"?: HTMLAttributeSource<
    "lr-tb" | "rl-tb" | "tb-rl" | "lr" | "rl" | "tb" | "inherit"
  >;
}
interface AnimationElementSVGAttributes<T>
  extends SVGAttributes<T>, ExternalResourceSVGAttributes, ConditionalProcessingSVGAttributes {}
interface ContainerElementSVGAttributes<T>
  extends
    SVGAttributes<T>,
    Pick<
      PresentationSVGAttributes,
      | "clip-path"
      | "mask"
      | "cursor"
      | "opacity"
      | "filter"
      | "enable-background"
      | "color-interpolation"
      | "color-rendering"
    > {}
interface FilterPrimitiveElementSVGAttributes<T>
  extends SVGAttributes<T>, Pick<PresentationSVGAttributes, "color-interpolation-filters"> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  result?: HTMLAttributeSource<string>;
}
interface SingleInputFilterSVGAttributes {
  in?: HTMLAttributeSource<string>;
}
interface DoubleInputFilterSVGAttributes {
  in?: HTMLAttributeSource<string>;
  in2?: HTMLAttributeSource<string>;
}
interface FitToViewBoxSVGAttributes {
  viewBox?: HTMLAttributeSource<string>;
  preserveAspectRatio?: HTMLAttributeSource<SVGPreserveAspectRatio>;
}
interface GradientElementSVGAttributes<T>
  extends SVGAttributes<T>, ExternalResourceSVGAttributes, StylableSVGAttributes {
  gradientUnits?: HTMLAttributeSource<SVGUnits>;
  gradientTransform?: HTMLAttributeSource<string>;
  spreadMethod?: HTMLAttributeSource<"pad" | "reflect" | "repeat">;
}
interface GraphicsElementSVGAttributes<T>
  extends
    SVGAttributes<T>,
    Pick<
      PresentationSVGAttributes,
      | "clip-rule"
      | "mask"
      | "pointer-events"
      | "cursor"
      | "opacity"
      | "filter"
      | "display"
      | "visibility"
      | "color-interpolation"
      | "color-rendering"
    > {}
interface LightSourceElementSVGAttributes<T> extends SVGAttributes<T> {}
interface NewViewportSVGAttributes<T>
  extends SVGAttributes<T>, Pick<PresentationSVGAttributes, "overflow" | "clip"> {
  viewBox?: HTMLAttributeSource<string>;
}
interface ShapeElementSVGAttributes<T>
  extends
    SVGAttributes<T>,
    Pick<
      PresentationSVGAttributes,
      | "color"
      | "fill-opacity"
      | "fill-rule"
      | "fill"
      | "shape-rendering"
      | "stroke-dasharray"
      | "stroke-dashoffset"
      | "stroke-linecap"
      | "stroke-linejoin"
      | "stroke-miterlimit"
      | "stroke-opacity"
      | "stroke-width"
      | "stroke"
    > {}
interface TextContentElementSVGAttributes<T>
  extends
    SVGAttributes<T>,
    Pick<
      PresentationSVGAttributes,
      | "color"
      | "direction"
      | "dominant-baseline"
      | "fill-opacity"
      | "fill-rule"
      | "fill"
      | "font-family"
      | "font-size-adjust"
      | "font-size"
      | "font-stretch"
      | "font-style"
      | "font-variant"
      | "font-weight"
      | "glyph-orientation-horizontal"
      | "glyph-orientation-vertical"
      | "kerning"
      | "letter-spacing"
      | "stroke-dasharray"
      | "stroke-dashoffset"
      | "stroke-linecap"
      | "stroke-linejoin"
      | "stroke-miterlimit"
      | "stroke-opacity"
      | "stroke-width"
      | "stroke"
      | "text-anchor"
      | "text-decoration"
      | "unicode-bidi"
      | "word-spacing"
    > {}
interface ZoomAndPanSVGAttributes {
  zoomAndPan?: HTMLAttributeSource<"disable" | "magnify">;
}
interface AnimateSVGAttributes<T>
  extends
    AnimationElementSVGAttributes<T>,
    AnimationAttributeTargetSVGAttributes,
    AnimationTimingSVGAttributes,
    AnimationValueSVGAttributes,
    AnimationAdditionSVGAttributes,
    Pick<PresentationSVGAttributes, "color-interpolation" | "color-rendering"> {}
interface AnimateMotionSVGAttributes<T>
  extends
    AnimationElementSVGAttributes<T>,
    AnimationTimingSVGAttributes,
    AnimationValueSVGAttributes,
    AnimationAdditionSVGAttributes {
  path?: HTMLAttributeSource<string>;
  keyPoints?: HTMLAttributeSource<string>;
  rotate?: HTMLAttributeSource<number | "auto" | "auto-reverse" | (string & {})>;
  origin?: HTMLAttributeSource<"default">;
}
interface AnimateTransformSVGAttributes<T>
  extends
    AnimationElementSVGAttributes<T>,
    AnimationAttributeTargetSVGAttributes,
    AnimationTimingSVGAttributes,
    AnimationValueSVGAttributes,
    AnimationAdditionSVGAttributes {
  type?: HTMLAttributeSource<"translate" | "scale" | "rotate" | "skewX" | "skewY">;
}
interface CircleSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes {
  cx?: HTMLAttributeSource<number | string>;
  cy?: HTMLAttributeSource<number | string>;
  r?: HTMLAttributeSource<number | string>;
}
interface ClipPathSVGAttributes<T>
  extends
    SVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "clip-path"> {
  clipPathUnits?: HTMLAttributeSource<SVGUnits>;
}
interface DefsSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes {}
interface DescSVGAttributes<T> extends SVGAttributes<T>, StylableSVGAttributes {}
interface EllipseSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes {
  cx?: HTMLAttributeSource<number | string>;
  cy?: HTMLAttributeSource<number | string>;
  rx?: HTMLAttributeSource<number | string>;
  ry?: HTMLAttributeSource<number | string>;
}
interface FeBlendSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    DoubleInputFilterSVGAttributes,
    StylableSVGAttributes {
  mode?: HTMLAttributeSource<"normal" | "multiply" | "screen" | "darken" | "lighten">;
}
interface FeColorMatrixSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {
  type?: HTMLAttributeSource<"matrix" | "saturate" | "hueRotate" | "luminanceToAlpha">;
  values?: HTMLAttributeSource<string>;
}
interface FeComponentTransferSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {}
interface FeCompositeSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    DoubleInputFilterSVGAttributes,
    StylableSVGAttributes {
  operator?: HTMLAttributeSource<"over" | "in" | "out" | "atop" | "xor" | "arithmetic">;
  k1?: HTMLAttributeSource<number | string>;
  k2?: HTMLAttributeSource<number | string>;
  k3?: HTMLAttributeSource<number | string>;
  k4?: HTMLAttributeSource<number | string>;
}
interface FeConvolveMatrixSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {
  order?: HTMLAttributeSource<number | string>;
  kernelMatrix?: HTMLAttributeSource<string>;
  divisor?: HTMLAttributeSource<number | string>;
  bias?: HTMLAttributeSource<number | string>;
  targetX?: HTMLAttributeSource<number | string>;
  targetY?: HTMLAttributeSource<number | string>;
  edgeMode?: HTMLAttributeSource<"duplicate" | "wrap" | "none">;
  kernelUnitLength?: HTMLAttributeSource<number | string>;
  preserveAlpha?: HTMLAttributeSource<"true" | "false">;
}
interface FeDiffuseLightingSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes,
    Pick<PresentationSVGAttributes, "color" | "lighting-color"> {
  surfaceScale?: HTMLAttributeSource<number | string>;
  diffuseConstant?: HTMLAttributeSource<number | string>;
  kernelUnitLength?: HTMLAttributeSource<number | string>;
}
interface FeDisplacementMapSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    DoubleInputFilterSVGAttributes,
    StylableSVGAttributes {
  scale?: HTMLAttributeSource<number | string>;
  xChannelSelector?: HTMLAttributeSource<"R" | "G" | "B" | "A">;
  yChannelSelector?: HTMLAttributeSource<"R" | "G" | "B" | "A">;
}
interface FeDistantLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
  azimuth?: HTMLAttributeSource<number | string>;
  elevation?: HTMLAttributeSource<number | string>;
}
interface FeFloodSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    StylableSVGAttributes,
    Pick<PresentationSVGAttributes, "color" | "flood-color" | "flood-opacity"> {}
interface FeFuncSVGAttributes<T> extends SVGAttributes<T> {
  type?: HTMLAttributeSource<"identity" | "table" | "discrete" | "linear" | "gamma">;
  tableValues?: HTMLAttributeSource<string>;
  slope?: HTMLAttributeSource<number | string>;
  intercept?: HTMLAttributeSource<number | string>;
  amplitude?: HTMLAttributeSource<number | string>;
  exponent?: HTMLAttributeSource<number | string>;
  offset?: HTMLAttributeSource<number | string>;
}
interface FeGaussianBlurSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {
  stdDeviation?: HTMLAttributeSource<number | string>;
}
interface FeImageSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes {
  preserveAspectRatio: SVGPreserveAspectRatio;
}
interface FeMergeSVGAttributes<T>
  extends FilterPrimitiveElementSVGAttributes<T>, StylableSVGAttributes {}
interface FeMergeNodeSVGAttributes<T> extends SVGAttributes<T>, SingleInputFilterSVGAttributes {}
interface FeMorphologySVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {
  operator?: HTMLAttributeSource<"erode" | "dilate">;
  radius?: HTMLAttributeSource<number | string>;
}
interface FeOffsetSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {
  dx?: HTMLAttributeSource<number | string>;
  dy?: HTMLAttributeSource<number | string>;
}
interface FePointLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  z?: HTMLAttributeSource<number | string>;
}
interface FeSpecularLightingSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes,
    Pick<PresentationSVGAttributes, "color" | "lighting-color"> {
  surfaceScale?: HTMLAttributeSource<number | string>;
  specularConstant?: HTMLAttributeSource<number | string>;
  specularExponent?: HTMLAttributeSource<number | string>;
  kernelUnitLength?: HTMLAttributeSource<number | string>;
}
interface FeSpotLightSVGAttributes<T> extends LightSourceElementSVGAttributes<T> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  z?: HTMLAttributeSource<number | string>;
  pointsAtX?: HTMLAttributeSource<number | string>;
  pointsAtY?: HTMLAttributeSource<number | string>;
  pointsAtZ?: HTMLAttributeSource<number | string>;
  specularExponent?: HTMLAttributeSource<number | string>;
  limitingConeAngle?: HTMLAttributeSource<number | string>;
}
interface FeTileSVGAttributes<T>
  extends
    FilterPrimitiveElementSVGAttributes<T>,
    SingleInputFilterSVGAttributes,
    StylableSVGAttributes {}
interface FeTurbulanceSVGAttributes<T>
  extends FilterPrimitiveElementSVGAttributes<T>, StylableSVGAttributes {
  baseFrequency?: HTMLAttributeSource<number | string>;
  numOctaves?: HTMLAttributeSource<number | string>;
  seed?: HTMLAttributeSource<number | string>;
  stitchTiles?: HTMLAttributeSource<"stitch" | "noStitch">;
  type?: HTMLAttributeSource<"fractalNoise" | "turbulence">;
}
interface FilterSVGAttributes<T>
  extends SVGAttributes<T>, ExternalResourceSVGAttributes, StylableSVGAttributes {
  filterUnits?: HTMLAttributeSource<SVGUnits>;
  primitiveUnits?: HTMLAttributeSource<SVGUnits>;
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  filterRes?: HTMLAttributeSource<number | string>;
}
interface ForeignObjectSVGAttributes<T>
  extends
    NewViewportSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "display" | "visibility"> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
}
interface GSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "display" | "visibility"> {}
interface ImageSVGAttributes<T>
  extends
    NewViewportSVGAttributes<T>,
    GraphicsElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "color-profile" | "image-rendering"> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  preserveAspectRatio?: HTMLAttributeSource<ImagePreserveAspectRatio>;
}
interface LineSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
  x1?: HTMLAttributeSource<number | string>;
  y1?: HTMLAttributeSource<number | string>;
  x2?: HTMLAttributeSource<number | string>;
  y2?: HTMLAttributeSource<number | string>;
}
interface LinearGradientSVGAttributes<T> extends GradientElementSVGAttributes<T> {
  x1?: HTMLAttributeSource<number | string>;
  x2?: HTMLAttributeSource<number | string>;
  y1?: HTMLAttributeSource<number | string>;
  y2?: HTMLAttributeSource<number | string>;
}
interface MarkerSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    FitToViewBoxSVGAttributes,
    Pick<PresentationSVGAttributes, "overflow" | "clip"> {
  markerUnits?: HTMLAttributeSource<"strokeWidth" | "userSpaceOnUse">;
  refX?: HTMLAttributeSource<number | string>;
  refY?: HTMLAttributeSource<number | string>;
  markerWidth?: HTMLAttributeSource<number | string>;
  markerHeight?: HTMLAttributeSource<number | string>;
  orient?: HTMLAttributeSource<string>;
}
interface MaskSVGAttributes<T>
  extends
    Omit<ContainerElementSVGAttributes<T>, "opacity" | "filter">,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes {
  maskUnits?: HTMLAttributeSource<SVGUnits>;
  maskContentUnits?: HTMLAttributeSource<SVGUnits>;
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
}
interface MetadataSVGAttributes<T> extends SVGAttributes<T> {}
interface PathSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
  d?: HTMLAttributeSource<string>;
  pathLength?: HTMLAttributeSource<number | string>;
}
interface PatternSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    FitToViewBoxSVGAttributes,
    Pick<PresentationSVGAttributes, "overflow" | "clip"> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  patternUnits?: HTMLAttributeSource<SVGUnits>;
  patternContentUnits?: HTMLAttributeSource<SVGUnits>;
  patternTransform?: HTMLAttributeSource<string>;
}
interface PolygonSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
  points?: HTMLAttributeSource<string>;
}
interface PolylineSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "marker-start" | "marker-mid" | "marker-end"> {
  points?: HTMLAttributeSource<string>;
}
interface RadialGradientSVGAttributes<T> extends GradientElementSVGAttributes<T> {
  cx?: HTMLAttributeSource<number | string>;
  cy?: HTMLAttributeSource<number | string>;
  r?: HTMLAttributeSource<number | string>;
  fx?: HTMLAttributeSource<number | string>;
  fy?: HTMLAttributeSource<number | string>;
}
interface RectSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ShapeElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  rx?: HTMLAttributeSource<number | string>;
  ry?: HTMLAttributeSource<number | string>;
}
interface StopSVGAttributes<T>
  extends
    SVGAttributes<T>,
    StylableSVGAttributes,
    Pick<PresentationSVGAttributes, "color" | "stop-color" | "stop-opacity"> {
  offset?: HTMLAttributeSource<number | string>;
}
interface SvgSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    NewViewportSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    FitToViewBoxSVGAttributes,
    ZoomAndPanSVGAttributes,
    PresentationSVGAttributes {
  version?: HTMLAttributeSource<string>;
  "base-profile"?: HTMLAttributeSource<string>;
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
  contentScriptType?: HTMLAttributeSource<string>;
  contentStyleType?: HTMLAttributeSource<string>;
  xmlns?: HTMLAttributeSource<string>;
}
interface SwitchSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "display" | "visibility"> {}
interface SymbolSVGAttributes<T>
  extends
    ContainerElementSVGAttributes<T>,
    NewViewportSVGAttributes<T>,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    FitToViewBoxSVGAttributes {}
interface TextSVGAttributes<T>
  extends
    TextContentElementSVGAttributes<T>,
    GraphicsElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes,
    Pick<PresentationSVGAttributes, "writing-mode" | "text-rendering"> {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  dx?: HTMLAttributeSource<number | string>;
  dy?: HTMLAttributeSource<number | string>;
  rotate?: HTMLAttributeSource<number | string>;
  textLength?: HTMLAttributeSource<number | string>;
  lengthAdjust?: HTMLAttributeSource<"spacing" | "spacingAndGlyphs">;
}
interface TextPathSVGAttributes<T>
  extends
    TextContentElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    Pick<
      PresentationSVGAttributes,
      "alignment-baseline" | "baseline-shift" | "display" | "visibility"
    > {
  startOffset?: HTMLAttributeSource<number | string>;
  method?: HTMLAttributeSource<"align" | "stretch">;
  spacing?: HTMLAttributeSource<"auto" | "exact">;
}
interface TSpanSVGAttributes<T>
  extends
    TextContentElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    Pick<
      PresentationSVGAttributes,
      "alignment-baseline" | "baseline-shift" | "display" | "visibility"
    > {
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  dx?: HTMLAttributeSource<number | string>;
  dy?: HTMLAttributeSource<number | string>;
  rotate?: HTMLAttributeSource<number | string>;
  textLength?: HTMLAttributeSource<number | string>;
  lengthAdjust?: HTMLAttributeSource<"spacing" | "spacingAndGlyphs">;
}
interface UseSVGAttributes<T>
  extends
    GraphicsElementSVGAttributes<T>,
    ConditionalProcessingSVGAttributes,
    ExternalResourceSVGAttributes,
    StylableSVGAttributes,
    TransformableSVGAttributes {
  href?: HTMLAttributeSource<string>;
  x?: HTMLAttributeSource<number | string>;
  y?: HTMLAttributeSource<number | string>;
  width?: HTMLAttributeSource<number | string>;
  height?: HTMLAttributeSource<number | string>;
}
interface ViewSVGAttributes<T>
  extends
    SVGAttributes<T>,
    ExternalResourceSVGAttributes,
    FitToViewBoxSVGAttributes,
    ZoomAndPanSVGAttributes {
  viewTarget?: HTMLAttributeSource<string>;
}
export interface SVGElements {
  animate: AnimateSVGAttributes<SVGAnimateElement>;
  animateMotion: AnimateMotionSVGAttributes<SVGAnimateMotionElement>;
  animateTransform: AnimateTransformSVGAttributes<SVGAnimateTransformElement>;
  circle: CircleSVGAttributes<SVGCircleElement>;
  clipPath: ClipPathSVGAttributes<SVGClipPathElement>;
  defs: DefsSVGAttributes<SVGDefsElement>;
  desc: DescSVGAttributes<SVGDescElement>;
  ellipse: EllipseSVGAttributes<SVGEllipseElement>;
  feBlend: FeBlendSVGAttributes<SVGFEBlendElement>;
  feColorMatrix: FeColorMatrixSVGAttributes<SVGFEColorMatrixElement>;
  feComponentTransfer: FeComponentTransferSVGAttributes<SVGFEComponentTransferElement>;
  feComposite: FeCompositeSVGAttributes<SVGFECompositeElement>;
  feConvolveMatrix: FeConvolveMatrixSVGAttributes<SVGFEConvolveMatrixElement>;
  feDiffuseLighting: FeDiffuseLightingSVGAttributes<SVGFEDiffuseLightingElement>;
  feDisplacementMap: FeDisplacementMapSVGAttributes<SVGFEDisplacementMapElement>;
  feDistantLight: FeDistantLightSVGAttributes<SVGFEDistantLightElement>;
  feFlood: FeFloodSVGAttributes<SVGFEFloodElement>;
  feFuncA: FeFuncSVGAttributes<SVGFEFuncAElement>;
  feFuncB: FeFuncSVGAttributes<SVGFEFuncBElement>;
  feFuncG: FeFuncSVGAttributes<SVGFEFuncGElement>;
  feFuncR: FeFuncSVGAttributes<SVGFEFuncRElement>;
  feGaussianBlur: FeGaussianBlurSVGAttributes<SVGFEGaussianBlurElement>;
  feImage: FeImageSVGAttributes<SVGFEImageElement>;
  feMerge: FeMergeSVGAttributes<SVGFEMergeElement>;
  feMergeNode: FeMergeNodeSVGAttributes<SVGFEMergeNodeElement>;
  feMorphology: FeMorphologySVGAttributes<SVGFEMorphologyElement>;
  feOffset: FeOffsetSVGAttributes<SVGFEOffsetElement>;
  fePointLight: FePointLightSVGAttributes<SVGFEPointLightElement>;
  feSpecularLighting: FeSpecularLightingSVGAttributes<SVGFESpecularLightingElement>;
  feSpotLight: FeSpotLightSVGAttributes<SVGFESpotLightElement>;
  feTile: FeTileSVGAttributes<SVGFETileElement>;
  feTurbulence: FeTurbulanceSVGAttributes<SVGFETurbulenceElement>;
  filter: FilterSVGAttributes<SVGFilterElement>;
  foreignObject: ForeignObjectSVGAttributes<SVGForeignObjectElement>;
  g: GSVGAttributes<SVGGElement>;
  image: ImageSVGAttributes<SVGImageElement>;
  line: LineSVGAttributes<SVGLineElement>;
  linearGradient: LinearGradientSVGAttributes<SVGLinearGradientElement>;
  marker: MarkerSVGAttributes<SVGMarkerElement>;
  mask: MaskSVGAttributes<SVGMaskElement>;
  metadata: MetadataSVGAttributes<SVGMetadataElement>;
  path: PathSVGAttributes<SVGPathElement>;
  pattern: PatternSVGAttributes<SVGPatternElement>;
  polygon: PolygonSVGAttributes<SVGPolygonElement>;
  polyline: PolylineSVGAttributes<SVGPolylineElement>;
  radialGradient: RadialGradientSVGAttributes<SVGRadialGradientElement>;
  rect: RectSVGAttributes<SVGRectElement>;
  stop: StopSVGAttributes<SVGStopElement>;
  svg: SvgSVGAttributes<SVGSVGElement>;
  switch: SwitchSVGAttributes<SVGSwitchElement>;
  symbol: SymbolSVGAttributes<SVGSymbolElement>;
  text: TextSVGAttributes<SVGTextElement>;
  textPath: TextPathSVGAttributes<SVGTextPathElement>;
  tspan: TSpanSVGAttributes<SVGTSpanElement>;
  use: UseSVGAttributes<SVGUseElement>;
  view: ViewSVGAttributes<SVGViewElement>;
}
