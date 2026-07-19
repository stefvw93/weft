import type { Option, SubscriptionRef } from "effect";
import type { AriaAttributes } from "./aria";
import type {
  DOMAttributes,
  EventHandler,
  HTMLAutocapitalize,
  HTMLAutocomplete,
  HTMLCrossorigin,
  HTMLDir,
  HTMLFormEncType,
  HTMLFormMethod,
  HTMLIframeSandbox,
  HTMLLinkAs,
  HTMLReferrerPolicy,
} from "./dom";
import type { HTMLAttributeSource, StyleAttributeValue } from "./attributes";
import type { Renderable } from "..";
export type HTMLRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "blockquote"
  | "button"
  | "caption"
  | "cell"
  | "checkbox"
  | "code"
  | "columnheader"
  | "combobox"
  | "command"
  | "complementary"
  | "composite"
  | "contentinfo"
  | "definition"
  | "deletion"
  | "dialog"
  | "directory"
  | "document"
  | "emphasis"
  | "feed"
  | "figure"
  | "form"
  | "generic"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "img"
  | "input"
  | "insertion"
  | "landmark"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "meter"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "paragraph"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "range"
  | "region"
  | "roletype"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "section"
  | "sectionhead"
  | "select"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "strong"
  | "structure"
  | "subscript"
  | "superscript"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "time"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem"
  | "widget"
  | "window";
export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  // weft internals ========================================================
  children?: HTMLAttributeSource<Renderable>;
  ref?: SubscriptionRef.SubscriptionRef<Option.Option<T>>;
  // ============================================================================

  /**
   * Provides a hint for generating a keyboard shortcut for the current element. This attribute consists of a space-separated list of characters. The browser should use the first one that exists on the computer keyboard layout.
   */
  accesskey?: HTMLAttributeSource<string>;
  /**
   * Controls whether and how text input is automatically capitalized as it is entered/edited by the user. It can have the following values: off or none, no autocapitalization is applied (all letters default to lowercase) on or sentences, the first letter of each sentence defaults to a capital letter; all other letters default to lowercase words, the first letter of each word defaults to a capital letter; all other letters default to lowercase characters, all letters should default to uppercase
   */
  autocapitalize?: HTMLAttributeSource<HTMLAutocapitalize>;
  /**
   * Indicates that an element is to be focused on page load, or as soon as the `<dialog>` it is part of is displayed. This attribute is a boolean, initially false.
   */
  autofocus?: HTMLAttributeSource<boolean>;
  /**
   * A space-separated list of the classes of the element. Classes allows CSS and JavaScript to select and access specific elements via the class selectors or functions like the method Document.getElementsByClassName().
   */
  class?: HTMLAttributeSource<string>;
  /**
   * An enumerated attribute indicating if the element should be editable by the user. If so, the browser modifies its widget to allow editing. The attribute must take one of the following values: true or the empty string, which indicates that the element must be editable; false, which indicates that the element must not be editable.
   */
  contenteditable?: HTMLAttributeSource<"true" | "false">;
  /**
   * The id of a `<menu>` to use as the contextual menu for this element.
   */
  contextmenu?: HTMLAttributeSource<string>;
  /**
   * An enumerated attribute indicating the directionality of the element's text. It can have the following values: ltr, which means left to right and is to be used for languages that are written from the left to the right (like English); rtl, which means right to left and is to be used for languages that are written from the right to the left (like Arabic); auto, which lets the user agent decide. It uses a basic algorithm as it parses the characters inside the element until it finds a character with a strong directionality, then it applies that directionality to the whole element.
   */
  dir?: HTMLAttributeSource<HTMLDir>;
  /**
   * An enumerated attribute indicating whether the element can be dragged, using the Drag and Drop API. It can have the following values: true, which indicates that the element may be dragged false, which indicates that the element may not be dragged.
   */
  draggable?: HTMLAttributeSource<"true" | "false">;
  /**
   * Hints what action label (or icon) to present for the enter key on virtual keyboards.
   */
  enterkeyhint?: HTMLAttributeSource<
    "enter" | "done" | "go" | "next" | "previous" | "search" | "send"
  >;
  /**
   * Used to transitively export shadow parts from a nested shadow tree into a containing light tree.
   */
  exportparts?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute indicates that the element is not yet, or is no longer, relevant. For example, it can be used to hide elements of the page that can't be used until the login process has been completed. The browser won't render such elements. This attribute must not be used to hide content that could legitimately be shown.
   */
  hidden?: HTMLAttributeSource<boolean>;
  /**
   * Defines a unique identifier (ID) which must be unique in the whole document. Its purpose is to identify the element when linking (using a fragment identifier), scripting, or styling (with CSS).
   */
  id?: HTMLAttributeSource<string>;
  /**
   * Provides a hint to browsers as to the type of virtual keyboard configuration to use when editing this element or its contents. Used primarily on `<input>` elements, but is usable on any element while in contenteditable mode.
   */
  inputmode?: HTMLAttributeSource<
    "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"
  >;
  /**
   * Allows you to specify that a standard HTML element should behave like a registered custom built-in element (see Using custom elements for more details).
   */
  is?: HTMLAttributeSource<string>;
  /**
   * The unique, global identifier of an item.
   */
  itemid?: HTMLAttributeSource<string>;
  /**
   * Used to add properties to an item. Every HTML element may have an itemprop attribute specified, where an itemprop consists of a name and value pair.
   */
  itemprop?: HTMLAttributeSource<string>;
  /**
   * Properties that are not descendants of an element with the itemscope attribute can be associated with the item using an itemref. It provides a list of element ids (not itemids) with additional properties elsewhere in the document.
   */
  itemref?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * itemscope (usually) works along with itemtype to specify that the HTML contained in a block is about a particular item. itemscope creates the Item and defines the scope of the itemtype associated with it. itemtype is a valid URL of a vocabulary (such as schema.org) that describes the item and its properties context.
   */
  itemscope?: HTMLAttributeSource<boolean>;
  /**
   * Specifies the URL of the vocabulary that will be used to define itemprops (item properties) in the data structure. itemscope is used to set the scope of where in the data structure the vocabulary set by itemtype will be active.
   */
  itemtype?: HTMLAttributeSource<string>;
  /**
   * Helps define the language of an element: the language that non-editable elements are in, or the language that editable elements should be written in by the user. The attribute contains one “language tag” (made of hyphen-separated “language subtags”) in the format defined in Tags for Identifying Languages (BCP47). xml:lang has priority over it.
   */
  lang?: HTMLAttributeSource<string>;
  /**
   * A cryptographic nonce ("number used once") which can be used by Content Security Policy to determine whether or not a given fetch will be allowed to proceed.
   */
  nonce?: HTMLAttributeSource<string>;
  /**
   * A space-separated list of the part names of the element. Part names allows CSS to select and style specific elements in a shadow tree via the ::part pseudo-element.
   */
  part?: HTMLAttributeSource<string>;
  /** */
  role?: HTMLAttributeSource<HTMLRole>;
  /**
   * Assigns a slot in a shadow DOM shadow tree to an element: An element with a slot attribute is assigned to the slot created by the `<slot>` element whose name attribute's value matches that slot attribute's value.
   */
  slot?: HTMLAttributeSource<string>;
  /**
   * An enumerated attribute defines whether the element may be checked for spelling errors. It may have the following values: true, which indicates that the element should be, if possible, checked for spelling errors; false, which indicates that the element should not be checked for spelling errors.
   */
  spellcheck?: HTMLAttributeSource<"true" | "false">;
  /**
   * Contains CSS styling declarations to be applied to the element. Note that it is recommended for styles to be defined in a separate file or files. This attribute and the `<style>` element have mainly the purpose of allowing for quick styling, for example for testing purposes.
   */
  style?: StyleAttributeValue;
  /**
   * An integer attribute indicating if the element can take input focus (is focusable), if it should participate to sequential keyboard navigation, and if so, at what position. It can take several values: a negative value means that the element should be focusable, but should not be reachable via sequential keyboard navigation; 0 means that the element should be focusable and reachable via sequential keyboard navigation, but its relative order is defined by the platform convention; a positive value means that the element should be focusable and reachable via sequential keyboard navigation; the order in which the elements are focused is the increasing value of the tabindex. If several elements share the same tabindex, their relative order follows their relative positions in the document.
   */
  tabindex?: HTMLAttributeSource<number | string>;
  /**
   * Contains a text representing advisory information related to the element it belongs to. Such information can typically, but not necessarily, be presented to the user as a tooltip.
   */
  title?: HTMLAttributeSource<string>;
  /**
   * An enumerated attribute that is used to specify whether an element's attribute values and the values of its Text node children are to be translated when the page is localized, or whether to leave them unchanged. It can have the following values: empty string and yes, which indicates that the element will be translated. no, which indicates that the element will not be translated.
   */
  translate?: HTMLAttributeSource<"true" | "false">;
  /** */
  "xml:base"?: HTMLAttributeSource<string>;
  /** */
  "xml:lang"?: HTMLAttributeSource<string>;
}
interface AHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Hinted at the character encoding of the linked URL. Note: This attribute is deprecated and should not be used by authors. Use the HTTP Content-Type header on the linked URL.
   */
  charset?: HTMLAttributeSource<string>;
  /**
   * Used with the shape attribute. A comma-separated list of coordinates.
   */
  coords?: HTMLAttributeSource<string>;
  /**
   * Prompts the user to save the linked URL instead of navigating to it. Can be used with or without a value: Without a value, the browser will suggest a filename/extension, generated from various sources: The Content-Disposition HTTP header The final segment in the URL path The media type (from the Content-Type header, the start of a data: URL, or Blob.type for a blob: URL) Defining a value suggests it as the filename. / and \ characters are converted to underscores (_). Filesystems may forbid other characters in filenames, so browsers will adjust the suggested name if necessary. download only works for same-origin URLs, or the blob: and data: schemes. Notes: If the Content-Disposition header has different information from the download attribute, resulting behavior may differ: If the header specifies a filename, it takes priority over a filename specified in the download attribute. If the header specifies a disposition of inline, Chrome, and Firefox 82 and later, prioritize the attribute and treat it as a download. Firefox versions before 82 prioritize the header and will display the content inline.
   */
  download?: HTMLAttributeSource<string>;
  /**
   * The URL that the hyperlink points to. Links are not restricted to HTTP-based URLs, and they can use any URL scheme supported by browsers: Sections of a page with fragment URLs Pieces of media files with media fragments Telephone numbers with tel: URLs Email addresses with mailto: URLs While web browsers may not support other URL schemes, web sites can with registerProtocolHandler()
   */
  href?: HTMLAttributeSource<string>;
  /**
   * Hints at the human language of the linked URL. No built-in functionality. Allowed values are the same as the global lang attribute.
   */
  hreflang?: HTMLAttributeSource<string>;
  /**
   * Was required to define a possible target location in a page. In HTML 4.01, id and name could both be used on `<a>`, as long as they had identical values. Note: Use the global attribute id instead.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * A space-separated list of URLs. When the link is followed, the browser will send POST requests with the body PING to the URLs. Typically for tracking.
   */
  ping?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * How much of the referrer to send when following the link. no-referrer: The Referer header will not be sent. no-referrer-when-downgrade: The Referer header will not be sent to origins without TLS (HTTPS). origin: The sent referrer will be limited to the origin of the referring page: its scheme, host, and port. origin-when-cross-origin: The referrer sent to other origins will be limited to the scheme, the host, and the port. Navigations on the same origin will still include the path. same-origin: A referrer will be sent for same origin, but cross-origin requests will contain no referrer information. strict-origin: Only send the origin of the document as the referrer when the protocol security level stays the same (HTTPS→HTTPS), but don't send it to a less secure destination (HTTPS→HTTP). strict-origin-when-cross-origin (default): Send a full URL when performing a same-origin request, only send the origin when the protocol security level stays the same (HTTPS→HTTPS), and send no header to a less secure destination (HTTPS→HTTP). unsafe-url: The referrer will include the origin and the path (but not the fragment, password, or username). This value is unsafe, because it leaks origins and paths from TLS-protected resources to insecure origins.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * The relationship of the linked URL as space-separated link types.
   */
  rel?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * Specified a reverse link; the opposite of the rel attribute. Deprecated for being very confusing.
   */
  rev?: HTMLAttributeSource<string>;
  /**
   * The shape of the hyperlink’s region in an image map. Note: Use the `<area>` element for image maps instead.
   */
  shape?: HTMLAttributeSource<string>;
  /**
   * Where to display the linked URL, as the name for a browsing context (a tab, window, or `<iframe>`). The following keywords have special meanings for where to load the URL: _self: the current browsing context. (Default) _blank: usually a new tab, but users can configure browsers to open a new window instead. _parent: the parent browsing context of the current one. If no parent, behaves as _self. _top: the topmost browsing context (the "highest" context that’s an ancestor of the current one). If no ancestors, behaves as _self. Note: Setting target="_blank" on `<a>` elements implicitly provides the same rel behavior as setting rel="noopener" which does not set window.opener. See browser compatibility for support status.
   */
  target?: HTMLAttributeSource<string>;
  /**
   * Hints at the linked URL’s format with a MIME type. No built-in functionality.
   */
  type?: HTMLAttributeSource<string>;
}
interface AppletHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute is used to position the applet on the page relative to content that might flow around it. The HTML 4.01 specification defines values of bottom, left, middle, right, and top, whereas Microsoft and Netscape also might support absbottom, absmiddle, baseline, center, and texttop.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * This attribute causes a descriptive text alternate to be displayed on browsers that do not support Java. Page designers should also remember that content enclosed within the `<applet>` element may also be rendered as alternative text.
   */
  alt?: HTMLAttributeSource<string>;
  /**
   * This attribute refers to an archived or compressed version of the applet and its associated class files, which might help reduce download time.
   */
  archive?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the URL of the applet's class file to be loaded and executed. Applet filenames are identified by a .class filename extension. The URL specified by code might be relative to the codebase attribute.
   */
  code?: HTMLAttributeSource<string>;
  /**
   * This attribute gives the absolute or relative URL of the directory where applets' .class files referenced by the code attribute are stored.
   */
  codebase?: HTMLAttributeSource<string>;
  /**
   * This attribute, supported by Internet Explorer 4 and higher, specifies the column name from the data source object that supplies the bound data. This attribute might be used to specify the various `<param>` elements passed to the Java applet.
   */
  datafld?: HTMLAttributeSource<string>;
  /**
   * Like datafld, this attribute is used for data binding under Internet Explorer 4. It indicates the id of the data source object that supplies the data that is bound to the `<param>` elements associated with the applet.
   */
  datasrc?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the height, in pixels, that the applet needs.
   */
  height?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies additional horizontal space, in pixels, to be reserved on either side of the applet.
   */
  hspace?: HTMLAttributeSource<string>;
  /**
   * In the Netscape implementation, this attribute allows access to an applet by programs in a scripting language embedded in the document.
   */
  mayscript?: HTMLAttributeSource<string>;
  /**
   * This attribute assigns a name to the applet so that it can be identified by other resources; particularly scripts.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the URL of a serialized representation of an applet.
   */
  object?: HTMLAttributeSource<string>;
  /**
   * As defined for Internet Explorer 4 and higher, this attribute specifies a URL for an associated file for the applet. The meaning and use is unclear and not part of the HTML standard.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies additional vertical space, in pixels, to be reserved above and below the applet.
   */
  vspace?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies in pixels the width that the applet needs.
   */
  width?: HTMLAttributeSource<string>;
}
interface AreaHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A text string alternative to display on browsers that do not display images. The text should be phrased so that it presents the user with the same kind of choice as the image would offer when displayed without the alternative text. This attribute is required only if the href attribute is used.
   */
  alt?: HTMLAttributeSource<string>;
  /**
   * The coords attribute details the coordinates of the shape attribute in size, shape, and placement of an `<area>`. rect: the value is x1,y1,x2,y2. Value specifies the coordinates of the top-left and bottom-right corner of the rectangle. For example: `<area shape="rect" coords="0,0,253,27" href="#" target="_blank" alt="Mozilla">` The coords in the above example specify: 0,0 as the top-left corner and 253,27 as the bottom-right corner of the rectangle. circle: the value is x,y,radius. Value specifies the coordinates of the circle center and the radius. For example: `<area shape="circle" coords="130,136,60" href="#" target="_blank" alt="MDN">` poly: the value is x1,y1,x2,y2,..,xn,yn. Value specifies the coordinates of the edges of the polygon. If the first and last coordinate pairs are not the same, the browser will add the last coordinate pair to close the polygon default: defines the entire region The values are numbers of CSS pixels.
   */
  coords?: HTMLAttributeSource<string>;
  /**
   * This attribute, if present, indicates that the author intends the hyperlink to be used for downloading a resource. See `<a>` for a full description of the download attribute.
   */
  download?: HTMLAttributeSource<string>;
  /**
   * The hyperlink target for the area. Its value is a valid URL. This attribute may be omitted; if so, the `<area>` element does not represent a hyperlink.
   */
  href?: HTMLAttributeSource<string>;
  /**
   * Indicates the language of the linked resource. Allowed values are determined by BCP47. Use this attribute only if the href attribute is present.
   */
  hreflang?: HTMLAttributeSource<string>;
  /**
   * Define a names for the clickable area so that it can be scripted by older browsers.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * Indicates that no hyperlink exists for the associated area. Note: Since HTML5, omitting the href attribute is sufficient.
   */
  nohref?: HTMLAttributeSource<string>;
  /**
   * Contains a space-separated list of URLs to which, when the hyperlink is followed, POST requests with the body PING will be sent by the browser (in the background). Typically used for tracking.
   */
  ping?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * A string indicating which referrer to use when fetching the resource: no-referrer: The Referer header will not be sent. no-referrer-when-downgrade: The Referer header will not be sent to origins without TLS (HTTPS). origin: The sent referrer will be limited to the origin of the referring page: its scheme, host, and port. origin-when-cross-origin: The referrer sent to other origins will be limited to the scheme, the host, and the port. Navigations on the same origin will still include the path. same-origin: A referrer will be sent for same origin, but cross-origin requests will contain no referrer information. strict-origin: Only send the origin of the document as the referrer when the protocol security level stays the same (HTTPS→HTTPS), but don't send it to a less secure destination (HTTPS→HTTP). strict-origin-when-cross-origin (default): Send a full URL when performing a same-origin request, only send the origin when the protocol security level stays the same (HTTPS→HTTPS), and send no header to a less secure destination (HTTPS→HTTP). unsafe-url: The referrer will include the origin and the path (but not the fragment, password, or username). This value is unsafe, because it leaks origins and paths from TLS-protected resources to insecure origins.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * For anchors containing the href attribute, this attribute specifies the relationship of the target object to the link object. The value is a space-separated list of link types values. The values and their semantics will be registered by some authority that might have meaning to the document author. The default relationship, if no other is given, is void. Use this attribute only if the href attribute is present.
   */
  rel?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * The shape of the associated hot spot. The specifications for HTML defines the values rect, which defines a rectangular region; circle, which defines a circular region; poly, which defines a polygon; and default, which indicates the entire region beyond any defined shapes.
   */
  shape?: HTMLAttributeSource<"rect" | "circle" | "poly" | "default">;
  /**
   * A keyword or author-defined name of the browsing context to display the linked resource. The following keywords have special meanings: _self (default): Show the resource in the current browsing context. _blank: Show the resource in a new, unnamed browsing context. _parent: Show the resource in the parent browsing context of the current one, if the current page is inside a frame. If there is no parent, acts the same as _self. _top: Show the resource in the topmost browsing context (the browsing context that is an ancestor of the current one and has no parent). If there is no parent, acts the same as _self. Use this attribute only if the href attribute is present. Note: Setting target="_blank" on `<area>` elements implicitly provides the same rel behavior as setting rel="noopener" which does not set window.opener. See browser compatibility for support status.
   */
  target?: HTMLAttributeSource<string>;
  /**
   * Hint for the type of the referenced resource. Ignored by browsers.
   */
  type?: HTMLAttributeSource<string>;
}
interface AudioHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A Boolean attribute: if specified, the audio will automatically begin playback as soon as it can do so, without waiting for the entire audio file to finish downloading. Note: Sites that automatically play audio (or videos with an audio track) can be an unpleasant experience for users, so should be avoided when possible. If you must offer autoplay functionality, you should make it opt-in (requiring a user to specifically enable it). However, this can be useful when creating media elements whose source will be set at a later time, under user control. See our autoplay guide for additional information about how to properly use autoplay.
   */
  autoplay?: HTMLAttributeSource<boolean>;
  /**
   * If this attribute is present, the browser will offer controls to allow the user to control audio playback, including volume, seeking, and pause/resume playback.
   */
  controls?: HTMLAttributeSource<boolean>;
  /**
   * This enumerated attribute indicates whether to use CORS to fetch the related audio file. CORS-enabled resources can be reused in the `<canvas>` element without being tainted. The allowed values are: anonymous Sends a cross-origin request without a credential. In other words, it sends the Origin: HTTP header without a cookie, X.509 certificate, or performing HTTP Basic authentication. If the server does not give credentials to the origin site (by not setting the Access-Control-Allow-Origin: HTTP header), the image will be tainted, and its usage restricted. use-credentials Sends a cross-origin request with a credential. In other words, it sends the Origin: HTTP header with a cookie, a certificate, or performing HTTP Basic authentication. If the server does not give credentials to the origin site (through Access-Control-Allow-Credentials: HTTP header), the image will be tainted and its usage restricted. When not present, the resource is fetched without a CORS request (i.e. without sending the Origin: HTTP header), preventing its non-tainted used in `<canvas>` elements. If invalid, it is handled as if the enumerated keyword anonymous was used. See CORS settings attributes for additional information.
   */
  crossorigin?: HTMLAttributeSource<HTMLCrossorigin>;
  /**
   * A Boolean attribute used to disable the capability of remote playback in devices that are attached using wired (HDMI, DVI, etc.) and wireless technologies (Miracast, Chromecast, DLNA, AirPlay, etc). See this proposed specification for more information. Note: In Safari, you can use x-webkit-airplay="deny" as a fallback.
   */
  disableremoteplayback?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute: if specified, the audio player will automatically seek back to the start upon reaching the end of the audio.
   */
  loop?: HTMLAttributeSource<boolean>;
  /**
   * A Boolean attribute that indicates whether the audio will be initially silenced. Its default value is false.
   */
  muted?: HTMLAttributeSource<boolean>;
  /**
   * This enumerated attribute is intended to provide a hint to the browser about what the author thinks will lead to the best user experience. It may have one of the following values: none: Indicates that the audio should not be preloaded. metadata: Indicates that only audio metadata (e.g. length) is fetched. auto: Indicates that the whole audio file can be downloaded, even if the user is not expected to use it. empty string: A synonym of the auto value. The default value is different for each browser. The spec advises it to be set to metadata. The autoplay attribute has precedence over preload. If autoplay is specified, the browser would obviously need to start downloading the audio for playback. The browser is not forced by the specification to follow the value of this attribute; it is a mere hint.
   */
  preload?: HTMLAttributeSource<"none" | "metadata" | "auto" | "">;
  /**
   * The URL of the audio to embed. This is subject to HTTP access controls. This is optional; you may instead use the `<source>` element within the audio block to specify the audio to embed.
   */
  src?: HTMLAttributeSource<string>;
}
interface BaseHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The base URL to be used throughout the document for relative URLs. Absolute and relative URLs are allowed.
   */
  href?: HTMLAttributeSource<string>;
  /**
   * A keyword or author-defined name of the default browsing context to show the results of navigation from `<a>`, `<area>`, or `<form>` elements without explicit target attributes. The following keywords have special meanings: _self (default): Show the result in the current browsing context. _blank: Show the result in a new, unnamed browsing context. _parent: Show the result in the parent browsing context of the current one, if the current page is inside a frame. If there is no parent, acts the same as _self. _top: Show the result in the topmost browsing context (the browsing context that is an ancestor of the current one and has no parent). If there is no parent, acts the same as _self.
   */
  target?: HTMLAttributeSource<string>;
}
interface BasefontHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute sets the text color using either a named color or a color specified in the hexadecimal #RRGGBB format.
   */
  color?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a list of one or more font names. The document text in the default style is rendered in the first font face that the client's browser supports. If no font listed is installed on the local system, the browser typically defaults to the proportional or fixed-width font for that system.
   */
  face?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the font size as either a numeric or relative value. Numeric values range from 1 to 7 with 1 being the smallest and 3 the default.
   */
  size?: HTMLAttributeSource<string>;
}
interface BdoHTMLAttributes<T> extends HTMLAttributes<T> {}
interface BgsoundHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute defines a number between -10,000 and +10,000 that determines how the volume will be divided between the speakers.
   */
  balance?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the number of times a sound is to be played and either has a numeric value or the keyword infinite.
   */
  loop?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the URL of the sound file to be played, which must be one of the following types: .wav, .au, or .mid.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * This attribute defines a number between -10,000 and 0 that determines the loudness of a page's background sound.
   */
  volume?: HTMLAttributeSource<string>;
}
interface BlockquoteHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A URL that designates a source document or message for the information quoted. This attribute is intended to point to information explaining the context or the reference for the quote.
   */
  cite?: HTMLAttributeSource<string>;
}
interface BodyHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Color of text for hyperlinks when selected. This method is non-conforming, use CSS color property in conjunction with the :active pseudo-class instead.
   */
  alink?: HTMLAttributeSource<string>;
  /**
   * URI of a image to use as a background. This method is non-conforming, use CSS background property on the element instead.
   */
  background?: HTMLAttributeSource<string>;
  /**
   * Background color for the document. This method is non-conforming, use CSS background-color property on the element instead.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * The margin of the bottom of the body. This method is non-conforming, use CSS margin-bottom property on the element instead.
   */
  bottommargin?: HTMLAttributeSource<string>;
  /**
   * The margin of the left of the body. This method is non-conforming, use CSS margin-left property on the element instead.
   */
  leftmargin?: HTMLAttributeSource<string>;
  /**
   * Color of text for unvisited hypertext links. This method is non-conforming, use CSS color property in conjunction with the :link pseudo-class instead.
   */
  link?: HTMLAttributeSource<string>;
  /**
   * Function to call after the user has printed the document.
   */
  onafterprint?: EventHandler<T, Event>;
  /**
   * Function to call when the user requests printing of the document.
   */
  onbeforeprint?: EventHandler<T, Event>;
  /**
   * Function to call when the document is about to be unloaded.
   */
  onbeforeunload?: EventHandler<T, Event>;
  /**
   * Function to call when the fragment identifier part (starting with the hash ('#') character) of the document's current address has changed.
   */
  onhashchange?: EventHandler<T, Event>;
  /**
   * Function to call when the preferred languages changed.
   */
  onlanguagechange?: EventHandler<T, Event>;
  /**
   * Function to call when the document has received a message.
   */
  onmessage?: EventHandler<T, Event>;
  /** */
  onmessageerror?: EventHandler<T, Event>;
  /**
   * Function to call when network communication has failed.
   */
  onoffline?: EventHandler<T, Event>;
  /**
   * Function to call when network communication has been restored.
   */
  ononline?: EventHandler<T, Event>;
  /** */
  onpagehide?: EventHandler<T, Event>;
  /** */
  onpageshow?: EventHandler<T, Event>;
  /**
   * Function to call when the user has navigated session history.
   */
  onpopstate?: EventHandler<T, Event>;
  /**
   * Function to call when the user has moved forward in undo transaction history.
   */
  onredo?: EventHandler<T, Event>;
  /** */
  onrejectionhandled?: EventHandler<T, Event>;
  /**
   * Function to call when the storage area has changed.
   */
  onstorage?: EventHandler<T, Event>;
  /**
   * Function to call when the user has moved backward in undo transaction history.
   */
  onundo?: EventHandler<T, Event>;
  /** */
  onunhandledrejection?: EventHandler<T, Event>;
  /**
   * Function to call when the document is going away.
   */
  onunload?: EventHandler<T, Event>;
  /**
   * The margin of the right of the body. This method is non-conforming, use CSS margin-right property on the element instead.
   */
  rightmargin?: HTMLAttributeSource<string>;
  /**
   * Foreground color of text. This method is non-conforming, use CSS color property on the element instead.
   */
  text?: HTMLAttributeSource<string>;
  /**
   * The margin of the top of the body. This method is non-conforming, use CSS margin-top property on the element instead.
   */
  topmargin?: HTMLAttributeSource<string>;
  /**
   * Color of text for visited hypertext links. This method is non-conforming, use CSS color property in conjunction with the :visited pseudo-class instead.
   */
  vlink?: HTMLAttributeSource<string>;
}
interface BrHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Indicates where to begin the next line after the break.
   */
  clear?: HTMLAttributeSource<string>;
}
interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute on a `<button>` is nonstandard and Firefox-specific. Unlike other browsers, Firefox persists the dynamic disabled state of a `<button>` across page loads. Setting autocomplete="off" on the button disables this feature; see bug 654072.
   */
  autocomplete?: HTMLAttributeSource<HTMLAutocomplete>;
  /**
   * This Boolean attribute prevents the user from interacting with the button: it cannot be pressed or focused. Firefox, unlike other browsers, persists the dynamic disabled state of a `<button>` across page loads. Use the autocomplete attribute to control this feature.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * The `<form>` element to associate the button with (its form owner). The value of this attribute must be the id of a `<form>` in the same document. (If this attribute is not set, the `<button>` is associated with its ancestor `<form>` element, if any.) This attribute lets you associate `<button>` elements to `<form>`s anywhere in the document, not just inside a `<form>`. It can also override an ancestor `<form>` element.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The URL that processes the information submitted by the button. Overrides the action attribute of the button's form owner. Does nothing if there is no form owner.
   */
  formaction?: HTMLAttributeSource<string>;
  /**
   * If the button is a submit button (it's inside/associated with a `<form>` and doesn't have type="button"), specifies how to encode the form data that is submitted. Possible values: application/x-www-form-urlencoded: The default if the attribute is not used. multipart/form-data: Use to submit `<input>` elements with their type attributes set to file. text/plain: Specified as a debugging aid; shouldn’t be used for real form submission. If this attribute is specified, it overrides the enctype attribute of the button's form owner.
   */
  formenctype?: HTMLAttributeSource<
    "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain"
  >;
  /**
   * If the button is a submit button (it's inside/associated with a `<form>` and doesn't have type="button"), this attribute specifies the HTTP method used to submit the form. Possible values: post: The data from the form are included in the body of the HTTP request when sent to the server. Use when the form contains information that shouldn't be public, like login credentials. get: The form data are appended to the form's action URL, with a ? as a separator, and the resulting URL is sent to the server. Use this method when the form has no side effects, like search forms. If specified, this attribute overrides the method attribute of the button's form owner.
   */
  formmethod?: HTMLAttributeSource<HTMLFormMethod>;
  /**
   * If the button is a submit button, this Boolean attribute specifies that the form is not to be validated when it is submitted. If this attribute is specified, it overrides the novalidate attribute of the button's form owner. This attribute is also available on `<input type="image">` and `<input type="submit">` elements.
   */
  formnovalidate?: HTMLAttributeSource<boolean>;
  /**
   * If the button is a submit button, this attribute is a author-defined name or standardized, underscore-prefixed keyword indicating where to display the response from submitting the form. This is the name of, or keyword for, a browsing context (a tab, window, or `<iframe>`). If this attribute is specified, it overrides the target attribute of the button's form owner. The following keywords have special meanings: _self: Load the response into the same browsing context as the current one. This is the default if the attribute is not specified. _blank: Load the response into a new unnamed browsing context, usually a new tab or window, depending on the user's browser settings. _parent: Load the response into the parent browsing context of the current one. If there is no parent, this option behaves the same way as _self. _top: Load the response into the top-level browsing context (that is, the browsing context that is an ancestor of the current one, and has no parent). If there is no parent, this option behaves the same way as _self.
   */
  formtarget?: HTMLAttributeSource<string>;
  /**
   * The name of the button, submitted as a pair with the button's value as part of the form data, when that button is used to submit the form.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * The default behavior of the button. Possible values are: submit: The button submits the form data to the server. This is the default if the attribute is not specified for buttons associated with a `<form>`, or if the attribute is an empty or invalid value. reset: The button resets all the controls to their initial values, like `<input type="reset">`. (This behavior tends to annoy users.) button: The button has no default behavior, and does nothing when pressed by default. It can have client-side scripts listen to the element's events, which are triggered when the events occur.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * Defines the value associated with the button's name when it's submitted with the form data. This value is passed to the server in params when the form is submitted using this button.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The height of the coordinate space in CSS pixels. Defaults to 150.
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * Lets the canvas know whether or not translucency will be a factor. If the canvas knows there's no translucency, painting performance can be optimized. This is only supported by Mozilla-based browsers; use the standardized canvas.getContext('2d', { alpha: false }) instead.
   */
  "moz-opaque"?: HTMLAttributeSource<string>;
  /**
   * The width of the coordinate space in CSS pixels. Defaults to 300.
   */
  width?: HTMLAttributeSource<number | string>;
}
interface CaptionHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute indicates how the caption must be aligned with respect to the table. It may have one of the following values: left The caption is displayed to the left of the table. top The caption is displayed above the table. right The caption is displayed to the right of the table. bottom The caption is displayed below the table. Usage note: Do not use this attribute, as it has been deprecated. The `<caption>` element should be styled using the CSS properties caption-side and text-align.
   */
  align?: HTMLAttributeSource<string>;
}
interface ColHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute specifies how horizontal alignment of each column cell content will be handled. Possible values are: left, aligning the content to the left of the cell center, centering the content in the cell right, aligning the content to the right of the cell justify, inserting spaces into the textual content so that the content is justified in the cell If this attribute is not set, its value is inherited from the align of the `<colgroup>` element this `<col>` element belongs too. If there are none, the left value is assumed. Note: To achieve the same effect as the left, center, right or justify values: Do not try to set the text-align property on a selector giving a `<col>` element. Because `<td>` elements are not descendant of the `<col>` element, they won't inherit it. If the table doesn't use a colspan attribute, use the td:nth-child(an+b) CSS selector. Set a to zero and b to the position of the column in the table, e.g. td:nth-child(2) { text-align: right; } to right-align the second column. If the table does use a colspan attribute, the effect can be achieved by combining adequate CSS attribute selectors like [colspan=n], though this is not trivial.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * The background color of the table. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. To achieve a similar effect, use the CSS background-color property.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to set the character to align the cells in a column on. Typical values for this include a period (.) when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a positive integer indicating the number of consecutive columns the `<col>` element spans. If not present, its default value is 1.
   */
  span?: HTMLAttributeSource<number | string>;
  /**
   * This attribute specifies the vertical alignment of the text within each cell of the column. Possible values for this attribute are: baseline, which will put the text as close to the bottom of the cell as it is possible, but align it on the baseline of the characters instead of the bottom of them. If characters are all of the size, this has the same effect as bottom. bottom, which will put the text as close to the bottom of the cell as it is possible; middle, which will center the text in the cell; and top, which will put the text as close to the top of the cell as it is possible. Note: Do not try to set the vertical-align property on a selector giving a `<col>` element. Because `<td>` elements are not descendant of the `<col>` element, they won't inherit it. If the table doesn't use a colspan attribute, use the td:nth-child(an+b) CSS selector where a is the total number of the columns in the table and b is the ordinal position of the column in the table. Only after this selector the vertical-align property can be used. If the table does use a colspan attribute, the effect can be achieved by combining adequate CSS attribute selectors like [colspan=n], though this is not trivial.
   */
  valign?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies a default width for each column in the current column group. In addition to the standard pixel and percentage values, this attribute might take the special form 0*, which means that the width of each column in the group should be the minimum width necessary to hold the column's contents. Relative widths such as 5* also can be used.
   */
  width?: HTMLAttributeSource<string>;
}
interface ColgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute specifies how horizontal alignment of each column cell content will be handled. Possible values are: left, aligning the content to the left of the cell center, centering the content in the cell right, aligning the content to the right of the cell justify, inserting spaces into the textual content so that the content is justified in the cell char, aligning the textual content on a special character with a minimal offset, defined by the char and charoff attributes. If this attribute is not set, the left value is assumed. The descendant `<col>` elements may override this value using their own align attribute. Note: Do not try to set the text-align property on a selector giving a `<colgroup>` element. Because `<td>` elements are not descendant of the `<colgroup>` element, they won't inherit it. If the table doesn't use a colspan attribute, use one td:nth-child(an+b) CSS selector per column, where a is the total number of the columns in the table and b is the ordinal position of this column in the table. Only after this selector the text-align property can be used. If the table does use a colspan attribute, the effect can be achieved by combining adequate CSS attribute selectors like [colspan=n], though this is not trivial.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * The background color of the table. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. To achieve a similar effect, use the CSS background-color property.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the alignment of the content in a column group to a character. Typical values for this include a period (.) when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored, though it will still be used as the default value for the align of the `<col>` which are members of this column group.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to indicate the number of characters to offset the column data from the alignment character specified by the char attribute.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a positive integer indicating the number of consecutive columns the `<colgroup>` element spans. If not present, its default value is 1. Note: This attribute is applied on the attributes of the column group, it has no effect on the CSS styling rules associated with it or, even more, to the cells of the column's members of the group. The span attribute is not permitted if there are one or more `<col>` elements within the `<colgroup>`.
   */
  span?: HTMLAttributeSource<number | string>;
  /**
   * This attribute specifies the vertical alignment of the text within each cell of the column. Possible values for this attribute are: baseline, which will put the text as close to the bottom of the cell as it is possible, but align it on the baseline of the characters instead of the bottom of them. If characters are all of the size, this has the same effect as bottom. bottom, which will put the text as close to the bottom of the cell as it is possible; middle, which will center the text in the cell; and top, which will put the text as close to the top of the cell as it is possible. Note: Do not try to set the vertical-align property on a selector giving a `<colgroup>` element. Because `<td>` elements are not descendant of the `<colgroup>` element, they won't inherit it. If the table doesn't use a colspan attribute, use the td:nth-child(an+b) CSS selector per column, where a is the total number of the columns in the table and b is the ordinal position of the column in the table. Only after this selector the vertical-align property can be used. If the table does use a colspan attribute, the effect can be achieved by combining adequate CSS attribute selectors like [colspan=n], though this is not trivial.
   */
  valign?: HTMLAttributeSource<string>;
}
interface ContentHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A comma-separated list of selectors. These have the same syntax as CSS selectors. They select the content to insert in place of the `<content>` element.
   */
  select?: HTMLAttributeSource<string>;
}
interface DataHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute specifies the machine-readable translation of the content of the element.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface DdHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * If the value of this attribute is set to yes, the definition text will not wrap. The default value is no.
   */
  nowrap?: HTMLAttributeSource<string>;
}
interface DelHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A URI for a resource that explains the change (for example, meeting minutes).
   */
  cite?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the time and date of the change and must be a valid date string with an optional time. If the value cannot be parsed as a date with an optional time string, the element does not have an associated time stamp. For the format of the string without a time, see Date strings. The format of the string if it includes both date and time is covered in Local date and time strings.
   */
  datetime?: HTMLAttributeSource<string>;
}
interface DetailsHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This Boolean attribute indicates whether or not the details (that is, the contents of the `<details>` element) are currently visible. The details are shown when this attribute exists, or hidden when this attribute is absent. By default this attribute is absent which means the details are not visible. Note: You have to remove this attribute entirely to make the details hidden. open="false" makes the details visible because this attribute is Boolean.
   */
  open?: HTMLAttributeSource<boolean>;
}
interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Indicates that the dialog is active and can be interacted with. When the open attribute is not set, the dialog shouldn't be shown to the user.
   */
  open?: HTMLAttributeSource<boolean>;
}
interface DirHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This Boolean attribute hints that the list should be rendered in a compact style. The interpretation of this attribute depends on the user agent and it doesn't work in all browsers. Usage note: Do not use this attribute, as it has been deprecated: the `<dir>` element should be styled using CSS. To give a similar effect as that achieved with the compact attribute, the CSS property line-height can be used with a value of 80%.
   */
  compact?: HTMLAttributeSource<string>;
}
interface EmbedHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The displayed height of the resource, in CSS pixels. This must be an absolute value; percentages are not allowed.
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * The URL of the resource being embedded.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * The MIME type to use to select the plug-in to instantiate.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * The displayed width of the resource, in CSS pixels. This must be an absolute value; percentages are not allowed.
   */
  width?: HTMLAttributeSource<number | string>;
}
interface FieldsetHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * If this Boolean attribute is set, all form controls that are descendants of the `<fieldset>`, are disabled, meaning they are not editable and won't be submitted along with the `<form>`. They won't receive any browsing events, like mouse clicks or focus-related events. By default browsers display such controls grayed out. Note that form elements inside the `<legend>` element won't be disabled.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * This attribute takes the value of the id attribute of a `<form>` element you want the `<fieldset>` to be part of, even if it is not inside the form. Please note that usage of this is confusing: if you want the `<input>` elements inside the `<fieldset>` to be associated with the form, you need to use the form attribute directly on those elements. You can check which elements are associated with a form via JavaScript, using HTMLFormElement.elements.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The name associated with the group. Note: The caption for the fieldset is given by the first `<legend>` element nested inside it.
   */
  name?: HTMLAttributeSource<string>;
}
interface FontHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute sets the text color using either a named color or a color specified in the hexadecimal #RRGGBB format.
   */
  color?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a comma-separated list of one or more font names. The document text in the default style is rendered in the first font face that the client's browser supports. If no font listed is installed on the local system, the browser typically defaults to the proportional or fixed-width font for that system.
   */
  face?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the font size as either a numeric or relative value. Numeric values range from 1 to 7 with 1 being the smallest and 3 the default. It can be defined using a relative value, like +2 or -3, which set it relative to the value of the size attribute of the `<basefont>` element, or relative to 3, the default value, if none does exist.
   */
  size?: HTMLAttributeSource<string>;
}
interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Comma-separated content types the server accepts. Note: This attribute was removed in HTML5 and should not be used. Instead, use the accept attribute on `<input type=file>` elements.
   */
  accept?: HTMLAttributeSource<string>;
  /**
   * Space-separated character encodings the server accepts. The browser uses them in the order in which they are listed. The default value means the same encoding as the page. (In previous versions of HTML, character encodings could also be delimited by commas.)
   */
  "accept-charset"?: HTMLAttributeSource<string>;
  /**
   * The URL that processes the form submission. This value can be overridden by a formaction attribute on a `<button>`, `<input type="submit">`, or `<input type="image">` element.
   */
  action?: HTMLAttributeSource<string>;
  /**
   * Indicates whether input elements can by default have their values automatically completed by the browser. autocomplete attributes on form elements override it on `<form>`. Possible values: off: The browser may not automatically complete entries. (Browsers tend to ignore this for suspected login forms; see The autocomplete attribute and login fields.) on: The browser may automatically complete entries.
   */
  autocomplete?: HTMLAttributeSource<HTMLAutocomplete>;
  /**
   * If the value of the method attribute is post, enctype is the MIME type of the form submission. Possible values: application/x-www-form-urlencoded: The default value. multipart/form-data: Use this if the form contains `<input>` elements with type=file. text/plain: Introduced by HTML5 for debugging purposes. This value can be overridden by formenctype attributes on `<button>`, `<input type="submit">`, or `<input type="image">` elements.
   */
  enctype?: HTMLAttributeSource<HTMLFormEncType>;
  /**
   * The HTTP method to submit the form with. Possible (case insensitive) values: post: The POST method; form data sent as the request body. get: The GET method; form data appended to the action URL with a ? separator. Use this method when the form has no side-effects. dialog: When the form is inside a `<dialog>`, closes the dialog on submission. This value is overridden by formmethod attributes on `<button>`, `<input type="submit">`, or `<input type="image">` elements.
   */
  method?: HTMLAttributeSource<HTMLFormMethod>;
  /**
   * The name of the form. The value must not be the empty string, and must be unique among the form elements in the forms collection that it is in, if any.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that the form shouldn't be validated when submitted. If this attribute is not set (and therefore the form is validated), it can be overridden by a formnovalidate attribute on a `<button>`, `<input type="submit">`, or `<input type="image">` element belonging to the form.
   */
  novalidate?: HTMLAttributeSource<boolean>;
  /**
   * Creates a hyperlink or annotation depending on the value, see the rel attribute for details.
   */
  rel?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * Indicates where to display the response after submitting the form. In HTML 4, this is the name/keyword for a frame. In HTML5, it is a name/keyword for a browsing context (for example, tab, window, or iframe). The following keywords have special meanings: _self (default): Load into the same browsing context as the current one. _blank: Load into a new unnamed browsing context. _parent: Load into the parent browsing context of the current one. If no parent, behaves the same as _self. _top: Load into the top-level browsing context (i.e., the browsing context that is an ancestor of the current one and has no parent). If no parent, behaves the same as _self. This value can be overridden by a formtarget attribute on a `<button>`, `<input type="submit">`, or `<input type="image">` element. Note: Setting target="_blank" on `<form>` elements implicitly provides the same rel behavior as setting rel="noopener" which does not set window.opener.
   */
  target?: HTMLAttributeSource<string>;
}
interface FrameHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute allows you to specify a frame's border.
   */
  frameborder?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the height of the margin between frames.
   */
  marginheight?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the width of the margin between frames.
   */
  marginwidth?: HTMLAttributeSource<string>;
  /**
   * This attribute is used for labeling frames. Without labeling, every link will open in the frame that it's in – the closest parent frame. See the target attribute for more information.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * This attribute prevents resizing of frames by users.
   */
  noresize?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the existence of a scrollbar. If this attribute is not used, the browser adds a scrollbar when necessary. There are two choices: "yes" for forcing a scrollbar even when it is not necessary and "no" for forcing no scrollbar even when it is necessary.
   */
  scrolling?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the document that will be displayed by the frame.
   */
  src?: HTMLAttributeSource<string>;
}
interface FramesetHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute specifies the number and size of horizontal spaces in a frameset.
   */
  cols?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the number and size of vertical spaces in a frameset.
   */
  rows?: HTMLAttributeSource<string>;
}
interface HeadHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The URIs of one or more metadata profiles, separated by white space.
   */
  profile?: HTMLAttributeSource<string>;
}
interface HrHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Sets the alignment of the rule on the page. If no value is specified, the default value is left.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * Sets the color of the rule through color name or hexadecimal value.
   */
  color?: HTMLAttributeSource<string>;
  /**
   * Sets the rule to have no shading.
   */
  noshade?: HTMLAttributeSource<string>;
  /**
   * Sets the height, in pixels, of the rule.
   */
  size?: HTMLAttributeSource<string>;
  /**
   * Sets the length of the rule on the page through a pixel or percentage value.
   */
  width?: HTMLAttributeSource<string>;
}
interface HtmlHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Specifies the URI of a resource manifest indicating resources that should be cached locally. See Using the application cache for details.
   */
  manifest?: HTMLAttributeSource<string>;
  /**
   * Specifies the version of the HTML Document Type Definition that governs the current document. This attribute is not needed, because it is redundant with the version information in the document type declaration.
   */
  version?: HTMLAttributeSource<string>;
  /**
   * Specifies the XML Namespace of the document. Default value is "http://www.w3.org/1999/xhtml". This is required in documents parsed with XML parsers, and optional in text/html documents.
   */
  xmlns?: HTMLAttributeSource<string>;
}
interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The alignment of this element with respect to the surrounding context.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * Specifies a feature policy for the `<iframe>`. The policy defines what features are available to the `<iframe>` based on the origin of the request (e.g. access to the microphone, camera, battery, web-share API, etc.). For more information and examples see: Using Feature Policy > The iframe allow attribute.
   */
  allow?: HTMLAttributeSource<string>;
  /**
   * Set to true if the `<iframe>` can activate fullscreen mode by calling the requestFullscreen() method. This attribute is considered a legacy attribute and redefined as allow="fullscreen".
   */
  allowfullscreen?: HTMLAttributeSource<boolean>;
  /**
   * Set to true if a cross-origin `<iframe>` should be allowed to invoke the Payment Request API. This attribute is considered a legacy attribute and redefined as allow="payment".
   */
  allowpaymentrequest?: HTMLAttributeSource<boolean>;
  /**
   * A Content Security Policy enforced for the embedded resource. See HTMLIFrameElement.csp for details.
   */
  csp?: HTMLAttributeSource<string>;
  /**
   * The value 1 (the default) draws a border around this frame. The value 0 removes the border around this frame, but you should instead use the CSS property border to control `<iframe>` borders.
   */
  frameborder?: HTMLAttributeSource<string>;
  /**
   * The height of the frame in CSS pixels. Default is 150.
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * Indicates how the browser should load the iframe: eager: Load the iframe immediately, regardless if it is outside the visible viewport (this is the default value). lazy: Defer loading of the iframe until it reaches a calculated distance from the viewport, as defined by the browser.
   */
  loading?: HTMLAttributeSource<"eager" | "lazy">;
  /**
   * A URL of a long description of the frame's content. Due to widespread misuse, this is not helpful for non-visual browsers.
   */
  longdesc?: HTMLAttributeSource<string>;
  /**
   * The amount of space in pixels between the frame's content and its top and bottom borders.
   */
  marginheight?: HTMLAttributeSource<string>;
  /**
   * The amount of space in pixels between the frame's content and its left and right borders.
   */
  marginwidth?: HTMLAttributeSource<string>;
  /**
   * See bug 1318532 for exposing this to WebExtensions in Firefox. Makes the `<iframe>` act like a top-level browser window. See Browser API for details. Available only to WebExtensions.
   */
  mozbrowser?: HTMLAttributeSource<string>;
  /**
   * A targetable name for the embedded browsing context. This can be used in the target attribute of the `<a>`, `<form>`, or `<base>` elements; the formtarget attribute of the `<input>` or `<button>` elements; or the windowName parameter in the window.open() method.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * Indicates which referrer to send when fetching the frame's resource: no-referrer: The Referer header will not be sent. no-referrer-when-downgrade: The Referer header will not be sent to origins without TLS (HTTPS). origin: The sent referrer will be limited to the origin of the referring page: its scheme, host, and port. origin-when-cross-origin: The referrer sent to other origins will be limited to the scheme, the host, and the port. Navigations on the same origin will still include the path. same-origin: A referrer will be sent for same origin, but cross-origin requests will contain no referrer information. strict-origin: Only send the origin of the document as the referrer when the protocol security level stays the same (HTTPS→HTTPS), but don't send it to a less secure destination (HTTPS→HTTP). strict-origin-when-cross-origin (default): Send a full URL when performing a same-origin request, only send the origin when the protocol security level stays the same (HTTPS→HTTPS), and send no header to a less secure destination (HTTPS→HTTP). unsafe-url: The referrer will include the origin and the path (but not the fragment, password, or username). This value is unsafe, because it leaks origins and paths from TLS-protected resources to insecure origins.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * Applies extra restrictions to the content in the frame. The value of the attribute can either be empty to apply all restrictions, or space-separated tokens to lift particular restrictions: allow-downloads-without-user-activation : Allows for downloads to occur without a gesture from the user. allow-downloads: Allows for downloads to occur with a gesture from the user. allow-forms: Allows the resource to submit forms. If this keyword is not used, form submission is blocked. allow-modals: Lets the resource open modal windows. allow-orientation-lock: Lets the resource lock the screen orientation. allow-pointer-lock: Lets the resource use the Pointer Lock API. allow-popups: Allows popups (such as window.open(), target="_blank", or showModalDialog()). If this keyword is not used, the popup will silently fail to open. allow-popups-to-escape-sandbox: Lets the sandboxed document open new windows without those windows inheriting the sandboxing. For example, this can safely sandbox an advertisement without forcing the same restrictions upon the page the ad links to. allow-presentation: Lets the resource start a presentation session. allow-same-origin: If this token is not used, the resource is treated as being from a special origin that always fails the same-origin policy (potentially preventing access to data storage/cookies and some JavaScript APIs). allow-scripts: Lets the resource run scripts (but not create popup windows). allow-storage-access-by-user-activation : Lets the resource request access to the parent's storage capabilities with the Storage Access API. allow-top-navigation: Lets the resource navigate the top-level browsing context (the one named _top). allow-top-navigation-by-user-activation: Lets the resource navigate the top-level browsing context, but only if initiated by a user gesture. Notes about sandboxing: When the embedded document has the same origin as the embedding page, it is strongly discouraged to use both allow-scripts and allow-same-origin, as that lets the embedded document remove the sandbox attribute, making it no more secure than not using the sandbox attribute at all. Sandboxing is useless if the attacker can display content outside a sandboxed iframe, such as if the viewer opens the frame in a new tab. Such content should be also served from a separate origin to limit potential damage. The sandbox attribute is unsupported in Internet Explorer 9 and earlier.
   */
  sandbox?: HTMLAttributeSource<HTMLIframeSandbox>;
  /**
   * Indicates when the browser should provide a scrollbar for the frame: auto: Only when the frame's content is larger than its dimensions. yes: Always show a scrollbar. no: Never show a scrollbar.
   */
  scrolling?: HTMLAttributeSource<string>;
  /**
   * The URL of the page to embed. Use a value of about:blank to embed an empty page that conforms to the same-origin policy. Also note that programmatically removing an `<iframe>`'s src attribute (e.g. via Element.removeAttribute()) causes about:blank to be loaded in the frame in Firefox (from version 65), Chromium-based browsers, and Safari/iOS.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * Inline HTML to embed, overriding the src attribute. If a browser does not support the srcdoc attribute, it will fall back to the URL in the src attribute.
   */
  srcdoc?: HTMLAttributeSource<string>;
  /**
   * The width of the frame in CSS pixels. Default is 300.
   */
  width?: HTMLAttributeSource<number | string>;
}
interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Aligns the image with its surrounding context. Use the float and/or vertical-align CSS properties instead of this attribute. Allowed values: top Equivalent to vertical-align: top or vertical-align: text-top middle Equivalent to vertical-align: -moz-middle-with-baseline bottom The default, equivalent to vertical-align: unset or vertical-align: initial left Equivalent to float: left right Equivalent to float: right
   */
  align?: HTMLAttributeSource<string>;
  /**
   * Defines an alternative text description of the image. Note: Browsers do not always display images. There are a number of situations in which a browser might not display images, such as: Non-visual browsers (such as those used by people with visual impairments) The user chooses not to display images (saving bandwidth, privacy reasons) The image is invalid or an unsupported type In these cases, the browser may replace the image with the text in the element's alt attribute. For these reasons and others, provide a useful value for alt whenever possible. Omitting alt altogether indicates that the image is a key part of the content and no textual equivalent is available. Setting this attribute to an empty string (alt="") indicates that this image is not a key part of the content (it's decoration or a tracking pixel), and that non-visual browsers may omit it from rendering. Visual browsers will also hide the broken image icon if the alt is empty and the image failed to display. This attribute is also used when copying and pasting the image to text, or saving a linked image to a bookmark.
   */
  alt?: HTMLAttributeSource<string>;
  /**
   * The width of a border around the image. Use the border CSS property instead.
   */
  border?: HTMLAttributeSource<string>;
  /**
   * Indicates if the fetching of the image must be done using a CORS request. Image data from a CORS-enabled image returned from a CORS request can be reused in the `<canvas>` element without being marked "tainted". If the crossorigin attribute is not specified, then a non-CORS request is sent (without the Origin request header), and the browser marks the image as tainted and restricts access to its image data, preventing its usage in `<canvas>` elements. If the crossorigin attribute is specified, then a CORS request is sent (with the Origin request header); but if the server does not opt into allowing cross-origin access to the image data by the origin site (by not sending any Access-Control-Allow-Origin response header, or by not including the site's origin in any Access-Control-Allow-Origin response header it does send), then the browser blocks the image from loading, and logs a CORS error to the devtools console. Allowed values: anonymous A CORS request is sent with credentials omitted (that is, no cookies, X.509 certificates, or Authorization request header). use-credentials The CORS request is sent with any credentials included (that is, cookies, X.509 certificates, and the Authorization request header). If the server does not opt into sharing credentials with the origin site (by sending back the Access-Control-Allow-Credentials: true response header), then the browser marks the image as tainted and restricts access to its image data. If the attribute has an invalid value, browsers handle it as if the anonymous value was used. See CORS settings attributes for additional information.
   */
  crossorigin?: HTMLAttributeSource<HTMLCrossorigin>;
  /**
   * Provides an image decoding hint to the browser. Allowed values: sync Decode the image synchronously, for atomic presentation with other content. async Decode the image asynchronously, to reduce delay in presenting other content. auto Default: no preference for the decoding mode. The browser decides what is best for the user.
   */
  decoding?: HTMLAttributeSource<"sync" | "async" | "auto">;
  /**
   * The intrinsic height of the image, in pixels. Must be an integer without a unit.
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * The number of pixels of white space on the left and right of the image. Use the margin CSS property instead.
   */
  hspace?: HTMLAttributeSource<string>;
  /**
   * This attribute tells the browser to ignore the actual intrinsic size of the image and pretend it's the size specified in the attribute. Specifically, the image would raster at these dimensions and naturalWidth/naturalHeight on images would return the values specified in this attribute. Explainer, examples
   */
  intrinsicsize?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that the image is part of a server-side map. If so, the coordinates where the user clicked on the image are sent to the server. Note: Note: This attribute is allowed only if the `<img>` element is a descendant of an `<a>` element with a valid href attribute. This gives users without pointing devices a fallback destination.
   */
  ismap?: HTMLAttributeSource<boolean>;
  /**
   * Indicates how the browser should load the image: eager: Loads the image immediately, regardless of whether or not the image is currently within the visible viewport (this is the default value). lazy: Defers loading the image until it reaches a calculated distance from the viewport, as defined by the browser. The intent is to avoid the network and storage bandwidth needed to handle the image until it's reasonably certain that it will be needed. This generally improves the performance of the content in most typical use cases. Note: Loading is only deferred when JavaScript is enabled. This is an anti-tracking measure, because if a user agent supported lazy loading when scripting is disabled, it would still be possible for a site to track a user's approximate scroll position throughout a session, by strategically placing images in a page's markup such that a server can track how many images are requested and when.
   */
  loading?: HTMLAttributeSource<"eager" | "lazy">;
  /**
   * A link to a more detailed description of the image. Possible values are a URL or an element id. Note: This attribute is mentioned in the latest W3C version, HTML 5.2, but has been removed from the WHATWG's HTML Living Standard. It has an uncertain future; authors should use a WAI-ARIA alternative such as aria-describedby or aria-details.
   */
  longdesc?: HTMLAttributeSource<string>;
  /**
   * A name for the element. Use the id attribute instead.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * A string indicating which referrer to use when fetching the resource: no-referrer: The Referer header will not be sent. no-referrer-when-downgrade: The Referer header will not be sent to origins without TLS (HTTPS). origin: The sent referrer will be limited to the origin of the referring page: its scheme, host, and port. origin-when-cross-origin: The referrer sent to other origins will be limited to the scheme, the host, and the port. Navigations on the same origin will still include the path. same-origin: A referrer will be sent for same origin, but cross-origin requests will contain no referrer information. strict-origin: Only send the origin of the document as the referrer when the protocol security level stays the same (HTTPS→HTTPS), but don't send it to a less secure destination (HTTPS→HTTP). strict-origin-when-cross-origin (default): Send a full URL when performing a same-origin request, only send the origin when the protocol security level stays the same (HTTPS→HTTPS), and send no header to a less secure destination (HTTPS→HTTP). unsafe-url: The referrer will include the origin and the path (but not the fragment, password, or username). This value is unsafe, because it leaks origins and paths from TLS-protected resources to insecure origins.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * One or more strings separated by commas, indicating a set of source sizes. Each source size consists of: A media condition. This must be omitted for the last item in the list. A source size value. Media Conditions describe properties of the viewport, not of the image. For example, (max-height: 500px) 1000px proposes to use a source of 1000px width, if the viewport is not higher than 500px. Source size values specify the intended display size of the image. User agents use the current source size to select one of the sources supplied by the srcset attribute, when those sources are described using width (w) descriptors. The selected source size affects the intrinsic size of the image (the image's display size if no CSS styling is applied). If the srcset attribute is absent, or contains no values with a width descriptor, then the sizes attribute has no effect.
   */
  sizes?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * The image URL. Mandatory for the `<img>` element. On browsers supporting srcset, src is treated like a candidate image with a pixel density descriptor 1x, unless an image with this pixel density descriptor is already defined in srcset, or unless srcset contains w descriptors.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * One or more strings separated by commas, indicating possible image sources for the user agent to use. Each string is composed of: A URL to an image Optionally, whitespace followed by one of: A width descriptor (a positive integer directly followed by w). The width descriptor is divided by the source size given in the sizes attribute to calculate the effective pixel density. A pixel density descriptor (a positive floating point number directly followed by x). If no descriptor is specified, the source is assigned the default descriptor of 1x. It is incorrect to mix width descriptors and pixel density descriptors in the same srcset attribute. Duplicate descriptors (for instance, two sources in the same srcset which are both described with 2x) are also invalid. The user agent selects any of the available sources at its discretion. This provides them with significant leeway to tailor their selection based on things like user preferences or bandwidth conditions. See our Responsive images tutorial for an example.
   */
  srcset?: HTMLAttributeSource<string>;
  /**
   * The partial URL (starting with #) of an image map associated with the element. Note: You cannot use this attribute if the `<img>` element is inside an `<a>` or `<button>` element.
   */
  usemap?: HTMLAttributeSource<string>;
  /**
   * The number of pixels of white space above and below the image. Use the margin CSS property instead.
   */
  vspace?: HTMLAttributeSource<string>;
  /**
   * The intrinsic width of the image in pixels. Must be an integer without a unit.
   */
  width?: HTMLAttributeSource<number | string>;
}
interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Valid for the file input type only, the accept attribute defines which file types are selectable in a file upload control. See the file input type.
   */
  accept?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * Valid for the image button only, the alt attribute provides alternative text for the image, displaying the value of the attribute if the image scr is missing or otherwise fails to load. See the image input type.
   */
  alt?: HTMLAttributeSource<string>;
  /**
   * (Not a Boolean attribute!) The autocomplete attribute takes as its value a space-separated string that describes what, if any, type of autocomplete functionality the input should provide. A typical implementation of autocomplete recalls previous values entered in the same input field, but more complex forms of autocomplete can exist. For instance, a browser could integrate with a device's contacts list to autocomplete email addresses in an email input field. See Values in The HTML autocomplete attribute for permitted values. The autocomplete attribute is valid on hidden, text, search, url, tel, email, date, month, week, time, datetime-local, number, range, color, and password. This attribute has no effect on input types that do not return numeric or text data, being valid for all input types except checkbox, radio, file, or any of the button types. See The HTML autocomplete attribute for additional information, including information on password security and how autocomplete is slightly different for hidden than for other input types.
   */
  autocomplete?: HTMLAttributeSource<HTMLAutocomplete>;
  /**
   * A Safari extension, the autocorrect attribute is a string which indicates whether or not to activate automatic correction while the user is editing this field. Permitted values are: on Enable automatic correction of typos, as well as processing of text substitutions if any are configured. off Disable automatic correction and text substitutions.
   */
  autocorrect?: HTMLAttributeSource<string>;
  /**
   * Introduced in the HTML Media Capture specification and valid for the file input type only, the capture attribute defines which media (microphone, video, or camera) should be used to capture a new file for upload with file upload control in supporting scenarios. See the file input type.
   */
  capture?: HTMLAttributeSource<string>;
  /**
   * Valid for both radio and checkbox types, checked is a Boolean attribute. If present on a radio type, it indicates that the radio button is the currently selected one in the group of same-named radio buttons. If present on a checkbox type, it indicates that the checkbox is checked by default (when the page loads). It does not indicate whether this checkbox is currently checked: if the checkbox's state is changed, this content attribute does not reflect the change. (Only the HTMLInputElement's checked IDL attribute is updated.) Note: Unlike other input controls, a checkboxes and radio buttons value are only included in the submitted data if they are currently checked. If they are, the name and the value(s) of the checked controls are submitted. For example, if a checkbox whose name is fruit has a value of cherry, and the checkbox is checked, the form data submitted will include fruit=cherry. If the checkbox isn't active, it isn't listed in the form data at all. The default value for checkboxes and radio buttons is on.
   */
  checked?: HTMLAttributeSource<boolean>;
  /**
   * Valid for text and search input types only, the dirname attribute enables the submission of the directionality of the element. When included, the form control will submit with two name/value pairs: the first being the name and value, the second being the value of the dirname as the name with the value of ltr or rtl being set by the browser. `<form action="page.html" method="post">` `<label>`Fruit: `<input type="text" name="fruit" dirname="fruit.dir" value="cherry">``</label>` `<input type="submit"/>` `</form>` `<!-- page.html?fruit=cherry&amp;fruit.dir=ltr -->` When the form above is submitted, the input cause both the name / value pair of fruit=cherry and the dirname / direction pair of fruit.dir=ltr to be sent.
   */
  dirname?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute which, if present, indicates that the user should not be able to interact with the input. Disabled inputs are typically rendered with a dimmer color or using some other form of indication that the field is not available for use. Specifically, disabled inputs do not receive the click event, and disabled inputs are not submitted with the form. Note: Although not required by the specification, Firefox will by default persist the dynamic disabled state of an `<input>` across page loads. Use the autocomplete attribute to control this feature.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * A string specifying the `<form>` element with which the input is associated (that is, its form owner). This string's value, if present, must match the id of a `<form>` element in the same document. If this attribute isn't specified, the `<input>` element is associated with the nearest containing form, if any. The form attribute lets you place an input anywhere in the document but have it included with a form elsewhere in the document. Note: An input can only be associated with one form.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * Valid for the image and submit input types only. See the submit input type for more information.
   */
  formaction?: HTMLAttributeSource<string>;
  /**
   * Valid for the image and submit input types only. See the submit input type for more information.
   */
  formenctype?: HTMLAttributeSource<
    "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain"
  >;
  /**
   * Valid for the image and submit input types only. See the submit input type for more information.
   */
  formmethod?: HTMLAttributeSource<HTMLFormMethod>;
  /**
   * Valid for the image and submit input types only. See the submit input type for more information.
   */
  formnovalidate?: HTMLAttributeSource<boolean>;
  /**
   * Valid for the image and submit input types only. See the submit input type for more information.
   */
  formtarget?: HTMLAttributeSource<string>;
  /**
   * Valid for the image input button only, the height is the height of the image file to display to represent the graphical submit button. See the image input type.
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * The Boolean attribute incremental is a WebKit and Blink extension (so supported by Safari, Opera, Chrome, etc.) which, if present, tells the user agent to process the input as a live search. As the user edits the value of the field, the user agent sends search events to the HTMLInputElement object representing the search box. This allows your code to update the search results in real time as the user edits the search.If incremental is not specified, the search event is only sent when the user explicitly initiates a search (such as by pressing the Enter or Return key while editing the field).The search event is rate-limited so that it is not sent more frequently than an implementation-defined interval.
   */
  incremental?: HTMLAttributeSource<string>;
  /**
   * The value given to the list attribute should be the id of a `<datalist>` element located in the same document. The `<datalist>` provides a list of predefined values to suggest to the user for this input. Any values in the list that are not compatible with the type are not included in the suggested options. The values provided are suggestions, not requirements: users can select from this predefined list or provide a different value. `<datalist id="colorsxx">` `<option>`#ff0000`</option>` `<option>`#ee0000`</option>` `<option>`#dd0000`</option>` `<option>`#cc0000`</option>` `<option>`#bb0000`</option>` `</datalist>` `<datalist id="numbersxx">` `<option>`0`</option>` `<option>`2`</option>` `<option>`4`</option>` `<option>`8`</option>` `<option>`16`</option>` `<option>`32`</option>` `<option>`64`</option>` `</datalist>` `<datalist id="fruitsxx">` `<option>`cherry`</option>` `<option>`banana`</option>` `<option>`mango`</option>` `<option>`orange`</option>` `<option>`blueberry`</option>` `</datalist>` `<datalist id="urlsxx">` `<option>`https://developer.mozilla.org`</option>` `<option>`https://caniuse.com/`</option>` `<option>`https://mozilla.com`</option>` `<option>`https://mdn.github.io`</option>` `<option>`https://www.youtube.com/user/firefoxchannel`</option>` `</datalist>` `<p>``<label for="textx">`Text`</label>` `<input type="text" list="fruitsxx" id="textx"/>``</p>` `<p>``<label for="colorx">`Color`</label>` `<input type="color" list="colorsxx" id="colorx"/>``</p>` `<p>``<label for="rangex">`Range`</label>` `<input type="range" min="0" max="64" list="numbersxx" id="rangex"/>``</p>` `<p>``<label for="numberx">`Number`</label>` `<input type="number" min="0" max="64" list="numbersxx" id="numberx"/>``</p>` `<p>``<label for="urlx">`URL`</label>` `<input type="url" list="urlsxx" id="urlx"/>``</p>` It is valid on text, search, url, tel, email, date, month, week, time, datetime-local, number, range, and color. Per the specifications, the list attribute is not supported by the hidden, password, checkbox, radio, file, or any of the button types. Depending on the browser, the user may see a custom color palette suggested, tic marks along a range, or even a input that opens like a `<select>` but allows for non-listed values. Check out the browser compatibility table for the other input types. See the `<datalist>` element.
   */
  list?: HTMLAttributeSource<string>;
  /**
   * Valid for date, month, week, time, datetime-local, number, and range, it defines the greatest value in the range of permitted values. If the value entered into the element exceeds this, the element fails constraint validation. If the value of the max attribute isn't a number, then the element has no maximum value. There is a special case: if the data type is periodic (such as for dates or times), the value of max may be lower than the value of min, which indicates that the range may wrap around; for example, this allows you to specify a time range from 10 PM to 4 AM.
   */
  max?: HTMLAttributeSource<number | string>;
  /**
   * Valid for text, search, url, tel, email, and password, it defines the maximum number of characters (as UTF-16 code units) the user can enter into the field. This must be an integer value 0 or higher. If no maxlength is specified, or an invalid value is specified, the field has no maximum length. This value must also be greater than or equal to the value of minlength. The input will fail constraint validation if the length of the text entered into the field is greater than maxlength UTF-16 code units long. By default, browsers prevent users from entering more characters than allowed by the maxlength attribute. See Client-side validation for more information.
   */
  maxlength?: HTMLAttributeSource<number | string>;
  /**
   * Valid for date, month, week, time, datetime-local, number, and range, it defines the most negative value in the range of permitted values. If the value entered into the element is less than this this, the element fails constraint validation. If the value of the min attribute isn't a number, then the element has no minimum value. This value must be less than or equal to the value of the max attribute. If the min attribute is present but is not specified or is invalid, no min value is applied. If the min attribute is valid and a non-empty value is less than the minimum allowed by the min attribute, constraint validation will prevent form submission. See Client-side validation for more information. There is a special case: if the data type is periodic (such as for dates or times), the value of max may be lower than the value of min, which indicates that the range may wrap around; for example, this allows you to specify a time range from 10 PM to 4 AM.
   */
  min?: HTMLAttributeSource<number | string>;
  /**
   * Valid for text, search, url, tel, email, and password, it defines the minimum number of characters (as UTF-16 code units) the user can enter into the entry field. This must be an non-negative integer value smaller than or equal to the value specified by maxlength. If no minlength is specified, or an invalid value is specified, the input has no minimum length. The input will fail constraint validation if the length of the text entered into the field is fewer than minlength UTF-16 code units long, preventing form submission. See Client-side validation for more information.
   */
  minlength?: HTMLAttributeSource<number | string>;
  /**
   * A Mozilla extension, supported by Firefox for Android, which provides a hint as to what sort of action will be taken if the user presses the Enter or Return key while editing the field. This information is used to decide what kind of label to use on the Enter key on the virtual keyboard. Note: This has been standardized as the global attribute enterkeyhint, but is not yet widely implemented. To see the status of the change being implemented in Firefox, see bug 1490661. Permitted values are: go, done, next, search, and send. The browser decides, using this hint, what label to put on the enter key.
   */
  mozactionhint?: HTMLAttributeSource<string>;
  /**
   * The Boolean multiple attribute, if set, means the user can enter comma separated email addresses in the email widget or can choose more than one file with the file input. See the email and file input type.
   */
  multiple?: HTMLAttributeSource<boolean>;
  /**
   * A string specifying a name for the input control. This name is submitted along with the control's value when the form data is submitted. Consider the name a required attribute (even though it's not). If an input has no name specified, or name is empty, the input's value is not submitted with the form! (Disabled controls, unchecked radio buttons, unchecked checkboxes, and reset buttons are also not sent.) There are two special cases: _charset_ : If used as the name of an `<input>` element of type hidden, the input's value is automatically set by the user agent to the character encoding being used to submit the form. isindex: For historical reasons, the name isindex is not allowed. The name attribute creates a unique behavior for radio buttons. Only one radio button in a same-named group of radio buttons can be checked at a time. Selecting any radio button in that group automatically deselects any currently-selected radio button in the same group. The value of that one checked radio button is sent along with the name if the form is submitted, When tabbing into a series of same-named group of radio buttons, if one is checked, that one will receive focus. If they aren't grouped together in source order, if one of the group is checked, tabbing into the group starts when the first one in the group is encountered, skipping all those that aren't checked. In other words, if one is checked, tabbing skips the unchecked radio buttons in the group. If none are checked, the radio button group receives focus when the first button in the same name group is reached. Once one of the radio buttons in a group has focus, using the arrow keys will navigate through all the radio buttons of the same name, even if the radio buttons are not grouped together in the source order. When an input element is given a name, that name becomes a property of the owning form element's HTMLFormElement.elements property. If you have an input whose name is set to guest and another whose name is hat-size, the following code can be used: let form = document.querySelector("form"); let guestName = form.elements.guest; let hatSize = form.elements["hat-size"]; When this code has run, guestName will be the HTMLInputElement for the guest field, and hatSize the object for the hat-size field. Warning: Avoid giving form elements a name that corresponds to a built-in property of the form, since you would then override the predefined property or method with this reference to the corresponding input.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * `<progress>``<meter>`orienthorizontalvertical
   */
  orient?: HTMLAttributeSource<string>;
  /**
   * The pattern attribute, when specified, is a regular expression that the input's value must match in order for the value to pass constraint validation. It must be a valid JavaScript regular expression, as used by the RegExp type, and as documented in our guide on regular expressions; the 'u' flag is specified when compiling the regular expression, so that the pattern is treated as a sequence of Unicode code points, instead of as ASCII. No forward slashes should be specified around the pattern text. If the pattern attribute is present but is not specified or is invalid, no regular expression is applied and this attribute is ignored completely. If the pattern attribute is valid and a non-empty value does not match the pattern, constraint validation will prevent form submission. Note: If using the pattern attribute, inform the user about the expected format by including explanatory text nearby. You can also include a title attribute to explain what the requirements are to match the pattern; most browsers will display this title as a tooltip. The visible explanation is required for accessibility. The tooltip is an enhancement. See Client-side validation for more information.
   */
  pattern?: HTMLAttributeSource<string>;
  /**
   * The placeholder attribute is a string that provides a brief hint to the user as to what kind of information is expected in the field. It should be a word or short phrase that provides a hint as to the expected type of data, rather than an explanation or prompt. The text must not include carriage returns or line feeds. So for example if a field is expected to capture a user's first name, and its label is "First Name", a suitable placeholder might be "e.g. Mustafa". Note: The placeholder attribute is not as semantically useful as other ways to explain your form, and can cause unexpected technical issues with your content. See Labels for more information.
   */
  placeholder?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute which, if present, indicates that the user should not be able to edit the value of the input. The readonly attribute is supported by the text, search, url, tel, email, date, month, week, time, datetime-local, number, and password input types. See the HTML attribute: readonly for more information.
   */
  readonly?: HTMLAttributeSource<boolean>;
  /**
   * required is a Boolean attribute which, if present, indicates that the user must specify a value for the input before the owning form can be submitted. The required attribute is supported by text, search, url, tel, email, date, month, week, time, datetime-local, number, password, checkbox, radio, and file inputs. See Client-side validation and the HTML attribute: required for more information.
   */
  required?: HTMLAttributeSource<boolean>;
  /**
   * The results attribute (supported only by Safari) is a numeric value that lets you override the maximum number of entries to be displayed in the `<input>` element's natively-provided drop-down menu of previous search queries.The value must be a non-negative decimal number. If not provided, or an invalid value is given, the browser's default maximum number of entries is used.
   */
  results?: HTMLAttributeSource<string>;
  /**
   * Valid for email, password, tel, and text input types only. Specifies how much of the input is shown. Basically creates same result as setting CSS width property with a few specialities. The actual unit of the value depends on the input type. For password and text, it is a number of characters (or em units) with a default value of 20, and for others, it is pixels. CSS width takes precedence over size attribute.
   */
  size?: HTMLAttributeSource<number | string>;
  /**
   * Valid for the image input button only, the src is string specifying the URL of the image file to display to represent the graphical submit button. See the image input type.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * Valid for the numeric input types, including number, date/time input types, and range, the step attribute is a number that specifies the granularity that the value must adhere to. If not explicitly included: step defaults to 1 for number and range. For the date/time input types, step is expressed in seconds, with the default step being 60 seconds. The step scale factor is 1000 (which converts the seconds to milliseconds, as used in other algorithms). The value must be a positive number (integer or float) or the special value any, which means no stepping is implied, and any value is allowed (barring other constraints, such as min and max). If any is not explicity set, valid values for the number, date/time input types, and range input types are equal to the basis for stepping: the min value and increments of the step value, up to the max value, if specified. For example, if you have `<input type="number" min="10" step="2">`, then any even integer, 10 or greater, is valid. If omitted, `<input type="number">`, any integer is valid, but floats (like 4.2) are not valid, because step defaults to 1. For 4.2 to be valid, step would have had to be set to any, 0.1, 0.2, or any the min value would have had to be a number ending in .2, such as `<input type="number" min="-5.2">` Note: When the data entered by the user doesn't adhere to the stepping configuration, the value is considered invalid in contraint validation and will match the :invalid pseudoclass. See Client-side validation for more information.
   */
  step?: HTMLAttributeSource<number | string>;
  /**
   * A string specifying the type of control to render. For example, to create a checkbox, a value of checkbox is used. If omitted (or an unknown value is specified), the input type text is used, creating a plaintext input field. Permitted values are listed in Input types above.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * The input control's value. When specified in the HTML, this is the initial value, and from then on it can be altered or retrieved at any time using JavaScript to access the respective HTMLInputElement object's value property. The value attribute is always optional, though should be considered mandatory for checkbox, radio, and hidden.
   */
  value?: HTMLAttributeSource<number | string>;
  /**
   * {{page("/en-US/docs/Web/HTML/Element/input/file", "webkitdirectory-include")}}
   */
  webkitdirectory?: HTMLAttributeSource<string>;
  /**
   * Valid for the image input button only, the width is the width of the image file to display to represent the graphical submit button. See the image input type.
   */
  width?: HTMLAttributeSource<number | string>;
}
interface InsHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute defines the URI of a resource that explains the change, such as a link to meeting minutes or a ticket in a troubleshooting system.
   */
  cite?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the time and date of the change and must be a valid date with an optional time string. If the value cannot be parsed as a date with an optional time string, the element does not have an associated time stamp. For the format of the string without a time, see Format of a valid date string. The format of the string if it includes both date and time is covered in Format of a valid local date and time string.
   */
  datetime?: HTMLAttributeSource<string>;
}
interface KeygenHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A challenge string that is submitted along with the public key. Defaults to an empty string if not specified.
   */
  challenge?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that the form control is not available for interaction.
   */
  disabled?: HTMLAttributeSource<string>;
  /**
   * The form element that this element is associated with (its form owner). The value of the attribute must be an id of a `<form>` element in the same document. If this attribute is not specified, this element must be a descendant of a `<form>` element. This attribute enables you to place `<keygen>` elements anywhere within a document, not just as descendants of their form elements.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The type of key generated. The default value is RSA.
   */
  keytype?: HTMLAttributeSource<string>;
  /**
   * The name of the control, which is submitted with the form data.
   */
  name?: HTMLAttributeSource<string>;
}
interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The value of the for attribute must be a single id for a labelable form-related element in the same document as the `<label>` element. So, any given label element can be associated with only one form control. The first element in the document with an id attribute matching the value of the for attribute is the labeled control for this label element. If the element with that id is actually a labelable element. If it is not a labelable element, then the for attribute has no effect. If there are other elements that also match the id value, later in the document, they are not considered. Multiple label elements can be given the same value for their for attribute; doing so causes the associated form control (the form control that for value references) to have multiple labels. Note: A `<label>` element can have both a for attribute and a contained control element, as long as the for attribute points to the contained control element.
   */
  for?: HTMLAttributeSource<string>;
  /** */
  form?: HTMLAttributeSource<string>;
}
interface LiHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This character attribute indicates the numbering type: a: lowercase letters A: uppercase letters i: lowercase Roman numerals I: uppercase Roman numerals 1: numbers This type overrides the one used by its parent `<ol>` element, if any. Note: This attribute has been deprecated; use the CSS list-style-type property instead.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * This integer attribute indicates the current ordinal value of the list item as defined by the `<ol>` element. The only allowed value for this attribute is a number, even if the list is displayed with Roman numerals or letters. List items that follow this one continue numbering from the value set. The value attribute has no meaning for unordered lists (`<ul>`) or for menus (`<menu>`). Note: This attribute was deprecated in HTML4, but reintroduced in HTML5.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute is only used when rel="preload" or rel="prefetch" has been set on the `<link>` element. It specifies the type of content being loaded by the `<link>`, which is necessary for request matching, application of correct content security policy, and setting of correct Accept request header. Furthermore, rel="preload" uses this as a signal for request prioritization. The table below lists the valid values for this attribute and the elements or resources they apply to. Value Applies To audio `<audio>` elements document `<iframe>` and `<frame>` elements embed `<embed>` elements fetch fetch, XHR This value also requires `<link>` to contain the crossorigin attribute. font CSS @font-face image `<img>` and `<picture>` elements with srcset or imageset attributes, SVG `<image>` elements, CSS *-image rules object `<object>` elements script `<script>` elements, Worker importScripts style `<link rel=stylesheet>` elements, CSS @import track `<track>` elements video `<video>` elements worker Worker, SharedWorker
   */
  as?: HTMLAttributeSource<HTMLLinkAs>;
  /**
   * This attribute defines the character encoding of the linked resource. The value is a space- and/or comma-delimited list of character sets as defined in RFC 2045. The default value is iso-8859-1. Usage note: To produce the same effect as this obsolete attribute, use the Content-Type HTTP header on the linked resource.
   */
  charset?: HTMLAttributeSource<string>;
  /** */
  color?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute indicates whether CORS must be used when fetching the resource. CORS-enabled images can be reused in the `<canvas>` element without being tainted. The allowed values are: anonymous A cross-origin request (i.e. with an Origin HTTP header) is performed, but no credential is sent (i.e. no cookie, X.509 certificate, or HTTP Basic authentication). If the server does not give credentials to the origin site (by not setting the Access-Control-Allow-Origin HTTP header) the resource will be tainted and its usage restricted. use-credentials A cross-origin request (i.e. with an Origin HTTP header) is performed along with a credential sent (i.e. a cookie, certificate, and/or HTTP Basic authentication is performed). If the server does not give credentials to the origin site (through Access-Control-Allow-Credentials HTTP header), the resource will be tainted and its usage restricted. If the attribute is not present, the resource is fetched without a CORS request (i.e. without sending the Origin HTTP header), preventing its non-tainted usage. If invalid, it is handled as if the enumerated keyword anonymous was used. See CORS settings attributes for additional information.
   */
  crossorigin?: HTMLAttributeSource<HTMLCrossorigin>;
  /**
   * For rel="stylesheet" only, the disabled Boolean attribute indicates whether or not the described stylesheet should be loaded and applied to the document. If disabled is specified in the HTML when it is loaded, the stylesheet will not be loaded during page load. Instead, the stylesheet will be loaded on-demand, if and when the disabled attribute is changed to false or removed. Setting the disabled property in the DOM causes the stylesheet to be removed from the document's Document.styleSheets list.
   */
  disabled?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the URL of the linked resource. A URL can be absolute or relative.
   */
  href?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the language of the linked resource. It is purely advisory. Allowed values are determined by BCP47. Use this attribute only if the href attribute is present.
   */
  hreflang?: HTMLAttributeSource<string>;
  /**
   * For rel="preload" and as="image" only, the imagesizes attribute is a sizes attribute that indicates to preload the appropriate resource used by an img element with corresponding values for its srcset and sizes attributes.
   */
  imagesizes?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * For rel="preload" and as="image" only, the imagesrcset attribute is a sourceset attribute that indicates to preload the appropriate resource used by an img element with corresponding values for its srcset and sizes attributes.
   */
  imagesrcset?: HTMLAttributeSource<string>;
  /**
   * Contains inline metadata: a base64-encoded cryptographic hash of the resource (file) you're telling the browser to fetch. The browser can use this to verify that the fetched resource has been delivered free of unexpected manipulation. See Subresource Integrity.
   */
  integrity?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the media that the linked resource applies to. Its value must be a media type / media query. This attribute is mainly useful when linking to external stylesheets: it allows the user agent to pick the best adapted one for the device it runs on. Notes: In HTML 4, this can only be a simple white-space-separated list of media description literals, i.e., media types and groups, where defined and allowed as values for this attribute, such as print, screen, aural, braille. HTML5 extended this to any kind of media queries, which are a superset of the allowed values of HTML 4. Browsers not supporting CSS3 Media Queries won't necessarily recognize the adequate link; do not forget to set fallback links, the restricted set of media queries defined in HTML 4.
   */
  media?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * The value of this attribute provides information about the functions that might be performed on an object. The values generally are given by the HTTP protocol when it is used, but it might (for similar reasons as for the title attribute) be useful to include advisory information in advance in the link. For example, the browser might choose a different rendering of a link as a function of the methods specified; something that is searchable might get a different icon, or an outside link might render with an indication of leaving the current site. This attribute is not well understood nor supported, even by the defining browser, Internet Explorer 4.
   */
  methods?: HTMLAttributeSource<string>;
  /**
   * Identifies a resource that might be required by the next navigation and that the user agent should retrieve it. This allows the user agent to respond faster when the resource is requested in the future.
   */
  prefetch?: HTMLAttributeSource<string>;
  /**
   * A string indicating which referrer to use when fetching the resource: no-referrer means that the Referer header will not be sent. no-referrer-when-downgrade means that no Referer header will be sent when navigating to an origin without TLS (HTTPS). This is a user agent's default behavior, if no policy is otherwise specified. origin means that the referrer will be the origin of the page, which is roughly the scheme, the host, and the port. origin-when-cross-origin means that navigating to other origins will be limited to the scheme, the host, and the port, while navigating on the same origin will include the referrer's path. unsafe-url means that the referrer will include the origin and the path (but not the fragment, password, or username). This case is unsafe because it can leak origins and paths from TLS-protected resources to insecure origins.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * This attribute names a relationship of the linked document to the current document. The attribute must be a space-separated list of link type values.
   */
  rel?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * The value of this attribute shows the relationship of the current document to the linked document, as defined by the href attribute. The attribute thus defines the reverse relationship compared to the value of the rel attribute. Link type values for the attribute are similar to the possible values for rel. Note: This attribute is considered obsolete by the WHATWG HTML living standard (which is the specification MDN treats as canonical). However, it's worth noting that rev is not considered obsolete in the W3C specification. That said, given the uncertainty, relying on rev is unwise. Instead, you should use the rel attribute with the opposite link type value. For example, to establish the reverse link for made, specify author. Also this attribute doesn't stand for "revision" and must not be used with a version number, even though many sites misuse it in this way.
   */
  rev?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the sizes of the icons for visual media contained in the resource. It must be present only if the rel contains a value of icon or a non-standard type such as Apple's apple-touch-icon. It may have the following values: any, meaning that the icon can be scaled to any size as it is in a vector format, like image/svg+xml. a white-space separated list of sizes, each in the format `<width in pixels>`x`<height in pixels>` or `<width in pixels>`X`<height in pixels>`. Each of these sizes must be contained in the resource. Note: Most icon formats are only able to store one single icon; therefore most of the time the sizes attribute contains only one entry. MS's ICO format does, as well as Apple's ICNS. ICO is more ubiquitous, so you should use this format if cross-browser support is a concern (especially for old IE versions).
   */
  sizes?: HTMLAttributeSource<string>;
  /**
   * Defines the frame or window name that has the defined linking relationship or that will show the rendering of any linked resource.
   */
  target?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to define the type of the content linked to. The value of the attribute should be a MIME type such as text/html, text/css, and so on. The common use of this attribute is to define the type of stylesheet being referenced (such as text/css), but given that CSS is the only stylesheet language used on the web, not only is it possible to omit the type attribute, but is actually now recommended practice. It is also used on rel="preload" link types, to make sure the browser only downloads file types that it supports.
   */
  type?: HTMLAttributeSource<string>;
}
interface MapHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The name attribute gives the map a name so that it can be referenced. The attribute must be present and must have a non-empty value with no space characters. The value of the name attribute must not be equal to the value of the name attribute of another `<map>` element in the same document. If the id attribute is also specified, both attributes must have the same value.
   */
  name?: HTMLAttributeSource<string>;
}
interface MarqueeHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Sets how the text is scrolled within the marquee. Possible values are scroll, slide and alternate. If no value is specified, the default value is scroll.
   */
  behavior?: HTMLAttributeSource<string>;
  /**
   * Sets the background color through color name or hexadecimal value.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * Sets the direction of the scrolling within the marquee. Possible values are left, right, up and down. If no value is specified, the default value is left.
   */
  direction?: HTMLAttributeSource<string>;
  /**
   * Sets the height in pixels or percentage value.
   */
  height?: HTMLAttributeSource<string>;
  /**
   * Sets the horizontal margin
   */
  hspace?: HTMLAttributeSource<string>;
  /**
   * Sets the number of times the marquee will scroll. If no value is specified, the default value is −1, which means the marquee will scroll continuously.
   */
  loop?: HTMLAttributeSource<string>;
  /**
   * Sets the amount of scrolling at each interval in pixels. The default value is 6.
   */
  scrollamount?: HTMLAttributeSource<string>;
  /**
   * Sets the interval between each scroll movement in milliseconds. The default value is 85. Note that any value smaller than 60 is ignored and the value 60 is used instead, unless truespeed is specified.
   */
  scrolldelay?: HTMLAttributeSource<string>;
  /**
   * By default, scrolldelay values lower than 60 are ignored. If truespeed is present, those values are not ignored.
   */
  truespeed?: HTMLAttributeSource<string>;
  /**
   * Sets the vertical margin in pixels or percentage value.
   */
  vspace?: HTMLAttributeSource<string>;
  /**
   * Sets the width in pixels or percentage value.
   */
  width?: HTMLAttributeSource<string>;
}
interface MenuitemHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Boolean attribute which indicates whether the command is selected. May only be used when the type attribute is checkbox or radio.
   */
  checked?: HTMLAttributeSource<string>;
  /**
   * Specifies the ID of a separate element, indicating a command to be invoked indirectly. May not be used within a menu item that also includes the attributes checked, disabled, icon, label, radiogroup or type.
   */
  command?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates use of the same command as the menu's subject element (such as a button or input).
   */
  default?: HTMLAttributeSource<string>;
  /**
   * Boolean attribute which indicates that the command is not available in the current state. Note that disabled is distinct from hidden; the disabled attribute is appropriate in any context where a change in circumstances might render the command relevant.
   */
  disabled?: HTMLAttributeSource<string>;
  /**
   * Image URL, used to provide a picture to represent the command.
   */
  icon?: HTMLAttributeSource<string>;
  /**
   * The name of the command as shown to the user. Required when a command attribute is not present.
   */
  label?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the name of a group of commands to be toggled as radio buttons when selected. May only be used where the type attribute is radio.
   */
  radiogroup?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the kind of command, and can be one of three values. command: A regular command with an associated action. This is the missing value default. checkbox: Represents a command that can be toggled between two different states. radio: Represent one selection from a group of commands that can be toggled as radio buttons.
   */
  type?: HTMLAttributeSource<string>;
}
interface MetaHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute declares the document's character encoding. If the attribute is present, its value must be an ASCII case-insensitive match for the string "utf-8", because UTF-8 is the only valid encoding for HTML5 documents. `<meta>` elements which declare a character encoding must be located entirely within the first 1024 bytes of the document.
   */
  charset?: HTMLAttributeSource<string>;
  /**
   * This attribute contains the value for the http-equiv or name attribute, depending on which is used.
   */
  content?: HTMLAttributeSource<string>;
  /**
   * Defines a pragma directive. The attribute is named http-equiv(alent) because all the allowed values are names of particular HTTP headers: content-security-policy Allows page authors to define a content policy for the current page. Content policies mostly specify allowed server origins and script endpoints which help guard against cross-site scripting attacks. content-type Declares the MIME type and character encoding of the document. If specified, the content attribute must have the value "text/html; charset=utf-8". This is equivalent to a `<meta>` element with the charset attribute specified, and carries the same restriction on placement within the document. Note: Can only be used in documents served with a text/html, not in documents served with an XML MIME type. default-style Sets the name of the default CSS style sheet set. x-ua-compatible If specified, the content attribute must have the value "IE=edge". User agents are required to ignore this pragma. refresh This instruction specifies: The number of seconds until the page should be reloaded - only if the content attribute contains a positive integer. The number of seconds until the page should redirect to another - only if the content attribute contains a positive integer followed by the string ';url=', and a valid URL. Accessibility concerns Pages set with a refresh value run the risk of having the time interval being too short. People navigating with the aid of assistive technology such as a screen reader may be unable to read through and understand the page's content before being automatically redirected. The abrupt, unannounced updating of the page content may also be disorienting for people experiencing low vision conditions. MDN Understanding WCAG, Guideline 2.1 explanations MDN Understanding WCAG, Guideline 3.1 explanations Understanding Success Criterion 2.2.1 | W3C Understanding WCAG 2.0 Understanding Success Criterion 2.2.4 | W3C Understanding WCAG 2.0 Understanding Success Criterion 3.2.5 | W3C Understanding WCAG 2.0
   */
  "http-equiv"?: HTMLAttributeSource<
    "content-type" | "default-style" | "refresh" | "x-ua-compatible" | "content-security-policy"
  >;
  /** */
  media?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * The name and content attributes can be used together to provide document metadata in terms of name-value pairs, with the name attribute giving the metadata name, and the content attribute giving the value. See standard metadata names for details about the set of standard metadata names defined in the HTML specification.
   */
  name?: HTMLAttributeSource<string>;
}
interface MeterHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The `<form>` element to associate the `<meter>` element with (its form owner). The value of this attribute must be the id of a `<form>` in the same document. If this attribute is not set, the `<meter>` is associated with its ancestor `<form>` element, if any. This attribute is only used if the `<meter>` element is being used as a form-associated element, such as one displaying a range corresponding to an `<input type="number">`.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The lower numeric bound of the high end of the measured range. This must be less than the maximum value (max attribute), and it also must be greater than the low value and minimum value (low attribute and min attribute, respectively), if any are specified. If unspecified, or if greater than the maximum value, the high value is equal to the maximum value.
   */
  high?: HTMLAttributeSource<number | string>;
  /**
   * The upper numeric bound of the low end of the measured range. This must be greater than the minimum value (min attribute), and it also must be less than the high value and maximum value (high attribute and max attribute, respectively), if any are specified. If unspecified, or if less than the minimum value, the low value is equal to the minimum value.
   */
  low?: HTMLAttributeSource<number | string>;
  /**
   * The upper numeric bound of the measured range. This must be greater than the minimum value (min attribute), if specified. If unspecified, the maximum value is 1.
   */
  max?: HTMLAttributeSource<number | string>;
  /**
   * The lower numeric bound of the measured range. This must be less than the maximum value (max attribute), if specified. If unspecified, the minimum value is 0.
   */
  min?: HTMLAttributeSource<number | string>;
  /**
   * This attribute indicates the optimal numeric value. It must be within the range (as defined by the min attribute and max attribute). When used with the low attribute and high attribute, it gives an indication where along the range is considered preferable. For example, if it is between the min attribute and the low attribute, then the lower range is considered preferred. The browser may color the meter's bar differently depending on whether the value is less than or equal to the optimum value.
   */
  optimum?: HTMLAttributeSource<number | string>;
  /**
   * The current numeric value. This must be between the minimum and maximum values (min attribute and max attribute) if they are specified. If unspecified or malformed, the value is 0. If specified, but not within the range given by the min attribute and max attribute, the value is equal to the nearest end of the range. Note: Unless the value attribute is between 0 and 1 (inclusive), the min and max attributes should define the range so that the value attribute's value is within it.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface ObjectHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A space-separated list of URIs for archives of resources for the object.
   */
  archive?: HTMLAttributeSource<string>;
  /**
   * The width of a border around the control, in pixels.
   */
  border?: HTMLAttributeSource<string>;
  /**
   * The URI of the object's implementation. It can be used together with, or in place of, the data attribute.
   */
  classid?: HTMLAttributeSource<string>;
  /**
   * The base path used to resolve relative URIs specified by classid, data, or archive. If not specified, the default is the base URI of the current document.
   */
  codebase?: HTMLAttributeSource<string>;
  /**
   * The content type of the data specified by classid.
   */
  codetype?: HTMLAttributeSource<string>;
  /**
   * The address of the resource as a valid URL. At least one of data and type must be defined.
   */
  data?: HTMLAttributeSource<string>;
  /**
   * The presence of this Boolean attribute makes this element a declaration only. The object must be instantiated by a subsequent `<object>` element. In HTML5, repeat the `<object>` element completely each time that the resource is reused.
   */
  declare?: HTMLAttributeSource<string>;
  /**
   * The form element, if any, that the object element is associated with (its form owner). The value of the attribute must be an ID of a `<form>` element in the same document.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The height of the displayed resource, in CSS pixels. -- (Absolute values only. NO percentages)
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * The name of valid browsing context (HTML5), or the name of the control (HTML 4).
   */
  name?: HTMLAttributeSource<string>;
  /**
   * A message that the browser can show while loading the object's implementation and data.
   */
  standby?: HTMLAttributeSource<string>;
  /**
   * The content type of the resource specified by data. At least one of data and type must be defined.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * A hash-name reference to a `<map>` element; that is a '#' followed by the value of a name of a map element.
   */
  usemap?: HTMLAttributeSource<string>;
  /**
   * The width of the display resource, in CSS pixels. -- (Absolute values only. NO percentages)
   */
  width?: HTMLAttributeSource<number | string>;
}
interface OlHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This Boolean attribute specifies that the list's items are in reverse order. Items will be numbered from high to low.
   */
  reversed?: HTMLAttributeSource<boolean>;
  /**
   * An integer to start counting from for the list items. Always an Arabic numeral (1, 2, 3, etc.), even when the numbering type is letters or Roman numerals. For example, to start numbering elements from the letter "d" or the Roman numeral "iv," use start="4".
   */
  start?: HTMLAttributeSource<number | string>;
  /**
   * Sets the numbering type: a for lowercase letters A for uppercase letters i for lowercase Roman numerals I for uppercase Roman numerals 1 for numbers (default) The specified type is used for the entire list unless a different type attribute is used on an enclosed `<li>` element. Note: Unless the type of the list number matters (like legal or technical documents where items are referenced by their number/letter), use the CSS list-style-type property instead.
   */
  type?: HTMLAttributeSource<string>;
}
interface OptgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * If this Boolean attribute is set, none of the items in this option group is selectable. Often browsers grey out such control and it won't receive any browsing events, like mouse clicks or focus-related ones.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * The name of the group of options, which the browser can use when labeling the options in the user interface. This attribute is mandatory if this element is used.
   */
  label?: HTMLAttributeSource<string>;
}
interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * If this Boolean attribute is set, this option is not checkable. Often browsers grey out such control and it won't receive any browsing event, like mouse clicks or focus-related ones. If this attribute is not set, the element can still be disabled if one of its ancestors is a disabled `<optgroup>` element.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * This attribute is text for the label indicating the meaning of the option. If the label attribute isn't defined, its value is that of the element text content.
   */
  label?: HTMLAttributeSource<string>;
  /**
   * If present, this Boolean attribute indicates that the option is initially selected. If the `<option>` element is the descendant of a `<select>` element whose multiple attribute is not set, only one single `<option>` of this `<select>` element may have the selected attribute.
   */
  selected?: HTMLAttributeSource<boolean>;
  /**
   * The content of this attribute represents the value to be submitted with the form, should this option be selected. If this attribute is omitted, the value is taken from the text content of the option element.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface OutputHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A space-separated list of other elements' ids, indicating that those elements contributed input values to (or otherwise affected) the calculation.
   */
  for?: HTMLAttributeSource<string>;
  /**
   * The `<form>` element to associate the output with (its form owner). The value of this attribute must be the id of a `<form>` in the same document. (If this attribute is not set, the `<output>` is associated with its ancestor `<form>` element, if any.) This attribute lets you associate `<output>` elements to `<form>`s anywhere in the document, not just inside a `<form>`. It can also override an ancestor `<form>` element.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The element's name. Used in the form.elements API.
   */
  name?: HTMLAttributeSource<string>;
}
interface ParamHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Name of the parameter.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * Only used if the valuetype is set to ref. Specifies the MIME type of values found at the URI specified by value.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * Specifies the value of the parameter.
   */
  value?: HTMLAttributeSource<number | string>;
  /**
   * Specifies the type of the value attribute. Possible values are: data: Default value. The value is passed to the object's implementation as a string. ref: The value is a URI to a resource where run-time values are stored. object: An ID of another `<object>` in the same document.
   */
  valuetype?: HTMLAttributeSource<string>;
}
interface PortalHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Sets the referrer policy to use when requesting the page at the URL given as the value of the src attribute.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * The URL of the page to embed.
   */
  src?: HTMLAttributeSource<string>;
}
interface PreHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Contains the preferred count of characters that a line should have. It was a non-standard synonym of width. To achieve such an effect, use CSS width instead.
   */
  cols?: HTMLAttributeSource<string>;
  /**
   * Contains the preferred count of characters that a line should have. Though technically still implemented, this attribute has no visual effect; to achieve such an effect, use CSS width instead.
   */
  width?: HTMLAttributeSource<string>;
  /**
   * Is a hint indicating how the overflow must happen. In modern browser this hint is ignored and no visual effect results in its present; to achieve such an effect, use CSS white-space instead.
   */
  wrap?: HTMLAttributeSource<string>;
}
interface ProgressHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute describes how much work the task indicated by the progress element requires. The max attribute, if present, must have a value greater than 0 and be a valid floating point number. The default value is 1.
   */
  max?: HTMLAttributeSource<number | string>;
  /**
   * This attribute specifies how much of the task that has been completed. It must be a valid floating point number between 0 and max, or between 0 and 1 if max is omitted. If there is no value attribute, the progress bar is indeterminate; this indicates that an activity is ongoing with no indication of how long it is expected to take.
   */
  value?: HTMLAttributeSource<number | string>;
}
interface QHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The value of this attribute is a URL that designates a source document or message for the information quoted. This attribute is intended to point to information explaining the context or the reference for the quote.
   */
  cite?: HTMLAttributeSource<string>;
}
interface ScriptHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * For classic scripts, if the async attribute is present, then the classic script will be fetched in parallel to parsing and evaluated as soon as it is available. For module scripts, if the async attribute is present then the scripts and all their dependencies will be executed in the defer queue, therefore they will get fetched in parallel to parsing and evaluated as soon as they are available. This attribute allows the elimination of parser-blocking JavaScript where the browser would have to load and evaluate scripts before continuing to parse. defer has a similar effect in this case. This is a boolean attribute: the presence of a boolean attribute on an element represents the true value, and the absence of the attribute represents the false value. See Browser compatibility for notes on browser support. See also Async scripts for asm.js.
   */
  async?: HTMLAttributeSource<boolean>;
  /**
   * If present, its value must be an ASCII case-insensitive match for "utf-8". It's unnecessary to specify the charset attribute, because documents must use UTF-8, and the script element inherits its character encoding from the document.
   */
  charset?: HTMLAttributeSource<string>;
  /**
   * Normal script elements pass minimal information to the window.onerror for scripts which do not pass the standard CORS checks. To allow error logging for sites which use a separate domain for static media, use this attribute. See CORS settings attributes for a more descriptive explanation of its valid arguments.
   */
  crossorigin?: HTMLAttributeSource<HTMLCrossorigin>;
  /**
   * This Boolean attribute is set to indicate to a browser that the script is meant to be executed after the document has been parsed, but before firing DOMContentLoaded. Scripts with the defer attribute will prevent the DOMContentLoaded event from firing until the script has loaded and finished evaluating. This attribute must not be used if the src attribute is absent (i.e. for inline scripts), in this case it would have no effect. The defer attribute has no effect on module scripts: they defer by default. Scripts with the defer attribute will execute in the order in which they appear in the document. This attribute allows the elimination of parser-blocking JavaScript where the browser would have to load and evaluate scripts before continuing to parse. async has a similar effect in this case.
   */
  defer?: HTMLAttributeSource<boolean>;
  /**
   * This attribute contains inline metadata that a user agent can use to verify that a fetched resource has been delivered free of unexpected manipulation. See Subresource Integrity.
   */
  integrity?: HTMLAttributeSource<string>;
  /**
   * Like the type attribute, this attribute identifies the scripting language in use. Unlike the type attribute, however, this attribute's possible values were never standardized. The type attribute should be used instead.
   */
  language?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute is set to indicate that the script should not be executed in browsers that support ES2015 modules. In effect, this can be used to serve fallback scripts to older browsers that do not support modular JavaScript code.
   */
  nomodule?: HTMLAttributeSource<boolean>;
  /**
   * Indicates which referrer to send when fetching the script, or resources fetched by the script: no-referrer: The Referer header will not be sent. no-referrer-when-downgrade: The Referer header will not be sent to origins without TLS (HTTPS). origin: The sent referrer will be limited to the origin of the referring page: its scheme, host, and port. origin-when-cross-origin: The referrer sent to other origins will be limited to the scheme, the host, and the port. Navigations on the same origin will still include the path. same-origin: A referrer will be sent for same origin, but cross-origin requests will contain no referrer information. strict-origin: Only send the origin of the document as the referrer when the protocol security level stays the same (HTTPS→HTTPS), but don't send it to a less secure destination (HTTPS→HTTP). strict-origin-when-cross-origin (default): Send a full URL when performing a same-origin request, only send the origin when the protocol security level stays the same (HTTPS→HTTPS), and send no header to a less secure destination (HTTPS→HTTP). unsafe-url: The referrer will include the origin and the path (but not the fragment, password, or username). This value is unsafe, because it leaks origins and paths from TLS-protected resources to insecure origins. Note: An empty string value ("") is both the default value, and a fallback value if referrerpolicy is not supported. If referrerpolicy is not explicitly specified on the `<script>` element, it will adopt a higher-level referrer policy, i.e. one set on the whole document or domain. If a higher-level policy is not available, the empty string is treated as being equivalent to strict-origin-when-cross-origin.
   */
  referrerpolicy?: HTMLAttributeSource<HTMLReferrerPolicy>;
  /**
   * This attribute specifies the URI of an external script; this can be used as an alternative to embedding a script directly within a document.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * This attribute indicates the type of script represented. The value of this attribute will be in one of the following categories: Omitted or a JavaScript MIME type: This indicates the script is JavaScript. The HTML5 specification urges authors to omit the attribute rather than provide a redundant MIME type. In earlier browsers, this identified the scripting language of the embedded or imported (via the src attribute) code. JavaScript MIME types are listed in the specification. module: Causes the code to be treated as a JavaScript module. The processing of the script contents is not affected by the charset and defer attributes. For information on using module, see our JavaScript modules guide. Unlike classic scripts, module scripts require the use of the CORS protocol for cross-origin fetching. Any other value: The embedded content is treated as a data block which won't be processed by the browser. Developers must use a valid MIME type that is not a JavaScript MIME type to denote data blocks. The src attribute will be ignored.
   */
  type?: HTMLAttributeSource<string>;
}
interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A DOMString providing a hint for a user agent's autocomplete feature. See The HTML autocomplete attribute for a complete list of values and details on how to use autocomplete.
   */
  autocomplete?: HTMLAttributeSource<HTMLAutocomplete>;
  /**
   * This Boolean attribute indicates that the user cannot interact with the control. If this attribute is not specified, the control inherits its setting from the containing element, for example `<fieldset>`; if there is no containing element with the disabled attribute set, then the control is enabled.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * The `<form>` element to associate the `<select>` with (its form owner). The value of this attribute must be the id of a `<form>` in the same document. (If this attribute is not set, the `<select>` is associated with its ancestor `<form>` element, if any.) This attribute lets you associate `<select>` elements to `<form>`s anywhere in the document, not just inside a `<form>`. It can also override an ancestor `<form>` element.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that multiple options can be selected in the list. If it is not specified, then only one option can be selected at a time. When multiple is specified, most browsers will show a scrolling list box instead of a single line dropdown.
   */
  multiple?: HTMLAttributeSource<boolean>;
  /**
   * This attribute is used to specify the name of the control.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute indicating that an option with a non-empty string value must be selected.
   */
  required?: HTMLAttributeSource<boolean>;
  /**
   * If the control is presented as a scrolling list box (e.g. when multiple is specified), this attribute represents the number of rows in the list that should be visible at one time. Browsers are not required to present a select element as a scrolled list box. The default value is 0. Note: According to the HTML5 specification, the default value for size should be 1; however, in practice, this has been found to break some web sites, and no other browser currently does that, so Mozilla has opted to continue to return 0 for the time being with Firefox.
   */
  size?: HTMLAttributeSource<number | string>;
}
interface SlotHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * The slot's name. A named slot is a `<slot>` element with a name attribute.
   */
  name?: HTMLAttributeSource<string>;
}
interface SourceHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * Media query of the resource's intended media.
   */
  media?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * Is a list of source sizes that describes the final rendered width of the image represented by the source. Each source size consists of a comma-separated list of media condition-length pairs. This information is used by the browser to determine, before laying the page out, which image defined in srcset to use. Please note that sizes will have its effect only if width dimension descriptors are provided with srcset instead of pixel ratio values (200w instead of 2x for example). The sizes attribute has an effect only when the `<source>` element is the direct child of a `<picture>` element.
   */
  sizes?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * Required for `<audio>` and `<video>`, address of the media resource. The value of this attribute is ignored when the `<source>` element is placed inside a `<picture>` element.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * A list of one or more strings separated by commas indicating a set of possible images represented by the source for the browser to use. Each string is composed of: One URL specifying an image. A width descriptor, which consists of a string containing a positive integer directly followed by "w", such as 300w. The default value, if missing, is the infinity. A pixel density descriptor, that is a positive floating number directly followed by "x". The default value, if missing, is 1x. Each string in the list must have at least a width descriptor or a pixel density descriptor to be valid. Among the list, there must be only one string containing the same tuple of width descriptor and pixel density descriptor. The browser chooses the most adequate image to display at a given point of time. The srcset attribute has an effect only when the `<source>` element is the direct child of a `<picture>` element.
   */
  srcset?: HTMLAttributeSource<string>;
  /**
   * The MIME media type of the resource, optionally with a codecs parameter.
   */
  type?: HTMLAttributeSource<string>;
}
interface SpacerHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute determines alignment of spacer. Possible values are left, right and center.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * This attribute can be used for defining height of spacer in pixels when type is block.
   */
  height?: HTMLAttributeSource<string>;
  /**
   * This attribute can be used for defining size of spacer in pixels when type is horizontal or vertical.
   */
  size?: HTMLAttributeSource<string>;
  /**
   * This attribute determines type of spacer. Possible values are horizontal, vertical and block.
   */
  type?: HTMLAttributeSource<string>;
  /**
   * This attribute can be used for defining width of spacer in pixels when type is block.
   */
  width?: HTMLAttributeSource<string>;
}
interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute defines which media the style should be applied to. Its value is a media query, which defaults to all if the attribute is missing.
   */
  media?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies that the styles only apply to the elements of its parent(s) and children. This attribute may be re-introduced in the future per https://github.com/w3c/csswg-drafts/issues/3547. If you want to use the attribute now, you can use a polyfill.
   */
  scoped?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the styling language as a MIME type (charset should not be specified). This attribute is optional and defaults to text/css if it is not specified; values other than the empty string or text/css are not used. Note: There is very little reason to include this attribute in modern web documents.
   */
  type?: HTMLAttributeSource<string>;
}
interface TableHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute indicates how the table must be aligned inside the containing document. It may have the following values: left: the table is displayed on the left side of the document; center: the table is displayed in the center of the document; right: the table is displayed on the right side of the document. Set margin-left and margin-right to auto or margin to 0 auto to achieve an effect that is similar to the align attribute.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * The background color of the table. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. To achieve a similar effect, use the CSS background-color property.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This integer attribute defines, in pixels, the size of the frame surrounding the table. If set to 0, the frame attribute is set to void. To achieve a similar effect, use the CSS border shorthand property.
   */
  border?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the space between the content of a cell and its border, displayed or not. If the cellpadding's length is defined in pixels, this pixel-sized space will be applied to all four sides of the cell's content. If the length is defined using a percentage value, the content will be centered and the total vertical space (top and bottom) will represent this value. The same is true for the total horizontal space (left and right). To achieve a similar effect, apply the border-collapse property to the `<table>` element, with its value set to collapse, and the padding property to the `<td>` elements.
   */
  cellpadding?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the size of the space between two cells in a percentage value or pixels. The attribute is applied both horizontally and vertically, to the space between the top of the table and the cells of the first row, the left of the table and the first column, the right of the table and the last column and the bottom of the table and the last row. To achieve a similar effect, apply the border-spacing property to the `<table>` element. border-spacing does not have any effect if border-collapse is set to collapse.
   */
  cellspacing?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute defines which side of the frame surrounding the table must be displayed. To achieve a similar effect, use the border-style and border-width properties.
   */
  frame?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute defines where rules, i.e. lines, should appear in a table. It can have the following values: none, which indicates that no rules will be displayed; it is the default value; groups, which will cause the rules to be displayed between row groups (defined by the `<thead>`, `<tbody>` and `<tfoot>` elements) and between column groups (defined by the `<col>` and `<colgroup>` elements) only; rows, which will cause the rules to be displayed between rows; columns, which will cause the rules to be displayed between columns; all, which will cause the rules to be displayed between rows and columns. To achieve a similar effect, apply the border property to the appropriate `<thead>`, `<tbody>`, `<tfoot>`, `<col>`, or `<colgroup>` elements.
   */
  rules?: HTMLAttributeSource<string>;
  /**
   * This attribute defines an alternative text that summarizes the content of the table. Use the `<caption>` element instead.
   */
  summary?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the width of the table. Use the CSS width property instead.
   */
  width?: HTMLAttributeSource<string>;
}
interface TbodyHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute specifies how horizontal alignment of each cell content will be handled. Possible values are: left, aligning the content to the left of the cell center, centering the content in the cell right, aligning the content to the right of the cell justify, inserting spaces into the textual content so that the content is justified in the cell char, aligning the textual content on a special character with a minimal offset, defined by the char and charoff attributes. If this attribute is not set, the left value is assumed. As this attribute is deprecated, use the CSS text-align property instead. Note: The equivalent text-align property for the align="char" is not implemented in any browsers yet. See the text-align's browser compatibility section for the `<string>` value.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * The background color of the table. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. As this attribute is deprecated, use the CSS background-color property instead.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to set the character to align the cells in a column on. Typical values for this include a period (.) when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the vertical alignment of the text within each row of cells of the table header. Possible values for this attribute are: baseline, which will put the text as close to the bottom of the cell as it is possible, but align it on the baseline of the characters instead of the bottom of them. If characters are all of the size, this has the same effect as bottom. bottom, which will put the text as close to the bottom of the cell as it is possible; middle, which will center the text in the cell; and top, which will put the text as close to the top of the cell as it is possible. As this attribute is deprecated, use the CSS vertical-align property instead.
   */
  valign?: HTMLAttributeSource<string>;
}
interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute contains a short abbreviated description of the cell's content. Some user-agents, such as speech readers, may present this description before the content itself. Note: Do not use this attribute as it is obsolete in the latest standard. Alternatively, you can put the abbreviated description inside the cell and place the long content in the title attribute.
   */
  abbr?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute specifies how the cell content's horizontal alignment will be handled. Possible values are: left: The content is aligned to the left of the cell. center: The content is centered in the cell. right: The content is aligned to the right of the cell. justify (with text only): The content is stretched out inside the cell so that it covers its entire width. char (with text only): The content is aligned to a character inside the `<th>` element with minimal offset. This character is defined by the char and charoff attributes Unimplemented (see bug 2212). The default value when this attribute is not specified is left. Note: To achieve the same effect as the left, center, right or justify values, apply the CSS text-align property to the element. To achieve the same effect as the char value, give the text-align property the same value you would use for the char. Unimplemented in CSS3.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a list of space-separated strings. Each string is the id of a group of cells that this header applies to.
   */
  axis?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the background color of each cell in a column. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. To achieve a similar effect, use the CSS background-color property.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * The content in the cell element is aligned to a character. Typical values include a period (.) to align numbers or monetary values. If align is not set to char, this attribute is ignored.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to shift column data to the right of the character specified by the char attribute. Its value specifies the length of this shift.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a non-negative integer value that indicates for how many columns the cell extends. Its default value is 1. Values higher than 1000 will be considered as incorrect and will be set to the default value (1).
   */
  colspan?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a list of space-separated strings, each corresponding to the id attribute of the `<th>` elements that apply to this element.
   */
  headers?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * This attribute is used to define a recommended cell height. Use the CSS height property instead.
   */
  height?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a non-negative integer value that indicates for how many rows the cell extends. Its default value is 1; if its value is set to 0, it extends until the end of the table section (`<thead>`, `<tbody>`, `<tfoot>`, even if implicitly defined), that the cell belongs to. Values higher than 65534 are clipped down to 65534.
   */
  rowspan?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute defines the cells that the header (defined in the `<th>`) element relates to. Only use this attribute with the `<th>` element to define the row or column for which it is a header.
   */
  scope?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies how a text is vertically aligned inside a cell. Possible values for this attribute are: baseline: Positions the text near the bottom of the cell and aligns it with the baseline of the characters instead of the bottom. If characters don't descend below the baseline, the baseline value achieves the same effect as bottom. bottom: Positions the text near the bottom of the cell. middle: Centers the text in the cell. and top: Positions the text near the top of the cell. To achieve a similar effect, use the CSS vertical-align property.
   */
  valign?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to define a recommended cell width. Use the CSS width property instead.
   */
  width?: HTMLAttributeSource<string>;
}
interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute indicates whether the value of the control can be automatically completed by the browser. Possible values are: off: The user must explicitly enter a value into this field for every use, or the document provides its own auto-completion method; the browser does not automatically complete the entry. on: The browser can automatically complete the value based on values that the user has entered during previous uses. If the autocomplete attribute is not specified on a `<textarea>` element, then the browser uses the autocomplete attribute value of the `<textarea>` element's form owner. The form owner is either the `<form>` element that this `<textarea>` element is a descendant of or the form element whose id is specified by the form attribute of the input element. For more information, see the autocomplete attribute in `<form>`.
   */
  autocomplete?: HTMLAttributeSource<HTMLAutocomplete>;
  /**
   * A string which indicates whether or not to activate automatic spelling correction and processing of text substitutions (if any are configured) while the user is editing this textarea. Permitted values are: on Enable automatic spelling correction and text substitutions. off Disable automatic spelling correction and text substitutions.
   */
  autocorrect?: HTMLAttributeSource<string>;
  /**
   * The visible width of the text control, in average character widths. If it is specified, it must be a positive integer. If it is not specified, the default value is 20.
   */
  cols?: HTMLAttributeSource<number | string>;
  /** */
  dirname?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that the user cannot interact with the control. If this attribute is not specified, the control inherits its setting from the containing element, for example `<fieldset>`; if there is no containing element when the disabled attribute is set, the control is enabled.
   */
  disabled?: HTMLAttributeSource<boolean>;
  /**
   * The form element that the `<textarea>` element is associated with (its "form owner"). The value of the attribute must be the id of a form element in the same document. If this attribute is not specified, the `<textarea>` element must be a descendant of a form element. This attribute enables you to place `<textarea>` elements anywhere within a document, not just as descendants of form elements.
   */
  form?: HTMLAttributeSource<string>;
  /**
   * The maximum number of characters (UTF-16 code units) that the user can enter. If this value isn't specified, the user can enter an unlimited number of characters.
   */
  maxlength?: HTMLAttributeSource<number | string>;
  /**
   * The minimum number of characters (UTF-16 code units) required that the user should enter.
   */
  minlength?: HTMLAttributeSource<number | string>;
  /**
   * The name of the control.
   */
  name?: HTMLAttributeSource<string>;
  /**
   * A hint to the user of what can be entered in the control. Carriage returns or line-feeds within the placeholder text must be treated as line breaks when rendering the hint. Note: Placeholders should only be used to show an example of the type of data that should be entered into a form; they are not a substitute for a proper `<label>` element tied to the input. See Labels and placeholders in `<input>`: The Input (Form Input) element for a full explanation.
   */
  placeholder?: HTMLAttributeSource<string>;
  /**
   * This Boolean attribute indicates that the user cannot modify the value of the control. Unlike the disabled attribute, the readonly attribute does not prevent the user from clicking or selecting in the control. The value of a read-only control is still submitted with the form.
   */
  readonly?: HTMLAttributeSource<boolean>;
  /**
   * This attribute specifies that the user must fill in a value before submitting a form.
   */
  required?: HTMLAttributeSource<boolean>;
  /**
   * The number of visible text lines for the control.
   */
  rows?: HTMLAttributeSource<number | string>;
  /**
   * Indicates how the control wraps text. Possible values are: hard: The browser automatically inserts line breaks (CR+LF) so that each line has no more than the width of the control; the cols attribute must also be specified for this to take effect. soft: The browser ensures that all line breaks in the value consist of a CR+LF pair, but does not insert any additional line breaks. off : Like soft but changes appearance to white-space: pre so line segments exceeding cols are not wrapped and the `<textarea>` becomes horizontally scrollable. If this attribute is not specified, soft is its default value.
   */
  wrap?: HTMLAttributeSource<"soft" | "hard">;
}
interface TfootHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute specifies how horizontal alignment of each cell content will be handled. Possible values are: left, aligning the content to the left of the cell center, centering the content in the cell right, aligning the content to the right of the cell justify, inserting spaces into the textual content so that the content is justified in the cell char, aligning the textual content on a special character with a minimal offset, defined by the char and charoff attributes. If this attribute is not set, the left value is assumed. Note: To achieve the same effect as the left, center, right or justify values, use the CSS text-align property on it. To achieve the same effect as the char value, in CSS3, you can use the value of the char as the value of the text-align property Unimplemented.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * The background color of the table. It is a 6-digit hexadecimal RGB code, prefixed by a '#'. One of the predefined color kewords can also be used. To achieve a similar effect, use the CSS background-color property.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the alignment of the content in a column to a character. Typical values for this include a period (.) when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the vertical alignment of the text within each row of cells of the table footer. Possible values for this attribute are: baseline, which will put the text as close to the bottom of the cell as it is possible, but align it on the baseline of the characters instead of the bottom of them. If characters are all of the size, this has the same effect as bottom. bottom, which will put the text as close to the bottom of the cell as it is possible; middle, which will center the text in the cell; and top, which will put the text as close to the top of the cell as it is possible. Note: Do not use this attribute as it is obsolete (and not supported) in the latest standard: instead set the CSS vertical-align property on it.
   */
  valign?: HTMLAttributeSource<string>;
}
interface ThHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute contains a short abbreviated description of the cell's content. Some user-agents, such as speech readers, may present this description before the content itself.
   */
  abbr?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute specifies how the cell content's horizontal alignment will be handled. Possible values are: left: The content is aligned to the left of the cell. center: The content is centered in the cell. right: The content is aligned to the right of the cell. justify (with text only): The content is stretched out inside the cell so that it covers its entire width. char (with text only): The content is aligned to a character inside the `<th>` element with minimal offset. This character is defined by the char and charoff attributes. The default value when this attribute is not specified is left. Note: Do not use this attribute as it is obsolete in the latest standard. To achieve the same effect as the left, center, right or justify values, apply the CSS text-align property to the element. To achieve the same effect as the char value, give the text-align property the same value you would use for the char.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a list of space-separated strings. Each string is the id of a group of cells that this header applies to. Note: Do not use this attribute as it is obsolete in the latest standard: use the scope attribute instead.
   */
  axis?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the background color of each cell in a column. It consists of a 6-digit hexadecimal code as defined in sRGB and is prefixed by '#'. This attribute may be used with one of sixteen predefined color strings: black = "#000000" green = "#008000" silver = "#C0C0C0" lime = "#00FF00" gray = "#808080" olive = "#808000" white = "#FFFFFF" yellow = "#FFFF00" maroon = "#800000" navy = "#000080" red = "#FF0000" blue = "#0000FF" purple = "#800080" teal = "#008080" fuchsia = "#FF00FF" aqua = "#00FFFF" Note: Do not use this attribute, as it is non-standard and only implemented in some versions of Microsoft Internet Explorer: The `<th>` element should be styled using CSS. To create a similar effect use the background-color property in CSS instead.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * The content in the cell element is aligned to a character. Typical values include a period (.) to align numbers or monetary values. If align is not set to char, this attribute is ignored. Note: Do not use this attribute as it is obsolete in the latest standard. To achieve the same effect, you can specify the character as the first value of the text-align property.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to shift column data to the right of the character specified by the char attribute. Its value specifies the length of this shift. Note: Do not use this attribute as it is obsolete in the latest standard.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a non-negative integer value that indicates for how many columns the cell extends. Its default value is 1. Values higher than 1000 will be considered as incorrect and will be set to the default value (1).
   */
  colspan?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a list of space-separated strings, each corresponding to the id attribute of the `<th>` elements that apply to this element.
   */
  headers?: HTMLAttributeSource<number | string | (number | string)[]>;
  /**
   * This attribute is used to define a recommended cell height. Note: Do not use this attribute as it is obsolete in the latest standard: use the CSS height property instead.
   */
  height?: HTMLAttributeSource<string>;
  /**
   * This attribute contains a non-negative integer value that indicates for how many rows the cell extends. Its default value is 1; if its value is set to 0, it extends until the end of the table section (`<thead>`, `<tbody>`, `<tfoot>`, even if implicitly defined), that the cell belongs to. Values higher than 65534 are clipped down to 65534.
   */
  rowspan?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute defines the cells that the header (defined in the `<th>`) element relates to. It may have the following values: row: The header relates to all cells of the row it belongs to. col: The header relates to all cells of the column it belongs to. rowgroup: The header belongs to a rowgroup and relates to all of its cells. These cells can be placed to the right or the left of the header, depending on the value of the dir attribute in the `<table>` element. colgroup: The header belongs to a colgroup and relates to all of its cells. If the scope attribute is not specified, or its value is not row, col, or rowgroup, or colgroup, then browsers automatically select the set of cells to which the header cell applies.
   */
  scope?: HTMLAttributeSource<"row" | "col" | "rowgroup" | "colgroup" | "auto">;
  /**
   * This attribute specifies how a text is vertically aligned inside a cell. Possible values for this attribute are: baseline: Positions the text near the bottom of the cell and aligns it with the baseline of the characters instead of the bottom. If characters don't descend below the baseline, the baseline value achieves the same effect as bottom. bottom: Positions the text near the bottom of the cell. middle: Centers the text in the cell. and top: Positions the text near the top of the cell. Note: Do not use this attribute as it is obsolete in the latest standard: use the CSS vertical-align property instead.
   */
  valign?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to define a recommended cell width. Additional space can be added with the cellspacing and cellpadding properties and the width of the `<col>` element can also create extra width. But, if a column's width is too narrow to show a particular cell properly, it will be widened when displayed. Note: Do not use this attribute as it is obsolete in the latest standard: use the CSS width property instead.
   */
  width?: HTMLAttributeSource<string>;
}
interface TheadHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This enumerated attribute specifies how horizontal alignment of each cell content will be handled. Possible values are: left, aligning the content to the left of the cell center, centering the content in the cell right, aligning the content to the right of the cell justify, inserting spaces into the textual content so that the content is justified in the cell char, aligning the textual content on a special character with a minimal offset, defined by the char and charoff attributes. If this attribute is not set, the left value is assumed. Note: Do not use this attribute as it is obsolete (not supported) in the latest standard. To achieve the same effect as the left, center, right or justify values, use the CSS text-align property on it. To achieve the same effect as the char value, in CSS3, you can use the value of the char as the value of the text-align property.
   */
  align?: HTMLAttributeSource<string>;
  /**
   * This attribute defines the background color of each cell of the column. It is one of the 6-digit hexadecimal code as defined in sRGB, prefixed by a '#'. One of the sixteen predefined color strings may be used: black = "#000000" green = "#008000" silver = "#C0C0C0" lime = "#00FF00" gray = "#808080" olive = "#808000" white = "#FFFFFF" yellow = "#FFFF00" maroon = "#800000" navy = "#000080" red = "#FF0000" blue = "#0000FF" purple = "#800080" teal = "#008080" fuchsia = "#FF00FF" aqua = "#00FFFF" /ul> Usage note: Do not use this attribute, as it is non-standard and only implemented in some versions of Microsoft Internet Explorer: the `<thead>` element should be styled using CSS. To give a similar effect to the bgcolor attribute, use the CSS property background-color, on the relevant `<td>` or `<th>` elements.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to set the character to align the cells in a column on. Typical values for this include a period (.) when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored. Note: Do not use this attribute as it is obsolete (and not supported) in the latest standard. To achieve the same effect as the char, in CSS3, you can use the character set using the char attribute as the value of the text-align property.
   */
  char?: HTMLAttributeSource<string>;
  /**
   * This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute. Note: Do not use this attribute as it is obsolete (and not supported) in the latest standard.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * This attribute specifies the vertical alignment of the text within each row of cells of the table header. Possible values for this attribute are: baseline, which will put the text as close to the bottom of the cell as it is possible, but align it on the baseline of the characters instead of the bottom of them. If characters are all of the size, this has the same effect as bottom. bottom, which will put the text as close to the bottom of the cell as it is possible; middle, which will center the text in the cell; top, which will put the text as close to the top of the cell as it is possible. Note: Do not use this attribute as it is obsolete (and not supported) in the latest standard: instead set the CSS vertical-align property on it.
   */
  valign?: HTMLAttributeSource<string>;
}
interface TimeHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute indicates the time and/or date of the element and must be in one of the formats described below.
   */
  datetime?: HTMLAttributeSource<string>;
  /** */
  default?: HTMLAttributeSource<boolean>;
  /** */
  kind?: HTMLAttributeSource<"subtitles" | "captions" | "descriptions" | "chapters" | "metadata">;
  /** */
  label?: HTMLAttributeSource<string>;
  /** */
  src?: HTMLAttributeSource<string>;
  /** */
  srclang?: HTMLAttributeSource<string>;
}
interface TrHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A DOMString which specifies how the cell's context should be aligned horizontally within the cells in the row; this is shorthand for using align on every cell in the row individually. Possible values are: left Align the content of each cell at its left edge. center Center the contents of each cell between their left and right edges. right Align the content of each cell at its right edge. justify Widen whitespaces within the text of each cell so that the text fills the full width of each cell (full justification). char Align each cell in the row on a specific character (such that each row in the column that is configured this way will horizontally align its cells on that character). This uses the char and charoff to establish the alignment character (typically "." or "," when aligning numerical data) and the number of characters that should follow the alignment character. This alignment type was never widely supported. If no value is expressly set for align, the parent node's value is inherited. Instead of using the obsolete align attribute, you should instead use the CSS text-align property to establish left, center, right, or justify alignment for the row's cells. To apply character-based alignment, set the CSS text-align property to the alignment character (such as "." or ",").
   */
  align?: HTMLAttributeSource<string>;
  /**
   * A DOMString specifying a color to apply to the backgrounds of each of the row's cells. This can be either an hexadecimal #RRGGBB or #RGB value or a color keyword. Omitting the attribute or setting it to null in JavaScript causes the row's cells to inherit the row's parent element's background color. The `<tr>` element should be styled using CSS. To give a similar effect as the bgcolor attribute, use the CSS property background-color.
   */
  bgcolor?: HTMLAttributeSource<string>;
  /**
   * A DOMString which sets the character to align the cells in each of the row's columns on (each row's centering that uses the same character gets aligned with others using the same character . Typical values for this include a period (".") or comma (",") when attempting to align numbers or monetary values. If align is not set to char, this attribute is ignored. This attribute is not only obsolete, but was rarely implemented anyway. To achieve the same effect as the char attribute, set the CSS text-align property to the same string you would specify for the char property, such as text-align: ".".
   */
  char?: HTMLAttributeSource<string>;
  /**
   * A DOMString indicating the number of characters on the tail end of the column's data should be displayed after the alignment character specified by the char attribute. For example, when displaying money values for currencies that use hundredths of a unit (such as the dollar, which is divided into 100 cents), you would typically specify a value of 2, so that in tandem with char being set to ".", the values in a column would be cleanly aligned on the decimal points, with the number of cents properly displayed to the right of the decimal point. This attribute is obsolete, and was never widely supported anyway.
   */
  charoff?: HTMLAttributeSource<string>;
  /**
   * A DOMString specifying the vertical alignment of the text within each cell in the row. Possible values for this attribute are: baseline Aligns each cell's content text as closely as possible to the bottom of the cell, handling alignment of different fonts and font sizes by aligning the characters along the baseline of the font(s) used in the row. If all of the characters in the row are the same size, the effect is the same as bottom. bottom, Draws the text in each of the row's cells as closely as possible to the bottom edge of those cells. middle Each cell's text is vertically centered. top Each cell's text is drawn as closely as possible to the top edge of the containing cell. Don't use the obsolete valign attribute. Instead, add the CSS vertical-align property to the row.
   */
  valign?: HTMLAttributeSource<string>;
}
interface TrackHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This attribute indicates that the track should be enabled unless the user's preferences indicate that another track is more appropriate. This may only be used on one track element per media element.
   */
  default?: HTMLAttributeSource<string>;
  /**
   * How the text track is meant to be used. If omitted the default kind is subtitles. If the attribute contains an invalid value, it will use metadata (Versions of Chrome earlier than 52 treated an invalid value as subtitles). The following keywords are allowed: subtitles Subtitles provide translation of content that cannot be understood by the viewer. For example speech or text that is not English in an English language film. Subtitles may contain additional content, usually extra background information. For example the text at the beginning of the Star Wars films, or the date, time, and location of a scene. captions Closed captions provide a transcription and possibly a translation of audio. It may include important non-verbal information such as music cues or sound effects. It may indicate the cue's source (e.g. music, text, character). Suitable for users who are deaf or when the sound is muted. descriptions Textual description of the video content. Suitable for users who are blind or where the video cannot be seen. chapters Chapter titles are intended to be used when the user is navigating the media resource. metadata Tracks used by scripts. Not visible to the user.
   */
  kind?: HTMLAttributeSource<string>;
  /**
   * A user-readable title of the text track which is used by the browser when listing available text tracks.
   */
  label?: HTMLAttributeSource<string>;
  /**
   * Address of the track (.vtt file). Must be a valid URL. This attribute must be specified and its URL value must have the same origin as the document, unless the `<audio>` or `<video>` parent element of the track element has a crossorigin attribute.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * Language of the track text data. It must be a valid BCP 47 language tag. If the kind attribute is set to subtitles, then srclang must be defined.
   */
  srclang?: HTMLAttributeSource<string>;
}
interface UlHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * This Boolean attribute hints that the list should be rendered in a compact style. The interpretation of this attribute depends on the user agent, and it doesn't work in all browsers. Warning: Do not use this attribute, as it has been deprecated: use CSS instead. To give a similar effect as the compact attribute, the CSS property line-height can be used with a value of 80%.
   */
  compact?: HTMLAttributeSource<string>;
  /**
   * This attribute sets the bullet style for the list. The values defined under HTML3.2 and the transitional version of HTML 4.0/4.01 are: circle disc square A fourth bullet type has been defined in the WebTV interface, but not all browsers support it: triangle. If not present and if no CSS list-style-type property applies to the element, the user agent selects a bullet type depending on the nesting level of the list. Warning: Do not use this attribute, as it has been deprecated; use the CSS list-style-type property instead.
   */
  type?: HTMLAttributeSource<string>;
}
interface VideoHTMLAttributes<T> extends HTMLAttributes<T> {
  /**
   * A Boolean attribute which if true indicates that the element should automatically toggle picture-in-picture mode when the user switches back and forth between this document and another document or application.
   */
  autopictureinpicture?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute; if specified, the video automatically begins to play back as soon as it can do so without stopping to finish loading the data. Note: Sites that automatically play audio (or videos with an audio track) can be an unpleasant experience for users, so should be avoided when possible. If you must offer autoplay functionality, you should make it opt-in (requiring a user to specifically enable it). However, this can be useful when creating media elements whose source will be set at a later time, under user control. See our autoplay guide for additional information about how to properly use autoplay. To disable video autoplay, autoplay="false" will not work; the video will autoplay if the attribute is there in the `<video>` tag at all. To remove autoplay, the attribute needs to be removed altogether. In some browsers (e.g. Chrome 70.0) autoplay doesn't work if no muted attribute is present.
   */
  autoplay?: HTMLAttributeSource<boolean>;
  /**
   * If this attribute is present, the browser will offer controls to allow the user to control video playback, including volume, seeking, and pause/resume playback.
   */
  controls?: HTMLAttributeSource<boolean>;
  /**
   * The controlslist attribute, when specified, helps the browser select what controls to show on the media element whenever the browser shows its own set of controls (e.g. when the controls attribute is specified). The allowed values are nodownload, nofullscreen and noremoteplayback. Use the disablepictureinpicture attribute if you want to disable the Picture-In-Picture mode (and the control).
   */
  controlslist?: HTMLAttributeSource<"nodownload" | "nofullscreen" | "noremoteplayback">;
  /**
   * This enumerated attribute indicates whether to use CORS to fetch the related video. CORS-enabled resources can be reused in the `<canvas>` element without being tainted. The allowed values are: anonymous Sends a cross-origin request without a credential. In other words, it sends the Origin: HTTP header without a cookie, X.509 certificate, or performing HTTP Basic authentication. If the server does not give credentials to the origin site (by not setting the Access-Control-Allow-Origin: HTTP header), the image will be tainted, and its usage restricted. use-credentials Sends a cross-origin request with a credential. In other words, it sends the Origin: HTTP header with a cookie, a certificate, or performing HTTP Basic authentication. If the server does not give credentials to the origin site (through Access-Control-Allow-Credentials: HTTP header), the image will be tainted and its usage restricted. When not present, the resource is fetched without a CORS request (i.e. without sending the Origin: HTTP header), preventing its non-tainted used in `<canvas>` elements. If invalid, it is handled as if the enumerated keyword anonymous was used. See CORS settings attributes for additional information.
   */
  crossorigin?: HTMLAttributeSource<HTMLCrossorigin>;
  /**
   * Prevents the browser from suggesting a Picture-in-Picture context menu or to request Picture-in-Picture automatically in some cases.
   */
  disablepictureinpicture?: HTMLAttributeSource<string>;
  /**
   * A Boolean attribute used to disable the capability of remote playback in devices that are attached using wired (HDMI, DVI, etc.) and wireless technologies (Miracast, Chromecast, DLNA, AirPlay, etc). In Safari, you can use x-webkit-airplay="deny" as a fallback.
   */
  disableremoteplayback?: HTMLAttributeSource<string>;
  /**
   * The height of the video's display area, in CSS pixels (absolute values only; no percentages.)
   */
  height?: HTMLAttributeSource<number | string>;
  /**
   * A Boolean attribute; if specified, the browser will automatically seek back to the start upon reaching the end of the video.
   */
  loop?: HTMLAttributeSource<boolean>;
  /**
   * A Boolean attribute that indicates the default setting of the audio contained in the video. If set, the audio will be initially silenced. Its default value is false, meaning that the audio will be played when the video is played.
   */
  muted?: HTMLAttributeSource<boolean>;
  /**
   * A Boolean attribute indicating that the video is to be played "inline", that is within the element's playback area. Note that the absence of this attribute does not imply that the video will always be played in fullscreen.
   */
  playsinline?: HTMLAttributeSource<boolean>;
  /**
   * A URL for an image to be shown while the video is downloading. If this attribute isn't specified, nothing is displayed until the first frame is available, then the first frame is shown as the poster frame.
   */
  poster?: HTMLAttributeSource<string>;
  /**
   * This enumerated attribute is intended to provide a hint to the browser about what the author thinks will lead to the best user experience with regards to what content is loaded before the video is played. It may have one of the following values: none: Indicates that the video should not be preloaded. metadata: Indicates that only video metadata (e.g. length) is fetched. auto: Indicates that the whole video file can be downloaded, even if the user is not expected to use it. empty string: Synonym of the auto value. The default value is different for each browser. The spec advises it to be set to metadata. The autoplay attribute has precedence over preload. If autoplay is specified, the browser would obviously need to start downloading the video for playback. The specification does not force the browser to follow the value of this attribute; it is a mere hint.
   */
  preload?: HTMLAttributeSource<"none" | "metadata" | "auto" | "">;
  /**
   * The URL of the video to embed. This is optional; you may instead use the `<source>` element within the video block to specify the video to embed.
   */
  src?: HTMLAttributeSource<string>;
  /**
   * The width of the video's display area, in CSS pixels (absolute values only; no percentages).
   */
  width?: HTMLAttributeSource<number | string>;
}
export interface HTMLElements {
  /**
   * The `<a>` HTML element (or anchor element), with its href attribute, creates a hyperlink to web pages, files, email addresses, locations in the same page, or anything else a URL can address.
   *
   * **Content:** Transparent, containing either flow content (excluding interactive content) or phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `charset` | _String_ | Hinted at the character encoding of the linked URL.
   * | `coords` | _String_ | Used with the shape attribute.
   * | `download` | _String_ | Prompts the user to save the linked URL instead of navigating to it.
   * | `href` | _URL_ | The URL that the hyperlink points to.
   * | `hreflang` | _BCP47_ | Hints at the human language of the linked URL.
   * | `name` | _String_ | Was required to define a possible target location in a page.
   * | `ping` | _URLList_ | A space-separated list of URLs.
   * | `referrerpolicy` | _ReferrerPolicy_ | How much of the referrer to send when following the link.
   * | `rel` | _LinkTypeList_ | The relationship of the linked URL as space-separated link types.
   * | `rev` | _String_ | Specified a reverse link; the opposite of the rel attribute.
   * | `shape` | _String_ | The shape of the hyperlink’s region in an image map.
   * | `target` | _Target_ | Where to display the linked URL, as the name for a browsing context (a tab, window, or `<iframe>`).
   * | `type` | _String_ | Hints at the linked URL’s format with a MIME type.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a)
   */
  a: AHTMLAttributes<HTMLAnchorElement>;
  /**
   * The `<abbr>` HTML element represents an abbreviation or acronym; the optional title attribute can provide an expansion or description for the abbreviation. If present, title must contain this full description and nothing else.
   *
   * **Content:** Phrasing content
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/abbr)
   */
  abbr: HTMLAttributes<HTMLElement>;
  /**
   * The `<acronym>` HTML element allows authors to clearly indicate a sequence of characters that compose an acronym or abbreviation for a word.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/acronym)
   */
  acronym: HTMLAttributes<HTMLElement>;
  /**
   * The `<address>` HTML element indicates that the enclosed HTML provides contact information for a person or people, or for an organization.
   *
   * **Content:** Flow content, but with no nested `<address>` element, no heading content (`<hgroup>`, `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`), no sectioning content (`<article>`, `<aside>`, `<section>`, `<nav>`), and no `<header>` or `<footer>` element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/address)
   */
  address: HTMLAttributes<HTMLElement>;
  /**
   * The obsolete HTML Applet Element (`<applet>`) embeds a Java applet into the document; this element has been deprecated in favor of `<object>`.
   *
   * **Content:** Zero or more `<param>` elements, then transparent.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This attribute is used to position the applet on the page relative to content that might flow around it.
   * | `alt` | _String_ | This attribute causes a descriptive text alternate to be displayed on browsers that do not support Java.
   * | `archive` | _String_ | This attribute refers to an archived or compressed version of the applet and its associated class files, which might help reduce download time.
   * | `code` | _String_ | This attribute specifies the URL of the applet's class file to be loaded and executed.
   * | `codebase` | _String_ | This attribute gives the absolute or relative URL of the directory where applets' .
   * | `datafld` | _String_ | This attribute, supported by Internet Explorer 4 and higher, specifies the column name from the data source object that supplies the bound data.
   * | `datasrc` | _String_ | Like datafld, this attribute is used for data binding under Internet Explorer 4.
   * | `height` | _String_ | This attribute specifies the height, in pixels, that the applet needs.
   * | `hspace` | _String_ | This attribute specifies additional horizontal space, in pixels, to be reserved on either side of the applet.
   * | `mayscript` | _String_ | In the Netscape implementation, this attribute allows access to an applet by programs in a scripting language embedded in the document.
   * | `name` | _String_ | This attribute assigns a name to the applet so that it can be identified by other resources; particularly scripts.
   * | `object` | _String_ | This attribute specifies the URL of a serialized representation of an applet.
   * | `src` | _String_ | As defined for Internet Explorer 4 and higher, this attribute specifies a URL for an associated file for the applet.
   * | `vspace` | _String_ | This attribute specifies additional vertical space, in pixels, to be reserved above and below the applet.
   * | `width` | _String_ | This attribute specifies in pixels the width that the applet needs.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/applet)
   */
  applet: AppletHTMLAttributes<HTMLElement>;
  /**
   * The `<area>` HTML element defines an area inside an image map that has predefined clickable areas. An image map allows geometric areas on an image to be associated with hypertext link.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `alt` | _String_ | A text string alternative to display on browsers that do not display images.
   * | `coords` | _Coords_ | The coords attribute details the coordinates of the shape attribute in size, shape, and placement of an `<area>`.
   * | `download` | _String_ | This attribute, if present, indicates that the author intends the hyperlink to be used for downloading a resource.
   * | `href` | _URL_ | The hyperlink target for the area.
   * | `hreflang` | _String_ | Indicates the language of the linked resource.
   * | `name` | _String_ | Define a names for the clickable area so that it can be scripted by older browsers.
   * | `nohref` | _String_ | Indicates that no hyperlink exists for the associated area.
   * | `ping` | _URLList_ | Contains a space-separated list of URLs to which, when the hyperlink is followed, POST requests with the body PING will be sent by the browser (in the background).
   * | `referrerpolicy` | _ReferrerPolicy_ | A string indicating which referrer to use when fetching the resource: no-referrer: The Referer header will not be sent.
   * | `rel` | _LinkTypeList_ | For anchors containing the href attribute, this attribute specifies the relationship of the target object to the link object.
   * | `shape` | _String_ | The shape of the associated hot spot.
   * | `target` | _Target_ | A keyword or author-defined name of the browsing context to display the linked resource.
   * | `type` | _String_ | Hint for the type of the referenced resource.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/area)
   */
  area: AreaHTMLAttributes<HTMLAreaElement>;
  /**
   * The `<article>` HTML element represents a self-contained composition in a document, page, application, or site, which is intended to be independently distributable or reusable (e.g., in syndication). Examples include: a forum post, a magazine or newspaper article, or a blog entry, a product card, a user-submitted comment, an interactive widget or gadget, or any other independent item of content.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/article)
   */
  article: HTMLAttributes<HTMLElement>;
  /**
   * The `<aside>` HTML element represents a portion of a document whose content is only indirectly related to the document's main content. Asides are frequently presented as sidebars or call-out boxes.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/aside)
   */
  aside: HTMLAttributes<HTMLElement>;
  /**
   * The `<audio>` HTML element is used to embed sound content in documents. It may contain one or more audio sources, represented using the src attribute or the `<source>` element: the browser will choose the most suitable one. It can also be the destination for streamed media, using a MediaStream.
   *
   * **Content:** If the element has a src attribute: zero or more `<track>` elements followed by transparent content that contains no `<audio>` or `<video>` media elements. Else: zero or more `<source>` elements followed by zero or more `<track>` elements followed by transparent content that contains no `<audio>` or `<video>` media elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autoplay` | _Boolean_ | A Boolean attribute: if specified, the audio will automatically begin playback as soon as it can do so, without waiting for the entire audio file to finish downloading.
   * | `controls` | _Boolean_ | If this attribute is present, the browser will offer controls to allow the user to control audio playback, including volume, seeking, and pause/resume playback.
   * | `crossorigin` | _String_ | This enumerated attribute indicates whether to use CORS to fetch the related audio file.
   * | `disableremoteplayback` | _String_ | A Boolean attribute used to disable the capability of remote playback in devices that are attached using wired (HDMI, DVI, etc.
   * | `loop` | _Boolean_ | A Boolean attribute: if specified, the audio player will automatically seek back to the start upon reaching the end of the audio.
   * | `muted` | _Boolean_ | A Boolean attribute that indicates whether the audio will be initially silenced.
   * | `preload` | _String_ | This enumerated attribute is intended to provide a hint to the browser about what the author thinks will lead to the best user experience.
   * | `src` | _URL_ | The URL of the audio to embed.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio)
   */
  audio: AudioHTMLAttributes<HTMLAudioElement>;
  /**
   * The `<b>` HTML element is used to draw the reader's attention to the element's contents, which are not otherwise granted special importance. This was formerly known as the Boldface element, and most browsers still draw the text in boldface. However, you should not use `<b>` for styling text; instead, you should use the CSS font-weight property to create boldface text, or the `<strong>` element to indicate that text is of special importance.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/b)
   */
  b: HTMLAttributes<HTMLElement>;
  /**
   * The `<base>` HTML element specifies the base URL to use for all relative URLs in a document. There can be only one `<base>` element in a document.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `href` | _URL_ | The base URL to be used throughout the document for relative URLs.
   * | `target` | _String_ | A keyword or author-defined name of the default browsing context to show the results of navigation from `<a>`, `<area>`, or `<form>` elements without explicit target attributes.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/base)
   */
  base: BaseHTMLAttributes<HTMLBaseElement>;
  /**
   * The `<basefont>` HTML element is deprecated. It sets a default font face, size, and color for the other elements which are descended from its parent element. With this set, the font's size can then be varied relative to the base size using the `<font>` element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `color` | _String_ | This attribute sets the text color using either a named color or a color specified in the hexadecimal #RRGGBB format.
   * | `face` | _String_ | This attribute contains a list of one or more font names.
   * | `size` | _String_ | This attribute specifies the font size as either a numeric or relative value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/basefont)
   */
  basefont: BasefontHTMLAttributes<HTMLElement>;
  /**
   * The `<bdi>` HTML element tells the browser's bidirectional algorithm to treat the text it contains in isolation from its surrounding text. It's particularly useful when a website dynamically inserts some text and doesn't know the directionality of the text being inserted.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bdi)
   */
  bdi: HTMLAttributes<HTMLElement>;
  /**
   * The `<bdo>` HTML element overrides the current directionality of text, so that the text within is rendered in a different direction.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `dir` | _String_ | The direction in which text should be rendered in this element's contents.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bdo)
   */
  bdo: BdoHTMLAttributes<HTMLElement>;
  /**
   * The `<bgsound>` HTML element is deprecated. It sets up a sound file to play in the background while the page is used; use `<audio>` instead.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `balance` | _String_ | This attribute defines a number between -10,000 and +10,000 that determines how the volume will be divided between the speakers.
   * | `loop` | _String_ | This attribute indicates the number of times a sound is to be played and either has a numeric value or the keyword infinite.
   * | `src` | _String_ | This attribute specifies the URL of the sound file to be played, which must be one of the following types: .
   * | `volume` | _String_ | This attribute defines a number between -10,000 and 0 that determines the loudness of a page's background sound.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/bgsound)
   */
  bgsound: BgsoundHTMLAttributes<HTMLElement>;
  /**
   * The `<big>` HTML deprecated element renders the enclosed text at a font size one level larger than the surrounding text (medium becomes large, for example). The size is capped at the browser's maximum permitted font size.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/big)
   */
  big: HTMLAttributes<HTMLElement>;
  /**
   * The `<blink>` HTML element is a non-standard element which causes the enclosed text to flash slowly.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/blink)
   */
  blink: HTMLAttributes<HTMLElement>;
  /**
   * The `<blockquote>` HTML element indicates that the enclosed text is an extended quotation. Usually, this is rendered visually by indentation (see Notes for how to change it). A URL for the source of the quotation may be given using the cite attribute, while a text representation of the source can be given using the `<cite>` element.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cite` | _URL_ | A URL that designates a source document or message for the information quoted.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/blockquote)
   */
  blockquote: BlockquoteHTMLAttributes<HTMLElement>;
  /**
   * The `<body>` HTML element represents the content of an HTML document. There can be only one `<body>` element in a document.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `alink` | _String_ | Color of text for hyperlinks when selected.
   * | `background` | _String_ | URI of a image to use as a background.
   * | `bgcolor` | _String_ | Background color for the document.
   * | `bottommargin` | _String_ | The margin of the bottom of the body.
   * | `leftmargin` | _String_ | The margin of the left of the body.
   * | `link` | _String_ | Color of text for unvisited hypertext links.
   * | `onafterprint` | _Function_ | Function to call after the user has printed the document.
   * | `onbeforeprint` | _Function_ | Function to call when the user requests printing of the document.
   * | `onbeforeunload` | _Function_ | Function to call when the document is about to be unloaded.
   * | `onblur` | _String_ | Function to call when the document loses focus.
   * | `onerror` | _String_ | Function to call when the document fails to load properly.
   * | `onfocus` | _String_ | Function to call when the document receives focus.
   * | `onhashchange` | _Function_ | Function to call when the fragment identifier part (starting with the hash ('#') character) of the document's current address has changed.
   * | `onlanguagechange` | _Function_ | Function to call when the preferred languages changed.
   * | `onload` | _String_ | Function to call when the document has finished loading.
   * | `onmessage` | _Function_ | Function to call when the document has received a message.
   * | `onmessageerror` | _Function_ | .
   * | `onoffline` | _Function_ | Function to call when network communication has failed.
   * | `ononline` | _Function_ | Function to call when network communication has been restored.
   * | `onpagehide` | _Function_ | .
   * | `onpageshow` | _Function_ | .
   * | `onpopstate` | _Function_ | Function to call when the user has navigated session history.
   * | `onredo` | _String_ | Function to call when the user has moved forward in undo transaction history.
   * | `onrejectionhandled` | _Function_ | .
   * | `onresize` | _String_ | Function to call when the document has been resized.
   * | `onstorage` | _Function_ | Function to call when the storage area has changed.
   * | `onundo` | _String_ | Function to call when the user has moved backward in undo transaction history.
   * | `onunhandledrejection` | _Function_ | .
   * | `onunload` | _Function_ | Function to call when the document is going away.
   * | `rightmargin` | _String_ | The margin of the right of the body.
   * | `text` | _String_ | Foreground color of text.
   * | `topmargin` | _String_ | The margin of the top of the body.
   * | `vlink` | _String_ | Color of text for visited hypertext links.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/body)
   */
  body: BodyHTMLAttributes<HTMLBodyElement>;
  /**
   * The `<br>` HTML element produces a line break in text (carriage-return). It is useful for writing a poem or an address, where the division of lines is significant.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `clear` | _String_ | Indicates where to begin the next line after the break.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/br)
   */
  br: BrHTMLAttributes<HTMLBRElement>;
  /**
   * The `<button>` HTML element represents a clickable button, used to submit forms or anywhere in a document for accessible, standard button functionality.
   *
   * **Content:** Phrasing content but there must be no Interactive content
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autocomplete` | _String_ | This attribute on a `<button>` is nonstandard and Firefox-specific.
   * | `autofocus` | _String_ | This Boolean attribute specifies that the button should have input focus when the page loads.
   * | `disabled` | _Boolean_ | This Boolean attribute prevents the user from interacting with the button: it cannot be pressed or focused.
   * | `form` | _DOMID_ | The `<form>` element to associate the button with (its form owner).
   * | `formaction` | _URL_ | The URL that processes the information submitted by the button.
   * | `formenctype` | _String_ | If the button is a submit button (it's inside/associated with a `<form>` and doesn't have type="button"), specifies how to encode the form data that is submitted.
   * | `formmethod` | _String_ | If the button is a submit button (it's inside/associated with a `<form>` and doesn't have type="button"), this attribute specifies the HTTP method used to submit the form.
   * | `formnovalidate` | _Boolean_ | If the button is a submit button, this Boolean attribute specifies that the form is not to be validated when it is submitted.
   * | `formtarget` | _Target_ | If the button is a submit button, this attribute is a author-defined name or standardized, underscore-prefixed keyword indicating where to display the response from submitting the form.
   * | `name` | _String_ | The name of the button, submitted as a pair with the button’s value as part of the form data, when that button is used to submit the form.
   * | `type` | _String_ | The default behavior of the button.
   * | `value` | _String_ | Defines the value associated with the button’s name when it’s submitted with the form data.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button)
   */
  button: ButtonHTMLAttributes<HTMLButtonElement>;
  /**
   * Use the HTML `<canvas>` element with either the canvas scripting API or the WebGL API to draw graphics and animations.
   *
   * **Content:** WIP: Transparent, but with no interactive content descendants except for a elements, img elements with usemap attributes, button elements, input elements whose type attribute are in the Checkbox or Radio Button states, input elements that are buttons, select elements with a multiple attribute or a display size greater than 1, and elements that would not be interactive content except for having the tabindex attribute specified.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `height` | _Uint_ | The height of the coordinate space in CSS pixels.
   * | `moz-opaque` | _String_ | Lets the canvas know whether or not translucency will be a factor.
   * | `width` | _Uint_ | The width of the coordinate space in CSS pixels.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/canvas)
   */
  canvas: CanvasHTMLAttributes<HTMLCanvasElement>;
  /**
   * The `<caption>` HTML element specifies the caption (or title) of a table.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute indicates how the caption must be aligned with respect to the table.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/caption)
   */
  caption: CaptionHTMLAttributes<HTMLElement>;
  /**
   * The `<center>` HTML element is a block-level element that displays its block-level or inline contents centered horizontally within its containing element. The container is usually, but isn't required to be, `<body>`.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/center)
   */
  center: HTMLAttributes<HTMLElement>;
  /**
   * The `<cite>` HTML element is used to describe a reference to a cited creative work, and must include the title of that work. The reference may be in an abbreviated form according to context-appropriate conventions related to citation metadata.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/cite)
   */
  cite: HTMLAttributes<HTMLElement>;
  /**
   * The `<code>` HTML element displays its contents styled in a fashion intended to indicate that the text is a short fragment of computer code. By default, the content text is displayed using the user agent's default monospace font.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/code)
   */
  code: HTMLAttributes<HTMLElement>;
  /**
   * The `<col>` HTML element defines a column within a table and is used for defining common semantics on all common cells. It is generally found within a `<colgroup>` element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute specifies how horizontal alignment of each column cell content will be handled.
   * | `bgcolor` | _String_ | The background color of the table.
   * | `char` | _String_ | This attribute is used to set the character to align the cells in a column on.
   * | `charoff` | _String_ | This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   * | `span` | _NonZeroUint_ | This attribute contains a positive integer indicating the number of consecutive columns the `<col>` element spans.
   * | `valign` | _String_ | This attribute specifies the vertical alignment of the text within each cell of the column.
   * | `width` | _String_ | This attribute specifies a default width for each column in the current column group.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/col)
   */
  col: ColHTMLAttributes<HTMLTableColElement>;
  /**
   * The `<colgroup>` HTML element defines a group of columns within a table.
   *
   * **Content:** If the span attribute is present: none, it is an empty element. If the attribute is not present: zero or more `<col>` element
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute specifies how horizontal alignment of each column cell content will be handled.
   * | `bgcolor` | _String_ | The background color of the table.
   * | `char` | _String_ | This attribute specifies the alignment of the content in a column group to a character.
   * | `charoff` | _String_ | This attribute is used to indicate the number of characters to offset the column data from the alignment character specified by the char attribute.
   * | `span` | _NonZeroUint_ | This attribute contains a positive integer indicating the number of consecutive columns the `<colgroup>` element spans.
   * | `valign` | _String_ | This attribute specifies the vertical alignment of the text within each cell of the column.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/colgroup)
   */
  colgroup: ColgroupHTMLAttributes<HTMLTableColElement>;
  /**
   * The `<content>` HTML element (an obsolete part of the Web Components suite of technologies) was used inside of Shadow DOM as an insertion point, and wasn't meant to be used in ordinary HTML. It has now been replaced by the `<slot>` element, which creates a point in the DOM at which a shadow DOM can be inserted.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `select` | _String_ | A comma-separated list of selectors.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/content)
   */
  content: ContentHTMLAttributes<HTMLElement>;
  /**
   * The `<data>` HTML element links a given piece of content with a machine-readable translation. If the content is time- or date-related, the `<time>` element must be used.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `value` | _String_ | This attribute specifies the machine-readable translation of the content of the element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/data)
   */
  data: DataHTMLAttributes<HTMLDataElement>;
  /**
   * The `<datalist>` HTML element contains a set of `<option>` elements that represent the permissible or recommended options available to choose from within other controls.
   *
   * **Content:** Either phrasing content or zero or more `<option>` elements.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/datalist)
   */
  datalist: HTMLAttributes<HTMLElement>;
  /**
   * The `<dd>` HTML element provides the description, definition, or value for the preceding term (`<dt>`) in a description list (`<dl>`).
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `nowrap` | _String_ | If the value of this attribute is set to yes, the definition text will not wrap.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dd)
   */
  dd: DdHTMLAttributes<HTMLElement>;
  /**
   * The `<del>` HTML element represents a range of text that has been deleted from a document. This can be used when rendering "track changes" or source code diff information, for example. The `<ins>` element can be used for the opposite purpose: to indicate text that has been added to the document.
   *
   * **Content:** Transparent.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cite` | _URL_ | A URI for a resource that explains the change (for example, meeting minutes).
   * | `datetime` | _Date_ | This attribute indicates the time and date of the change and must be a valid date string with an optional time.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/del)
   */
  del: DelHTMLAttributes<HTMLElement>;
  /**
   * The `<details>` HTML element creates a disclosure widget in which information is visible only when the widget is toggled into an "open" state. A summary or label must be provided using the `<summary>` element.
   *
   * **Content:** One `<summary>` element followed by flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `open` | _Boolean_ | This Boolean attribute indicates whether or not the details (that is, the contents of the `<details>` element) are currently visible.
   * | `tabindex` | _Int_ | .
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details)
   */
  details: DetailsHTMLAttributes<HTMLDetailsElement>;
  /**
   * The `<dfn>` HTML element is used to indicate the term being defined within the context of a definition phrase or sentence. The `<p>` element, the `<dt>`/`<dd>` pairing, or the `<section>` element which is the nearest ancestor of the `<dfn>` is considered to be the definition of the term.
   *
   * **Content:** Phrasing content, but no `<dfn>` element must be a descendant.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dfn)
   */
  dfn: HTMLAttributes<HTMLElement>;
  /**
   * The `<dialog>` HTML element represents a dialog box or other interactive component, such as a dismissible alert, inspector, or subwindow.
   *
   * **Content:** Flow content
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `open` | _Boolean_ | Indicates that the dialog is active and can be interacted with.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)
   */
  dialog: DialogHTMLAttributes<HTMLDialogElement>;
  /**
   * The `<dir>` HTML element is used as a container for a directory of files and/or folders, potentially with styles and icons applied by the user agent. Do not use this obsolete element; instead, you should use the `<ul>` element for lists, including lists of files.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `compact` | _String_ | This Boolean attribute hints that the list should be rendered in a compact style.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dir)
   */
  dir: DirHTMLAttributes<HTMLElement>;
  /**
   * The `<div>` HTML element is the generic container for flow content. It has no effect on the content or layout until styled in some way using CSS (e.g. styling is directly applied to it, or some kind of layout model like Flexbox is applied to its parent element).
   *
   * **Content:** Flow content. Or (in WHATWG HTML): If the parent is a `<dl>` element: one or more `<dt>` elements followed by one or more `<dd>` elements, optionally intermixed with `<script>` and `<template>` elements.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/div)
   */
  div: HTMLAttributes<HTMLElement>;
  /**
   * The `<dl>` HTML element represents a description list. The element encloses a list of groups of terms (specified using the `<dt>` element) and descriptions (provided by `<dd>` elements). Common uses for this element are to implement a glossary or to display metadata (a list of key-value pairs).
   *
   * **Content:** Either: Zero or more groups each consisting of one or more `<dt>` elements followed by one or more `<dd>` elements, optionally intermixed with `<script>` and `<template>` elements. Or: (in WHATWG HTML, W3C HTML 5.2 and later) One or more `<div>` elements, optionally intermixed with `<script>` and `<template>` elements.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dl)
   */
  dl: HTMLAttributes<HTMLElement>;
  /**
   * The `<dt>` HTML element specifies a term in a description or definition list, and as such must be used inside a `<dl>` element. It is usually followed by a `<dd>` element; however, multiple `<dt>` elements in a row indicate several terms that are all defined by the immediate next `<dd>` element.
   *
   * **Content:** Flow content, but with no `<header>`, `<footer>`, sectioning content or heading content descendants.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dt)
   */
  dt: HTMLAttributes<HTMLElement>;
  /**
   * The `<em>` HTML element marks text that has stress emphasis. The `<em>` element can be nested, with each level of nesting indicating a greater degree of emphasis.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/em)
   */
  em: HTMLAttributes<HTMLElement>;
  /**
   * The `<embed>` HTML element embeds external content at the specified point in the document. This content is provided by an external application or other source of interactive content such as a browser plug-in.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `height` | _Uint_ | The displayed height of the resource, in CSS pixels.
   * | `src` | _URL_ | The URL of the resource being embedded.
   * | `type` | _String_ | The MIME type to use to select the plug-in to instantiate.
   * | `width` | _Uint_ | The displayed width of the resource, in CSS pixels.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/embed)
   */
  embed: EmbedHTMLAttributes<HTMLEmbedElement>;
  /**
   * The `<fieldset>` HTML element is used to group several controls as well as labels (`<label>`) within a web form.
   *
   * **Content:** An optional `<legend>` element, followed by flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `disabled` | _Boolean_ | If this Boolean attribute is set, all form controls that are descendants of the `<fieldset>`, are disabled, meaning they are not editable and won't be submitted along with the `<form>`.
   * | `form` | _DOMID_ | This attribute takes the value of the id attribute of a `<form>` element you want the `<fieldset>` to be part of, even if it is not inside the form.
   * | `name` | _String_ | The name associated with the group.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/fieldset)
   */
  fieldset: FieldsetHTMLAttributes<HTMLFieldSetElement>;
  /**
   * The `<figcaption>` HTML element represents a caption or legend describing the rest of the contents of its parent `<figure>` element.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/figcaption)
   */
  figcaption: HTMLAttributes<HTMLElement>;
  /**
   * The `<figure>` HTML element represents self-contained content, potentially with an optional caption, which is specified using the `<figcaption>` element. The figure, its caption, and its contents are referenced as a single unit.
   *
   * **Content:** A `<figcaption>` element, followed by flow content; or flow content followed by a `<figcaption>` element; or flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/figure)
   */
  figure: HTMLAttributes<HTMLElement>;
  /**
   * The `<font>` HTML element defines the font size, color and face for its content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `color` | _String_ | This attribute sets the text color using either a named color or a color specified in the hexadecimal #RRGGBB format.
   * | `face` | _String_ | This attribute contains a comma-separated list of one or more font names.
   * | `size` | _String_ | This attribute specifies the font size as either a numeric or relative value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/font)
   */
  font: FontHTMLAttributes<HTMLFontElement>;
  /**
   * The `<footer>` HTML element represents a footer for its nearest sectioning content or sectioning root element. A `<footer>` typically contains information about the author of the section, copyright data or links to related documents.
   *
   * **Content:** Flow content, but with no `<footer>` or `<header>` descendants.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/footer)
   */
  footer: HTMLAttributes<HTMLElement>;
  /**
   * The `<form>` HTML element represents a document section containing interactive controls for submitting information.
   *
   * **Content:** Flow content, but not containing `<form>` elements
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `accept` | _String_ | Comma-separated content types the server accepts.
   * | `accept-charset` | _String_ | Space-separated character encodings the server accepts.
   * | `action` | _URL_ | The URL that processes the form submission.
   * | `autocapitalize` | _String_ | A nonstandard attribute used by iOS Safari that controls how textual form elements should be automatically capitalized.
   * | `autocomplete` | _Boolean_ | Indicates whether input elements can by default have their values automatically completed by the browser.
   * | `enctype` | _String_ | If the value of the method attribute is post, enctype is the MIME type of the form submission.
   * | `method` | _String_ | The HTTP method to submit the form with.
   * | `name` | _NonEmptyString_ | The name of the form.
   * | `novalidate` | _Boolean_ | This Boolean attribute indicates that the form shouldn't be validated when submitted.
   * | `rel` | _LinkTypeList_ | Creates a hyperlink or annotation depending on the value, see the rel attribute for details.
   * | `target` | _Target_ | Indicates where to display the response after submitting the form.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form)
   */
  form: FormHTMLAttributes<HTMLFormElement>;
  /**
   * The `<frame>` HTML element defines a particular area in which another HTML document can be displayed. A frame should be used within a `<frameset>`.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `frameborder` | _String_ | This attribute allows you to specify a frame’s border.
   * | `marginheight` | _String_ | This attribute defines the height of the margin between frames.
   * | `marginwidth` | _String_ | This attribute defines the width of the margin between frames.
   * | `name` | _String_ | This attribute is used for labeling frames.
   * | `noresize` | _String_ | This attribute prevents resizing of frames by users.
   * | `scrolling` | _String_ | This attribute defines the existence of a scrollbar.
   * | `src` | _String_ | This attribute specifies the document that will be displayed by the frame.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/frame)
   */
  frame: FrameHTMLAttributes<HTMLFrameElement>;
  /**
   * The `<frameset>` HTML element is used to contain `<frame>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cols` | _String_ | This attribute specifies the number and size of horizontal spaces in a frameset.
   * | `rows` | _String_ | This attribute specifies the number and size of vertical spaces in a frameset.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/frameset)
   */
  frameset: FramesetHTMLAttributes<HTMLFrameSetElement>;
  /**
   * The `<h1>` to `<h6>` HTML elements represent six levels of section headings. `<h1>` is the highest section level and `<h6>` is the lowest.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
   */
  h1: HTMLAttributes<HTMLElement>;
  /**
   * The `<h1>` to `<h6>` HTML elements represent six levels of section headings. `<h1>` is the highest section level and `<h6>` is the lowest.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
   */
  h2: HTMLAttributes<HTMLElement>;
  /**
   * The `<h1>` to `<h6>` HTML elements represent six levels of section headings. `<h1>` is the highest section level and `<h6>` is the lowest.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
   */
  h3: HTMLAttributes<HTMLElement>;
  /**
   * The `<h1>` to `<h6>` HTML elements represent six levels of section headings. `<h1>` is the highest section level and `<h6>` is the lowest.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
   */
  h4: HTMLAttributes<HTMLElement>;
  /**
   * The `<h1>` to `<h6>` HTML elements represent six levels of section headings. `<h1>` is the highest section level and `<h6>` is the lowest.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
   */
  h5: HTMLAttributes<HTMLElement>;
  /**
   * The `<head>` HTML element contains machine-readable information (metadata) about the document, like its title, scripts, and style sheets.
   *
   * **Content:** If the document is an `<iframe>` srcdoc document, or if title information is available from a higher level protocol (like the subject line in HTML email), zero or more elements of metadata content. Otherwise, one or more elements of metadata content where exactly one is a `<title>` element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `profile` | _String_ | The URIs of one or more metadata profiles, separated by white space.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/head)
   */
  head: HeadHTMLAttributes<HTMLHeadElement>;
  /**
   * The `<header>` HTML element represents introductory content, typically a group of introductory or navigational aids. It may contain some heading elements but also a logo, a search form, an author name, and other elements.
   *
   * **Content:** Flow content, but with no `<header>` or `<footer>` descendant.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/header)
   */
  header: HTMLAttributes<HTMLElement>;
  /**
   * The `<hgroup>` HTML element represents a multi-level heading for a section of a document. It groups a set of `<h1>`–`<h6>` elements.
   *
   * **Content:** One or more `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, and/or `<h6>`.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/hgroup)
   */
  hgroup: HTMLAttributes<HTMLElement>;
  /**
   * The `<hr>` HTML element represents a thematic break between paragraph-level elements: for example, a change of scene in a story, or a shift of topic within a section.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | Sets the alignment of the rule on the page.
   * | `color` | _String_ | Sets the color of the rule through color name or hexadecimal value.
   * | `noshade` | _String_ | Sets the rule to have no shading.
   * | `size` | _String_ | Sets the height, in pixels, of the rule.
   * | `width` | _String_ | Sets the length of the rule on the page through a pixel or percentage value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/hr)
   */
  hr: HrHTMLAttributes<HTMLHRElement>;
  /**
   * The `<html>` HTML element represents the root (top-level element) of an HTML document, so it is also referred to as the root element. All other elements must be descendants of this element.
   *
   * **Content:** One `<head>` element, followed by one `<body>` element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `manifest` | _String_ | Specifies the URI of a resource manifest indicating resources that should be cached locally.
   * | `version` | _String_ | Specifies the version of the HTML Document Type Definition that governs the current document.
   * | `xmlns` | _String_ | Specifies the XML Namespace of the document.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/html)
   */
  html: HtmlHTMLAttributes<HTMLHtmlElement>;
  /**
   * The `<i>` HTML element represents a range of text that is set off from the normal text for some reason, such as idiomatic text, technical terms, taxonomical designations, among others. Historically, these have been presented using italicized type, which is the original source of the `<i>` naming of this element.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/i)
   */
  i: HTMLAttributes<HTMLElement>;
  /**
   * The `<iframe>` HTML element represents a nested browsing context, embedding another HTML page into the current one.
   *
   * **Content:** None.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | The alignment of this element with respect to the surrounding context.
   * | `allow` | _String_ | Specifies a feature policy for the `<iframe>`.
   * | `allowfullscreen` | _Boolean_ | Set to true if the `<iframe>` can activate fullscreen mode by calling the requestFullscreen() method.
   * | `allowpaymentrequest` | _Boolean_ | Set to true if a cross-origin `<iframe>` should be allowed to invoke the Payment Request API.
   * | `csp` | _String_ | A Content Security Policy enforced for the embedded resource.
   * | `frameborder` | _String_ | The value 1 (the default) draws a border around this frame.
   * | `height` | _Uint_ | The height of the frame in CSS pixels.
   * | `loading` | _String_ | Indicates how the browser should load the iframe: eager: Load the iframe immediately, regardless if it is outside the visible viewport (this is the default value).
   * | `longdesc` | _String_ | A URL of a long description of the frame's content.
   * | `marginheight` | _String_ | The amount of space in pixels between the frame's content and its top and bottom borders.
   * | `marginwidth` | _String_ | The amount of space in pixels between the frame's content and its left and right borders.
   * | `mozbrowser` | _String_ | See bug 1318532 for exposing this to WebExtensions in Firefox.
   * | `name` | _String_ | A targetable name for the embedded browsing context.
   * | `referrerpolicy` | _ReferrerPolicy_ | Indicates which referrer to send when fetching the frame's resource: no-referrer: The Referer header will not be sent.
   * | `sandbox` | _String_ | Applies extra restrictions to the content in the frame.
   * | `scrolling` | _String_ | Indicates when the browser should provide a scrollbar for the frame: auto: Only when the frame's content is larger than its dimensions.
   * | `src` | _URL_ | The URL of the page to embed.
   * | `srcdoc` | _String_ | Inline HTML to embed, overriding the src attribute.
   * | `width` | _Uint_ | The width of the frame in CSS pixels.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe)
   */
  iframe: IframeHTMLAttributes<HTMLIFrameElement>;
  /**
   * The `<img>` HTML element embeds an image into the document.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | Aligns the image with its surrounding context.
   * | `alt` | _String_ | Defines an alternative text description of the image.
   * | `border` | _String_ | The width of a border around the image.
   * | `crossorigin` | _String_ | Indicates if the fetching of the image must be done using a CORS request.
   * | `decoding` | _String_ | Provides an image decoding hint to the browser.
   * | `height` | _Uint_ | The intrinsic height of the image, in pixels.
   * | `hspace` | _String_ | The number of pixels of white space on the left and right of the image.
   * | `intrinsicsize` | _String_ | This attribute tells the browser to ignore the actual intrinsic size of the image and pretend it’s the size specified in the attribute.
   * | `ismap` | _Boolean_ | This Boolean attribute indicates that the image is part of a server-side map.
   * | `loading` | _String_ | Indicates how the browser should load the image: eager: Loads the image immediately, regardless of whether or not the image is currently within the visible viewport (this is the default value).
   * | `longdesc` | _String_ | A link to a more detailed description of the image.
   * | `name` | _String_ | A name for the element.
   * | `referrerpolicy` | _ReferrerPolicy_ | A string indicating which referrer to use when fetching the resource: no-referrer: The Referer header will not be sent.
   * | `sizes` | _SourceSizeList_ | One or more strings separated by commas, indicating a set of source sizes.
   * | `src` | _URL_ | The image URL.
   * | `srcset` | _SrcSet_ | One or more strings separated by commas, indicating possible image sources for the user agent to use.
   * | `usemap` | _URLHash_ | The partial URL (starting with #) of an image map associated with the element.
   * | `vspace` | _String_ | The number of pixels of white space above and below the image.
   * | `width` | _Uint_ | The intrinsic width of the image in pixels.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img)
   */
  img: ImgHTMLAttributes<HTMLImageElement>;
  /**
   * The `<input>` HTML element is used to create interactive controls for web-based forms in order to accept data from the user; a wide variety of types of input data and control widgets are available, depending on the device and user agent. The `<input>` element is one of the most powerful and complex in all of HTML due to the sheer number of combinations of input types and attributes.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `accept` | _AcceptList_ | Valid for the file input type only, the accept attribute defines which file types are selectable in a file upload control.
   * | `alt` | _String_ | Valid for the image button only, the alt attribute provides alternative text for the image, displaying the value of the attribute if the image scr is missing or otherwise fails to load.
   * | `autocomplete` | _AutoComplete_ | (Not a Boolean attribute!) The autocomplete attribute takes as its value a space-separated string that describes what, if any, type of autocomplete functionality the input should provide.
   * | `autocorrect` | _String_ | A Safari extension, the autocorrect attribute is a string which indicates whether or not to activate automatic correction while the user is editing this field.
   * | `autofocus` | _String_ | A Boolean attribute which, if present, indicates that the input should automatically have focus when the page has finished loading (or when the `<dialog>` containing the element has been displayed).
   * | `capture` | _String_ | Introduced in the HTML Media Capture specification and valid for the file input type only, the capture attribute defines which media (microphone, video, or camera) should be used to capture a new file for upload with file upload control in supporting scenarios.
   * | `checked` | _Boolean_ | Valid for both radio and checkbox types, checked is a Boolean attribute.
   * | `dirname` | _String_ | Valid for text and search input types only, the dirname attribute enables the submission of the directionality of the element.
   * | `disabled` | _Boolean_ | A Boolean attribute which, if present, indicates that the user should not be able to interact with the input.
   * | `form` | _DOMID_ | A string specifying the `<form>` element with which the input is associated (that is, its form owner).
   * | `formaction` | _URL_ | Valid for the image and submit input types only.
   * | `formenctype` | _String_ | Valid for the image and submit input types only.
   * | `formmethod` | _String_ | Valid for the image and submit input types only.
   * | `formnovalidate` | _Boolean_ | Valid for the image and submit input types only.
   * | `formtarget` | _Target_ | Valid for the image and submit input types only.
   * | `height` | _Uint_ | Valid for the image input button only, the height is the height of the image file to display to represent the graphical submit button.
   * | `id` | _String_ | Global attribute valid for all elements, including all the input types, it defines a unique identifier (ID) which must be unique in the whole document.
   * | `incremental` | _String_ | The Boolean attribute incremental is a WebKit and Blink extension (so supported by Safari, Opera, Chrome, etc.
   * | `inputmode` | _String_ | Global value valid for all elements, it provides a hint to browsers as to the type of virtual keyboard configuration to use when editing this element or its contents.
   * | `list` | _DOMID_ | The value given to the list attribute should be the id of a `<datalist>` element located in the same document.
   * | `max` | _String_ | Valid for date, month, week, time, datetime-local, number, and range, it defines the greatest value in the range of permitted values.
   * | `maxlength` | _Uint_ | Valid for text, search, url, tel, email, and password, it defines the maximum number of characters (as UTF-16 code units) the user can enter into the field.
   * | `min` | _String_ | Valid for date, month, week, time, datetime-local, number, and range, it defines the most negative value in the range of permitted values.
   * | `minlength` | _Uint_ | Valid for text, search, url, tel, email, and password, it defines the minimum number of characters (as UTF-16 code units) the user can enter into the entry field.
   * | `mozactionhint` | _String_ | A Mozilla extension, supported by Firefox for Android, which provides a hint as to what sort of action will be taken if the user presses the Enter or Return key while editing the field.
   * | `multiple` | _Boolean_ | The Boolean multiple attribute, if set, means the user can enter comma separated email addresses in the email widget or can choose more than one file with the file input.
   * | `name` | _Boolean_ | A string specifying a name for the input control.
   * | `orient` | _String_ | `<progress>``<meter>`orienthorizontalvertical.
   * | `pattern` | _String_ | The pattern attribute, when specified, is a regular expression that the input's value must match in order for the value to pass constraint validation.
   * | `placeholder` | _String_ | The placeholder attribute is a string that provides a brief hint to the user as to what kind of information is expected in the field.
   * | `readonly` | _Boolean_ | A Boolean attribute which, if present, indicates that the user should not be able to edit the value of the input.
   * | `required` | _Boolean_ | required is a Boolean attribute which, if present, indicates that the user must specify a value for the input before the owning form can be submitted.
   * | `results` | _String_ | The results attribute (supported only by Safari) is a numeric value that lets you override the maximum number of entries to be displayed in the `<input>` element's natively-provided drop-down menu of previous search queries.
   * | `size` | _NonZeroUint_ | Valid for email, password, tel, and text input types only.
   * | `src` | _URL_ | Valid for the image input button only, the src is string specifying the URL of the image file to display to represent the graphical submit button.
   * | `step` | _String_ | Valid for the numeric input types, including number, date/time input types, and range, the step attribute is a number that specifies the granularity that the value must adhere to.
   * | `tabindex` | _String_ | Global attribute valid for all elements, including all the input types, an integer attribute indicating if the element can take input focus (is focusable), if it should participate to sequential keyboard navigation.
   * | `title` | _String_ | Global attribute valid for all elements, including all input types, containing a text representing advisory information related to the element it belongs to.
   * | `type` | _Boolean_ | A string specifying the type of control to render.
   * | `value` | _Boolean_ | The input control's value.
   * | `webkitdirectory` | _String_ | {{page("/en-US/docs/Web/HTML/Element/input/file", "webkitdirectory-include")}}.
   * | `width` | _Uint_ | Valid for the image input button only, the width is the width of the image file to display to represent the graphical submit button.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input)
   */
  input: InputHTMLAttributes<HTMLInputElement>;
  /**
   * The `<ins>` HTML element represents a range of text that has been added to a document. You can use the `<del>` element to similarly represent a range of text that has been deleted from the document.
   *
   * **Content:** Transparent.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cite` | _URL_ | This attribute defines the URI of a resource that explains the change, such as a link to meeting minutes or a ticket in a troubleshooting system.
   * | `datetime` | _Date_ | This attribute indicates the time and date of the change and must be a valid date with an optional time string.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ins)
   */
  ins: InsHTMLAttributes<HTMLModElement>;
  /**
   * Element is entirely obsolete, and must not be used by authors.
   *
   * [Reference](https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features)
   */
  isindex: HTMLAttributes<HTMLElement>;
  /**
   * The `<kbd>` HTML element represents a span of inline text denoting textual user input from a keyboard, voice input, or any other text entry device. By convention, the user agent defaults to rendering the contents of a `<kbd>` element using its default monospace font, although this is not mandated by the HTML standard.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/kbd)
   */
  kbd: HTMLAttributes<HTMLElement>;
  /**
   * The `<keygen>` HTML element exists to facilitate generation of key material, and submission of the public key as part of an HTML form. This mechanism is designed for use with Web-based certificate management systems. It is expected that the `<keygen>` element will be used in an HTML form along with other information needed to construct a certificate request, and that the result of the process will be a signed certificate.
   *
   * **Content:** None, it is an empty element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autofocus` | _String_ | This Boolean attribute lets you specify that the control should have input focus when the page loads, unless the user overrides it, for example by typing in a different control.
   * | `challenge` | _String_ | A challenge string that is submitted along with the public key.
   * | `disabled` | _String_ | This Boolean attribute indicates that the form control is not available for interaction.
   * | `form` | _String_ | The form element that this element is associated with (its form owner).
   * | `keytype` | _String_ | The type of key generated.
   * | `name` | _String_ | The name of the control, which is submitted with the form data.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/keygen)
   */
  keygen: KeygenHTMLAttributes<HTMLElement>;
  /**
   * The `<label>` HTML element represents a caption for an item in a user interface.
   *
   * **Content:** Phrasing content, but no descendant label elements. No labelable elements other than the labeled control are allowed.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `for` | _DOMID_ | The value of the for attribute must be a single id for a labelable form-related element in the same document as the `<label>` element.
   * | `form` | _DOMID_ | .
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label)
   */
  label: LabelHTMLAttributes<HTMLLabelElement>;
  /**
   * The `<legend>` HTML element represents a caption for the content of its parent `<fieldset>`.
   *
   * **Content:** Phrasing content and headings (h1–h6 elements).
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/legend)
   */
  legend: HTMLAttributes<HTMLElement>;
  /**
   * The `<li>` HTML element is used to represent an item in a list. It must be contained in a parent element: an ordered list (`<ol>`), an unordered list (`<ul>`), or a menu (`<menu>`). In menus and unordered lists, list items are usually displayed using bullet points. In ordered lists, they are usually displayed with an ascending counter on the left, such as a number or letter.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `type` | _String_ | This character attribute indicates the numbering type: a: lowercase letters A: uppercase letters i: lowercase Roman numerals I: uppercase Roman numerals 1: numbers This type overrides the one used by its parent `<ol>` element, if any.
   * | `value` | _Int_ | This integer attribute indicates the current ordinal value of the list item as defined by the `<ol>` element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/li)
   */
  li: LiHTMLAttributes<HTMLLIElement>;
  /**
   * The `<link>` HTML element specifies relationships between the current document and an external resource. This element is most commonly used to link to stylesheets, but is also used to establish site icons (both "favicon" style icons and icons for the home screen and apps on mobile devices) among other things.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `as` | _Destination_ | This attribute is only used when rel="preload" or rel="prefetch" has been set on the `<link>` element.
   * | `charset` | _String_ | This attribute defines the character encoding of the linked resource.
   * | `color` | _Color_ | .
   * | `crossorigin` | _String_ | This enumerated attribute indicates whether CORS must be used when fetching the resource.
   * | `disabled` | _String_ | For rel="stylesheet" only, the disabled Boolean attribute indicates whether or not the described stylesheet should be loaded and applied to the document.
   * | `href` | _URL_ | This attribute specifies the URL of the linked resource.
   * | `hreflang` | _BCP47_ | This attribute indicates the language of the linked resource.
   * | `imagesizes` | _SourceSizeList_ | For rel="preload" and as="image" only, the imagesizes attribute is a sizes attribute that indicates to preload the appropriate resource used by an img element with corresponding values for its srcset and sizes attributes.
   * | `imagesrcset` | _SrcSet_ | For rel="preload" and as="image" only, the imagesrcset attribute is a sourceset attribute that indicates to preload the appropriate resource used by an img element with corresponding values for its srcset and sizes attributes.
   * | `integrity` | _String_ | Contains inline metadata: a base64-encoded cryptographic hash of the resource (file) you’re telling the browser to fetch.
   * | `media` | _MediaQueryList_ | This attribute specifies the media that the linked resource applies to.
   * | `methods` | _String_ | The value of this attribute provides information about the functions that might be performed on an object.
   * | `prefetch` | _String_ | Identifies a resource that might be required by the next navigation and that the user agent should retrieve it.
   * | `referrerpolicy` | _ReferrerPolicy_ | A string indicating which referrer to use when fetching the resource: no-referrer means that the Referer header will not be sent.
   * | `rel` | _LinkTypeList_ | This attribute names a relationship of the linked document to the current document.
   * | `rev` | _String_ | The value of this attribute shows the relationship of the current document to the linked document, as defined by the href attribute.
   * | `sizes` | _LinkSizes_ | This attribute defines the sizes of the icons for visual media contained in the resource.
   * | `target` | _String_ | Defines the frame or window name that has the defined linking relationship or that will show the rendering of any linked resource.
   * | `title` | _String_ | The title attribute has special semantics on the `<link>` element.
   * | `type` | _MIMEType_ | This attribute is used to define the type of the content linked to.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link)
   */
  link: LinkHTMLAttributes<HTMLLinkElement>;
  /**
   * Element is entirely obsolete, and must not be used by authors.
   *
   * [Reference](https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features)
   */
  listing: HTMLAttributes<HTMLElement>;
  /**
   * The `<main>` HTML element represents the dominant content of the `<body>` of a document. The main content area consists of content that is directly related to or expands upon the central topic of a document, or the central functionality of an application.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/main)
   */
  main: HTMLAttributes<HTMLElement>;
  /**
   * The `<map>` HTML element is used with `<area>` elements to define an image map (a clickable link area).
   *
   * **Content:** Any transparent element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `name` | _String_ | The name attribute gives the map a name so that it can be referenced.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/map)
   */
  map: MapHTMLAttributes<HTMLMapElement>;
  /**
   * The `<mark>` HTML element represents text which is marked or highlighted for reference or notation purposes, due to the marked passage's relevance or importance in the enclosing context.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/mark)
   */
  mark: HTMLAttributes<HTMLElement>;
  /**
   * The `<marquee>` HTML element is used to insert a scrolling area of text. You can control what happens when the text reaches the edges of its content area using its attributes.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `behavior` | _String_ | Sets how the text is scrolled within the marquee.
   * | `bgcolor` | _String_ | Sets the background color through color name or hexadecimal value.
   * | `direction` | _String_ | Sets the direction of the scrolling within the marquee.
   * | `height` | _String_ | Sets the height in pixels or percentage value.
   * | `hspace` | _String_ | Sets the horizontal margin.
   * | `loop` | _String_ | Sets the number of times the marquee will scroll.
   * | `scrollamount` | _String_ | Sets the amount of scrolling at each interval in pixels.
   * | `scrolldelay` | _String_ | Sets the interval between each scroll movement in milliseconds.
   * | `truespeed` | _String_ | By default, scrolldelay values lower than 60 are ignored.
   * | `vspace` | _String_ | Sets the vertical margin in pixels or percentage value.
   * | `width` | _String_ | Sets the width in pixels or percentage value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/marquee)
   */
  marquee: MarqueeHTMLAttributes<HTMLMarqueeElement>;
  /**
   * The `<menu>` HTML element is a semantic alternative to `<ul>`. It represents an unordered list of items (represented by `<li>` elements), each of these represent a link or other command that the user can activate.
   *
   * **Content:** Zero or more occurrences of `<li>`, `<script>`, and `<template>`.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/menu)
   */
  menu: HTMLAttributes<HTMLElement>;
  /**
   * The `<menuitem>` HTML element represents a command that a user is able to invoke through a popup menu. This includes context menus, as well as menus that might be attached to a menu button.
   *
   * **Content:** None, it is an empty element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `checked` | _String_ | Boolean attribute which indicates whether the command is selected.
   * | `command` | _String_ | Specifies the ID of a separate element, indicating a command to be invoked indirectly.
   * | `default` | _String_ | This Boolean attribute indicates use of the same command as the menu's subject element (such as a button or input).
   * | `disabled` | _String_ | Boolean attribute which indicates that the command is not available in the current state.
   * | `icon` | _String_ | Image URL, used to provide a picture to represent the command.
   * | `label` | _String_ | The name of the command as shown to the user.
   * | `radiogroup` | _String_ | This attribute specifies the name of a group of commands to be toggled as radio buttons when selected.
   * | `type` | _String_ | This attribute indicates the kind of command, and can be one of three values.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/menuitem)
   */
  menuitem: MenuitemHTMLAttributes<HTMLElement>;
  /**
   * The `<meta>` HTML element represents metadata that cannot be represented by other HTML meta-related elements, like `<base>`, `<link>`, `<script>`, `<style>` or `<title>`.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `charset` | _String_ | This attribute declares the document's character encoding.
   * | `content` | _String_ | This attribute contains the value for the http-equiv or name attribute, depending on which is used.
   * | `http-equiv` | _String_ | Defines a pragma directive.
   * | `itemprop` | _String_ | .
   * | `media` | _MediaQueryList_ | .
   * | `name` | _String_ | The name and content attributes can be used together to provide document metadata in terms of name-value pairs, with the name attribute giving the metadata name, and the content attribute giving the value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta)
   */
  meta: MetaHTMLAttributes<HTMLMetaElement>;
  /**
   * The `<meter>` HTML element represents either a scalar value within a known range or a fractional value.
   *
   * **Content:** Phrasing content, but there must be no `<meter>` element among its descendants.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `form` | _String_ | The `<form>` element to associate the `<meter>` element with (its form owner).
   * | `high` | _Float_ | The lower numeric bound of the high end of the measured range.
   * | `low` | _Float_ | The upper numeric bound of the low end of the measured range.
   * | `max` | _Float_ | The upper numeric bound of the measured range.
   * | `min` | _Float_ | The lower numeric bound of the measured range.
   * | `optimum` | _Float_ | This attribute indicates the optimal numeric value.
   * | `value` | _Float_ | The current numeric value.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meter)
   */
  meter: MeterHTMLAttributes<HTMLMeterElement>;
  /**
   * Element is entirely obsolete, and must not be used by authors.
   *
   * [Reference](https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features)
   */
  multicol: HTMLAttributes<HTMLElement>;
  /**
   * The `<nav>` HTML element represents a section of a page whose purpose is to provide navigation links, either within the current document or to other documents. Common examples of navigation sections are menus, tables of contents, and indexes.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav)
   */
  nav: HTMLAttributes<HTMLElement>;
  /**
   * Element is entirely obsolete, and must not be used by authors.
   *
   * [Reference](https://html.spec.whatwg.org/multipage/obsolete.html#non-conforming-features)
   */
  nextid: HTMLAttributes<HTMLElement>;
  /**
   * The `<nobr>` HTML element prevents the text it contains from automatically wrapping across multiple lines, potentially resulting in the user having to scroll horizontally to see the entire width of the text.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nobr)
   */
  nobr: HTMLAttributes<HTMLElement>;
  /**
   * The `<noembed>` HTML element is an obsolete, non-standard way to provide alternative, or "fallback", content for browsers that do not support the `<embed>` element or do not support the type of embedded content an author wishes to use. This element was deprecated in HTML 4.01 and above in favor of placing fallback content between the opening and closing tags of an `<object>` element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/noembed)
   */
  noembed: HTMLAttributes<HTMLElement>;
  /**
   * The `<noframes>` HTML element provides content to be presented in browsers that don't support (or have disabled support for) the `<frame>` element. Although most commonly-used browsers support frames, there are exceptions, including certain special-use browsers including some mobile browsers, as well as text-mode browsers.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/noframes)
   */
  noframes: HTMLAttributes<HTMLElement>;
  /**
   * The `<noscript>` HTML element defines a section of HTML to be inserted if a script type on the page is unsupported or if scripting is currently turned off in the browser.
   *
   * **Content:** When scripting is disabled and when it is a descendant of the `<head>` element: in any order, zero or more `<link>` elements, zero or more `<style>` elements, and zero or more `<meta>` elements. When scripting is disabled and when it isn't a descendant of the `<head>` element: any transparent content, but no `<noscript>` element must be among its descendants. Otherwise: flow content or phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/noscript)
   */
  noscript: HTMLAttributes<HTMLElement>;
  /**
   * The `<object>` HTML element represents an external resource, which can be treated as an image, a nested browsing context, or a resource to be handled by a plugin.
   *
   * **Content:** zero or more `<param>` elements, then transparent.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `archive` | _String_ | A space-separated list of URIs for archives of resources for the object.
   * | `border` | _String_ | The width of a border around the control, in pixels.
   * | `classid` | _String_ | The URI of the object's implementation.
   * | `codebase` | _String_ | The base path used to resolve relative URIs specified by classid, data, or archive.
   * | `codetype` | _String_ | The content type of the data specified by classid.
   * | `data` | _URL_ | The address of the resource as a valid URL.
   * | `declare` | _String_ | The presence of this Boolean attribute makes this element a declaration only.
   * | `form` | _DOMID_ | The form element, if any, that the object element is associated with (its form owner).
   * | `height` | _Uint_ | The height of the displayed resource, in CSS pixels.
   * | `name` | _String_ | The name of valid browsing context (HTML5), or the name of the control (HTML 4).
   * | `standby` | _String_ | A message that the browser can show while loading the object's implementation and data.
   * | `type` | _String_ | The content type of the resource specified by data.
   * | `usemap` | _String_ | A hash-name reference to a `<map>` element; that is a '#' followed by the value of a name of a map element.
   * | `width` | _Uint_ | The width of the display resource, in CSS pixels.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/object)
   */
  object: ObjectHTMLAttributes<HTMLObjectElement>;
  /**
   * The `<ol>` HTML element represents an ordered list of items, typically rendered as a numbered list.
   *
   * **Content:** Zero or more `<li>`, `<script>` and `<template>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `reversed` | _Boolean_ | This Boolean attribute specifies that the list’s items are in reverse order.
   * | `start` | _Int_ | An integer to start counting from for the list items.
   * | `type` | _String_ | Sets the numbering type: a for lowercase letters A for uppercase letters i for lowercase Roman numerals I for uppercase Roman numerals 1 for numbers (default) The specified type is used for the entire list unless a different type attribute is used on an enclosed `<li>` element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ol)
   */
  ol: OlHTMLAttributes<HTMLOListElement>;
  /**
   * The `<optgroup>` HTML element creates a grouping of options within a `<select>` element.
   *
   * **Content:** Zero or more `<option>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `disabled` | _Boolean_ | If this Boolean attribute is set, none of the items in this option group is selectable.
   * | `label` | _String_ | The name of the group of options, which the browser can use when labeling the options in the user interface.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/optgroup)
   */
  optgroup: OptgroupHTMLAttributes<HTMLOptGroupElement>;
  /**
   * The `<option>` HTML element is used to define an item contained in a `<select>`, an `<optgroup>`, or a `<datalist>` element. As such, `<option>` can represent menu items in popups and other lists of items in an HTML document.
   *
   * **Content:** Text, possibly with escaped characters (like &amp;eacute;).
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `disabled` | _Boolean_ | If this Boolean attribute is set, this option is not checkable.
   * | `label` | _String_ | This attribute is text for the label indicating the meaning of the option.
   * | `selected` | _Boolean_ | If present, this Boolean attribute indicates that the option is initially selected.
   * | `value` | _String_ | The content of this attribute represents the value to be submitted with the form, should this option be selected.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/option)
   */
  option: OptionHTMLAttributes<HTMLOptionElement>;
  /**
   * The `<output>` HTML element is a container element into which a site or app can inject the results of a calculation or the outcome of a user action.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `for` | _DOMID_ | A space-separated list of other elements’ ids, indicating that those elements contributed input values to (or otherwise affected) the calculation.
   * | `form` | _DOMID_ | The `<form>` element to associate the output with (its form owner).
   * | `name` | _String_ | The element's name.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/output)
   */
  output: OutputHTMLAttributes<HTMLOutputElement>;
  /**
   * The `<p>` HTML element represents a paragraph. Paragraphs are usually represented in visual media as blocks of text separated from adjacent blocks by blank lines and/or first-line indentation, but HTML paragraphs can be any structural grouping of related content, such as images or form fields.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/p)
   */
  p: HTMLAttributes<HTMLElement>;
  /**
   * The `<param>` HTML element defines parameters for an `<object>` element.
   *
   * **Content:** None, it is an empty element.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `name` | _String_ | Name of the parameter.
   * | `type` | _String_ | Only used if the valuetype is set to ref.
   * | `value` | _String_ | Specifies the value of the parameter.
   * | `valuetype` | _String_ | Specifies the type of the value attribute.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/param)
   */
  param: ParamHTMLAttributes<HTMLParamElement>;
  /**
   * The `<picture>` HTML element contains zero or more `<source>` elements and one `<img>` element to offer alternative versions of an image for different display/device scenarios.
   *
   * **Content:** Zero or more `<source>` elements, followed by one `<img>` element, optionally intermixed with script-supporting elements.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture)
   */
  picture: HTMLAttributes<HTMLElement>;
  /**
   * The `<plaintext>` HTML element renders everything following the start tag as raw text, ignoring any following HTML. There is no closing tag, since everything after it is considered raw text.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/plaintext)
   */
  plaintext: HTMLAttributes<HTMLElement>;
  /**
   * The `<portal>` HTML element enables the embedding of another HTML page into the current one for the purposes of allowing smoother navigation into new pages.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `referrerpolicy` | _ReferrerPolicy_ | Sets the referrer policy to use when requesting the page at the URL given as the value of the src attribute.
   * | `src` | _URL_ | The URL of the page to embed.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/portal)
   */
  portal: PortalHTMLAttributes<HTMLElement>;
  /**
   * The `<pre>` HTML element represents preformatted text which is to be presented exactly as written in the HTML file. The text is typically rendered using a non-proportional, or "monospaced, font. Whitespace inside this element is displayed as written.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cols` | _String_ | Contains the preferred count of characters that a line should have.
   * | `width` | _String_ | Contains the preferred count of characters that a line should have.
   * | `wrap` | _String_ | Is a hint indicating how the overflow must happen.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/pre)
   */
  pre: PreHTMLAttributes<HTMLPreElement>;
  /**
   * The `<progress>` HTML element displays an indicator showing the completion progress of a task, typically displayed as a progress bar.
   *
   * **Content:** Phrasing content, but there must be no `<progress>` element among its descendants.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `max` | _Float_ | This attribute describes how much work the task indicated by the progress element requires.
   * | `value` | _Float_ | This attribute specifies how much of the task that has been completed.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/progress)
   */
  progress: ProgressHTMLAttributes<HTMLProgressElement>;
  /**
   * The `<q>` HTML element indicates that the enclosed text is a short inline quotation. Most modern browsers implement this by surrounding the text in quotation marks. This element is intended for short quotations that don't require paragraph breaks; for long quotations use the `<blockquote>` element.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `cite` | _URL_ | The value of this attribute is a URL that designates a source document or message for the information quoted.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/q)
   */
  q: QHTMLAttributes<HTMLQuoteElement>;
  /**
   * The `<rb>` HTML element is used to delimit the base text component of a `<ruby>` annotation, i.e. the text that is being annotated. One `<rb>` element should wrap each separate atomic segment of the base text.
   *
   * **Content:** As a child of a `<ruby>` element.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/rb)
   */
  rb: HTMLAttributes<HTMLElement>;
  /**
   * The `<rp>` HTML element is used to provide fall-back parentheses for browsers that do not support display of ruby annotations using the `<ruby>` element. One `<rp>` element should enclose each of the opening and closing parentheses that wrap the `<rt>` element that contains the annotation's text.
   *
   * **Content:** Text
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/rp)
   */
  rp: HTMLAttributes<HTMLElement>;
  /**
   * The `<rt>` HTML element specifies the ruby text component of a ruby annotation, which is used to provide pronunciation, translation, or transliteration information for East Asian typography. The `<rt>` element must always be contained within a `<ruby>` element.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/rt)
   */
  rt: HTMLAttributes<HTMLElement>;
  /**
   * The `<rtc>` HTML element embraces semantic annotations of characters presented in a ruby of `<rb>` elements used inside of `<ruby>` element. `<rb>` elements can have both pronunciation (`<rt>`) and semantic (`<rtc>`) annotations.
   *
   * **Content:** Phrasing content or `<rt>` elements.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/rtc)
   */
  rtc: HTMLAttributes<HTMLElement>;
  /**
   * The `<ruby>` HTML element represents small annotations that are rendered above, below, or next to base text, usually used for showing the pronunciation of East Asian characters. It can also be used for annotating other kinds of text, but this usage is less common.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ruby)
   */
  ruby: HTMLAttributes<HTMLElement>;
  /**
   * The `<s>` HTML element renders text with a strikethrough, or a line through it. Use the `<s>` element to represent things that are no longer relevant or no longer accurate. However, `<s>` is not appropriate when indicating document edits; for that, use the `<del>` and `<ins>` elements, as appropriate.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/s)
   */
  s: HTMLAttributes<HTMLElement>;
  /**
   * The `<samp>` HTML element is used to enclose inline text which represents sample (or quoted) output from a computer program. Its contents are typically rendered using the browser's default monospaced font (such as Courier or Lucida Console).
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/samp)
   */
  samp: HTMLAttributes<HTMLElement>;
  /**
   * The `<script>` HTML element is used to embed executable code or data; this is typically used to embed or refer to JavaScript code. The `<script>` element can also be used with other languages, such as WebGL's GLSL shader programming language and JSON.
   *
   * **Content:** Dynamic script such as text/javascript.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `async` | _Boolean_ | For classic scripts, if the async attribute is present, then the classic script will be fetched in parallel to parsing and evaluated as soon as it is available.
   * | `charset` | _String_ | If present, its value must be an ASCII case-insensitive match for "utf-8".
   * | `crossorigin` | _String_ | Normal script elements pass minimal information to the window.
   * | `defer` | _Boolean_ | This Boolean attribute is set to indicate to a browser that the script is meant to be executed after the document has been parsed, but before firing DOMContentLoaded.
   * | `integrity` | _String_ | This attribute contains inline metadata that a user agent can use to verify that a fetched resource has been delivered free of unexpected manipulation.
   * | `language` | _String_ | Like the type attribute, this attribute identifies the scripting language in use.
   * | `nomodule` | _Boolean_ | This Boolean attribute is set to indicate that the script should not be executed in browsers that support ES2015 modules. In effect, this can be used to serve fallback scripts to older browsers that do not support modular JavaScript code.
   * | `nonce` | _String_ | A cryptographic nonce (number used once) to allow scripts in a script-src Content-Security-Policy.
   * | `referrerpolicy` | _ReferrerPolicy_ | Indicates which referrer to send when fetching the script, or resources fetched by the script: no-referrer: The Referer header will not be sent.
   * | `src` | _URL_ | This attribute specifies the URI of an external script; this can be used as an alternative to embedding a script directly within a document.
   * | `type` | _String_ | This attribute indicates the type of script represented.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script)
   */
  script: ScriptHTMLAttributes<HTMLScriptElement>;
  /**
   * The `<section>` HTML element represents a generic standalone section of a document, which doesn't have a more specific semantic element to represent it. Sections should always have a heading, with very few exceptions.
   *
   * **Content:** Flow content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/section)
   */
  section: HTMLAttributes<HTMLElement>;
  /**
   * The `<select>` HTML element represents a control that provides a menu of options:
   *
   * **Content:** Zero or more `<option>` or `<optgroup>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autocomplete` | _AutoComplete_ | A DOMString providing a hint for a user agent's autocomplete feature.
   * | `autofocus` | _String_ | This Boolean attribute lets you specify that a form control should have input focus when the page loads.
   * | `disabled` | _Boolean_ | This Boolean attribute indicates that the user cannot interact with the control.
   * | `form` | _DOMID_ | The `<form>` element to associate the `<select>` with (its form owner).
   * | `multiple` | _Boolean_ | This Boolean attribute indicates that multiple options can be selected in the list.
   * | `name` | _String_ | This attribute is used to specify the name of the control.
   * | `required` | _Boolean_ | A Boolean attribute indicating that an option with a non-empty string value must be selected.
   * | `size` | _NonZeroUint_ | If the control is presented as a scrolling list box (e.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select)
   */
  select: SelectHTMLAttributes<HTMLSelectElement>;
  /**
   * The `<shadow>` HTML element (an obsolete part of the Web Components technology suite) was intended to be used as a shadow DOM insertion point. You might have used it if you have created multiple shadow roots under a shadow host. It is not useful in ordinary HTML.
   *
   * **Content:** Flow content
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/shadow)
   */
  shadow: HTMLAttributes<HTMLElement>;
  /**
   * The `<slot>` HTML element (part of the Web Components technology suite) is a placeholder inside a web component that you can fill with your own markup, which lets you create separate DOM trees and present them together.
   *
   * **Content:** Transparent
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `name` | _String_ | The slot's name.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/slot)
   */
  slot: SlotHTMLAttributes<HTMLSlotElement>;
  /**
   * The `<small>` HTML element represents side-comments and small print, like copyright and legal text, independent of its styled presentation. By default, it renders text within it one font-size smaller, such as from small to x-small.
   *
   * **Content:** Phrasing content
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/small)
   */
  small: HTMLAttributes<HTMLElement>;
  /**
   * The `<source>` HTML element specifies multiple media resources for the `<picture>`, the `<audio>` element, or the `<video>` element. It is an empty element, meaning that it has no content and does not have a closing tag. It is commonly used to offer the same media content in multiple file formats in order to provide compatibility with a broad range of browsers given their differing support for image file formats and media file formats.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `media` | _MediaQueryList_ | Media query of the resource's intended media.
   * | `sizes` | _SourceSizeList_ | Is a list of source sizes that describes the final rendered width of the image represented by the source.
   * | `src` | _URL_ | Required for `<audio>` and `<video>`, address of the media resource.
   * | `srcset` | _SrcSet_ | A list of one or more strings separated by commas indicating a set of possible images represented by the source for the browser to use.
   * | `type` | _MIMEType_ | The MIME media type of the resource, optionally with a codecs parameter.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source)
   */
  source: SourceHTMLAttributes<HTMLSourceElement>;
  /**
   * The `<spacer>` HTML element is an obsolete HTML element which allowed insertion of empty spaces on pages. It was devised by Netscape to accomplish the same effect as a single-pixel layout image, which was something web designers used to use to add white spaces to web pages without actually using an image. However, `<spacer>` no longer supported by any major browser and the same effects can now be achieved using simple CSS.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This attribute determines alignment of spacer.
   * | `height` | _String_ | This attribute can be used for defining height of spacer in pixels when type is block.
   * | `size` | _String_ | This attribute can be used for defining size of spacer in pixels when type is horizontal or vertical.
   * | `type` | _String_ | This attribute determines type of spacer.
   * | `width` | _String_ | This attribute can be used for defining width of spacer in pixels when type is block.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/spacer)
   */
  spacer: SpacerHTMLAttributes<HTMLElement>;
  /**
   * The `<span>` HTML element is a generic inline container for phrasing content, which does not inherently represent anything. It can be used to group elements for styling purposes (using the class or id attributes), or because they share attribute values, such as lang. It should be used only when no other semantic element is appropriate. `<span>` is very much like a `<div>` element, but `<div>` is a block-level element whereas a `<span>` is an inline element.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/span)
   */
  span: HTMLAttributes<HTMLElement>;
  /**
   * The `<strike>` HTML element places a strikethrough (horizontal line) over text.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/strike)
   */
  strike: HTMLAttributes<HTMLElement>;
  /**
   * The `<strong>` HTML element indicates that its contents have strong importance, seriousness, or urgency. Browsers typically render the contents in bold type.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/strong)
   */
  strong: HTMLAttributes<HTMLElement>;
  /**
   * The `<style>` HTML element contains style information for a document, or part of a document. It contains CSS, which is applied to the contents of the document containing the `<style>` element.
   *
   * **Content:** Text content matching the type attribute, that is text/css.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `media` | _MediaQuery_ | This attribute defines which media the style should be applied to.
   * | `nonce` | _String_ | A cryptographic nonce (number used once) used to allow inline styles in a style-src Content-Security-Policy.
   * | `scoped` | _String_ | This attribute specifies that the styles only apply to the elements of its parent(s) and children.
   * | `title` | _String_ | This attribute specifies alternative style sheet sets.
   * | `type` | _String_ | This attribute defines the styling language as a MIME type (charset should not be specified).
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style)
   */
  style: StyleHTMLAttributes<HTMLStyleElement>;
  /**
   * The `<sub>` HTML element specifies inline text which should be displayed as subscript for solely typographical reasons. Subscripts are typically rendered with a lowered baseline using smaller text.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/sub)
   */
  sub: HTMLAttributes<HTMLElement>;
  /**
   * The `<summary>` HTML element specifies a summary, caption, or legend for a `<details>` element's disclosure box. Clicking the `<summary>` element toggles the state of the parent `<details>` element open and closed.
   *
   * **Content:** Phrasing content or one element of Heading content
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/summary)
   */
  summary: HTMLAttributes<HTMLElement>;
  /**
   * The `<sup>` HTML element specifies inline text which is to be displayed as superscript for solely typographical reasons. Superscripts are usually rendered with a raised baseline using smaller text.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/sup)
   */
  sup: HTMLAttributes<HTMLElement>;
  /**
   * The `<table>` HTML element represents tabular data: information presented in a two-dimensional table comprised of rows and columns of cells containing data.
   *
   * **Content:** In this order: an optional `<caption>` element, zero or more `<colgroup>` elements, an optional `<thead>` element, either one of the following: zero or more `<tbody>` elements one or more `<tr>` elements an optional `<tfoot>` element
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute indicates how the table must be aligned inside the containing document.
   * | `bgcolor` | _String_ | The background color of the table.
   * | `border` | _String_ | This integer attribute defines, in pixels, the size of the frame surrounding the table.
   * | `cellpadding` | _String_ | This attribute defines the space between the content of a cell and its border, displayed or not.
   * | `cellspacing` | _String_ | This attribute defines the size of the space between two cells in a percentage value or pixels.
   * | `frame` | _String_ | This enumerated attribute defines which side of the frame surrounding the table must be displayed.
   * | `rules` | _String_ | This enumerated attribute defines where rules, i.
   * | `summary` | _String_ | This attribute defines an alternative text that summarizes the content of the table.
   * | `width` | _String_ | This attribute defines the width of the table.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/table)
   */
  table: TableHTMLAttributes<HTMLTableElement>;
  /**
   * The `<tbody>` HTML element encapsulates a set of table rows (`<tr>` elements), indicating that they comprise the body of the table (`<table>`).
   *
   * **Content:** Zero or more `<tr>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute specifies how horizontal alignment of each cell content will be handled.
   * | `bgcolor` | _String_ | The background color of the table.
   * | `char` | _String_ | This attribute is used to set the character to align the cells in a column on.
   * | `charoff` | _String_ | This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   * | `valign` | _String_ | This attribute specifies the vertical alignment of the text within each row of cells of the table header.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/tbody)
   */
  tbody: TbodyHTMLAttributes<HTMLTableSectionElement>;
  /**
   * The `<td>` HTML element defines a cell of a table that contains data. It participates in the table model.
   *
   * **Content:** Flow content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `abbr` | _String_ | This attribute contains a short abbreviated description of the cell's content.
   * | `align` | _String_ | This enumerated attribute specifies how the cell content's horizontal alignment will be handled.
   * | `axis` | _String_ | This attribute contains a list of space-separated strings.
   * | `bgcolor` | _String_ | This attribute defines the background color of each cell in a column.
   * | `char` | _String_ | The content in the cell element is aligned to a character.
   * | `charoff` | _String_ | This attribute is used to shift column data to the right of the character specified by the char attribute.
   * | `colspan` | _ColSpan_ | This attribute contains a non-negative integer value that indicates for how many columns the cell extends.
   * | `headers` | _DOMIDList_ | This attribute contains a list of space-separated strings, each corresponding to the id attribute of the `<th>` elements that apply to this element.
   * | `height` | _String_ | This attribute is used to define a recommended cell height.
   * | `rowspan` | _RowSpan_ | This attribute contains a non-negative integer value that indicates for how many rows the cell extends.
   * | `scope` | _String_ | This enumerated attribute defines the cells that the header (defined in the `<th>`) element relates to.
   * | `valign` | _String_ | This attribute specifies how a text is vertically aligned inside a cell.
   * | `width` | _String_ | This attribute is used to define a recommended cell width.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/td)
   */
  td: TdHTMLAttributes<HTMLTableDataCellElement>;
  /**
   * The `<template>` HTML element is a mechanism for holding HTML that is not to be rendered immediately when a page is loaded but may be instantiated subsequently during runtime using JavaScript.
   *
   * **Content:** No restrictions
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template)
   */
  template: HTMLAttributes<HTMLElement>;
  /**
   * The `<textarea>` HTML element represents a multi-line plain-text editing control, useful when you want to allow users to enter a sizeable amount of free-form text, for example a comment on a review or feedback form.
   *
   * **Content:** Text
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autocapitalize` | _String_ | This is a non-standard attribute supported by WebKit on iOS (therefore nearly all browsers running on iOS, including Safari, Firefox, and Chrome), which controls whether and how the text value should be automatically capitalized as it is entered/edited by the user.
   * | `autocomplete` | _AutoComplete_ | This attribute indicates whether the value of the control can be automatically completed by the browser.
   * | `autocorrect` | _String_ | A string which indicates whether or not to activate automatic spelling correction and processing of text substitutions (if any are configured) while the user is editing this textarea.
   * | `autofocus` | _String_ | This Boolean attribute lets you specify that a form control should have input focus when the page loads.
   * | `cols` | _Uint_ | The visible width of the text control, in average character widths.
   * | `dirname` | _String_ | .
   * | `disabled` | _Boolean_ | This Boolean attribute indicates that the user cannot interact with the control.
   * | `form` | _DOMID_ | The form element that the `<textarea>` element is associated with (its "form owner").
   * | `maxlength` | _Uint_ | The maximum number of characters (UTF-16 code units) that the user can enter.
   * | `minlength` | _Uint_ | The minimum number of characters (UTF-16 code units) required that the user should enter.
   * | `name` | _String_ | The name of the control.
   * | `placeholder` | _String_ | A hint to the user of what can be entered in the control.
   * | `readonly` | _Boolean_ | This Boolean attribute indicates that the user cannot modify the value of the control.
   * | `required` | _Boolean_ | This attribute specifies that the user must fill in a value before submitting a form.
   * | `rows` | _NonZeroUint_ | The number of visible text lines for the control.
   * | `spellcheck` | _String_ | Specifies whether the `<textarea>` is subject to spell checking by the underlying browser/OS.
   * | `wrap` | _String_ | Indicates how the control wraps text.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea)
   */
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
  /**
   * The `<tfoot>` HTML element defines a set of rows summarizing the columns of the table.
   *
   * **Content:** Zero or more `<tr>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute specifies how horizontal alignment of each cell content will be handled.
   * | `bgcolor` | _String_ | The background color of the table.
   * | `char` | _String_ | This attribute specifies the alignment of the content in a column to a character.
   * | `charoff` | _String_ | This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   * | `valign` | _String_ | This attribute specifies the vertical alignment of the text within each row of cells of the table footer.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/tfoot)
   */
  tfoot: TfootHTMLAttributes<HTMLTableSectionElement>;
  /**
   * The `<th>` HTML element defines a cell as header of a group of table cells. The exact nature of this group is defined by the scope and headers attributes.
   *
   * **Content:** Flow content, but with no header, footer, sectioning content, or heading content descendants.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `abbr` | _String_ | This attribute contains a short abbreviated description of the cell's content.
   * | `align` | _String_ | This enumerated attribute specifies how the cell content's horizontal alignment will be handled.
   * | `axis` | _String_ | This attribute contains a list of space-separated strings.
   * | `bgcolor` | _String_ | This attribute defines the background color of each cell in a column.
   * | `char` | _String_ | The content in the cell element is aligned to a character.
   * | `charoff` | _String_ | This attribute is used to shift column data to the right of the character specified by the char attribute.
   * | `colspan` | _ColSpan_ | This attribute contains a non-negative integer value that indicates for how many columns the cell extends.
   * | `headers` | _DOMIDList_ | This attribute contains a list of space-separated strings, each corresponding to the id attribute of the `<th>` elements that apply to this element.
   * | `height` | _String_ | This attribute is used to define a recommended cell height.
   * | `rowspan` | _RowSpan_ | This attribute contains a non-negative integer value that indicates for how many rows the cell extends.
   * | `scope` | _String_ | This enumerated attribute defines the cells that the header (defined in the `<th>`) element relates to.
   * | `valign` | _String_ | This attribute specifies how a text is vertically aligned inside a cell.
   * | `width` | _String_ | This attribute is used to define a recommended cell width.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/th)
   */
  th: ThHTMLAttributes<HTMLTableHeaderCellElement>;
  /**
   * The `<thead>` HTML element defines a set of rows defining the head of the columns of the table.
   *
   * **Content:** Zero or more `<tr>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | This enumerated attribute specifies how horizontal alignment of each cell content will be handled.
   * | `bgcolor` | _String_ | This attribute defines the background color of each cell of the column.
   * | `char` | _String_ | This attribute is used to set the character to align the cells in a column on.
   * | `charoff` | _String_ | This attribute is used to indicate the number of characters to offset the column data from the alignment characters specified by the char attribute.
   * | `valign` | _String_ | This attribute specifies the vertical alignment of the text within each row of cells of the table header.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/thead)
   */
  thead: TheadHTMLAttributes<HTMLTableSectionElement>;
  /**
   * The `<time>` HTML element represents a specific period in time. It may include the datetime attribute to translate dates into machine-readable format, allowing for better search engine results or custom features such as reminders.
   *
   * **Content:** Phrasing content.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `datetime` | _String_ | This attribute indicates the time and/or date of the element and must be in one of the formats described below.
   * | `default` | _Boolean_ | .
   * | `kind` | _String_ | .
   * | `label` | _String_ | .
   * | `src` | _URL_ | .
   * | `srclang` | _BCP47_ | .
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/time)
   */
  time: TimeHTMLAttributes<HTMLTimeElement>;
  /**
   * The `<title>` HTML element defines the document's title that is shown in a browser's title bar or a page's tab. It only contains text; tags within the element are ignored.
   *
   * **Content:** Text that is not inter-element whitespace.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title)
   */
  title: HTMLAttributes<HTMLElement>;
  /**
   * The `<tr>` HTML element defines a row of cells in a table. The row's cells can then be established using a mix of `<td>` (data cell) and `<th>` (header cell) elements.
   *
   * **Content:** Zero or more `<td>` and/or `<th>` elements; script-supporting elements (`<script>` and `<template>`) are also allowed
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `align` | _String_ | A DOMString which specifies how the cell's context should be aligned horizontally within the cells in the row; this is shorthand for using align on every cell in the row individually.
   * | `bgcolor` | _String_ | A DOMString specifying a color to apply to the backgrounds of each of the row's cells.
   * | `char` | _String_ | A DOMString which sets the character to align the cells in each of the row's columns on (each row's centering that uses the same character gets aligned with others using the same character .
   * | `charoff` | _String_ | A DOMString indicating the number of characters on the tail end of the column's data should be displayed after the alignment character specified by the char attribute.
   * | `valign` | _String_ | A DOMString specifying the vertical alignment of the text within each cell in the row.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/tr)
   */
  tr: TrHTMLAttributes<HTMLTableRowElement>;
  /**
   * The `<track>` HTML element is used as a child of the media elements, `<audio>` and `<video>`. It lets you specify timed text tracks (or time-based data), for example to automatically handle subtitles. The tracks are formatted in WebVTT format (.vtt files): Web Video Text Tracks.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `default` | _String_ | This attribute indicates that the track should be enabled unless the user's preferences indicate that another track is more appropriate.
   * | `kind` | _String_ | How the text track is meant to be used.
   * | `label` | _String_ | A user-readable title of the text track which is used by the browser when listing available text tracks.
   * | `src` | _String_ | Address of the track (.
   * | `srclang` | _String_ | Language of the track text data.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/track)
   */
  track: TrackHTMLAttributes<HTMLTrackElement>;
  /**
   * The `<tt>` HTML element creates inline text which is presented using the user agent's default monospace font face. This element was created for the purpose of rendering text as it would be displayed on a fixed-width display such as a teletype, text-only screen, or line printer.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/tt)
   */
  tt: HTMLAttributes<HTMLElement>;
  /**
   * The `<u>` HTML element represents a span of inline text which should be rendered in a way that indicates that it has a non-textual annotation. This is rendered by default as a simple solid underline, but may be altered using CSS.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/u)
   */
  u: HTMLAttributes<HTMLElement>;
  /**
   * The `<ul>` HTML element represents an unordered list of items, typically rendered as a bulleted list.
   *
   * **Content:** Zero or more `<li>`, `<script>` and `<template>` elements.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `compact` | _String_ | This Boolean attribute hints that the list should be rendered in a compact style.
   * | `type` | _String_ | This attribute sets the bullet style for the list.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ul)
   */
  ul: UlHTMLAttributes<HTMLUListElement>;
  /**
   * The `<var>` HTML element represents the name of a variable in a mathematical expression or a programming context. It's typically presented using an italicized version of the current typeface, although that behavior is browser-dependent.
   *
   * **Content:** Phrasing content.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/var)
   */
  var: HTMLAttributes<HTMLElement>;
  /**
   * The `<video>` HTML element embeds a media player which supports video playback into the document. You can use `<video>` for audio content as well, but the `<audio>` element may provide a more appropriate user experience.
   *
   * **Content:** If the element has a src attribute: zero or more `<track>` elements, followed by transparent content that contains no media elements–that is no `<audio>` or `<video>` Else: zero or more `<source>` elements, followed by zero or more `<track>` elements, followed by transparent content that contains no media elements–that is no `<audio>` or `<video>`.
   *
   * | Attribute | Type | Description
   * |--|--|--
   * | `autopictureinpicture` | _String_ | A Boolean attribute which if true indicates that the element should automatically toggle picture-in-picture mode when the user switches back and forth between this document and another document or application.
   * | `autoplay` | _Boolean_ | A Boolean attribute; if specified, the video automatically begins to play back as soon as it can do so without stopping to finish loading the data.
   * | `controls` | _Boolean_ | If this attribute is present, the browser will offer controls to allow the user to control video playback, including volume, seeking, and pause/resume playback.
   * | `controlslist` | _String_ | The controlslist attribute, when specified, helps the browser select what controls to show on the media element whenever the browser shows its own set of controls (e.
   * | `crossorigin` | _String_ | This enumerated attribute indicates whether to use CORS to fetch the related video.
   * | `disablepictureinpicture` | _String_ | Prevents the browser from suggesting a Picture-in-Picture context menu or to request Picture-in-Picture automatically in some cases.
   * | `disableremoteplayback` | _String_ | A Boolean attribute used to disable the capability of remote playback in devices that are attached using wired (HDMI, DVI, etc.
   * | `height` | _Uint_ | The height of the video's display area, in CSS pixels (absolute values only; no percentages.
   * | `loop` | _Boolean_ | A Boolean attribute; if specified, the browser will automatically seek back to the start upon reaching the end of the video.
   * | `muted` | _Boolean_ | A Boolean attribute that indicates the default setting of the audio contained in the video.
   * | `playsinline` | _Boolean_ | A Boolean attribute indicating that the video is to be played "inline", that is within the element's playback area.
   * | `poster` | _URL_ | A URL for an image to be shown while the video is downloading.
   * | `preload` | _String_ | This enumerated attribute is intended to provide a hint to the browser about what the author thinks will lead to the best user experience with regards to what content is loaded before the video is played.
   * | `src` | _URL_ | The URL of the video to embed.
   * | `width` | _Uint_ | The width of the video's display area, in CSS pixels (absolute values only; no percentages).
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)
   */
  video: VideoHTMLAttributes<HTMLVideoElement>;
  /**
   * The `<wbr>` HTML element represents a word break opportunity: a position within text where the browser may optionally break a line, though its line-breaking rules would not otherwise create a break at that location.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/wbr)
   */
  wbr: HTMLAttributes<HTMLElement>;
  /**
   * The `<xmp>` HTML element renders text between the start and end tags without interpreting the HTML in between and using a monospaced font. The HTML2 specification recommended that it should be rendered wide enough to allow 80 characters per line.
   *
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/xmp)
   */
  xmp: HTMLAttributes<HTMLElement>;
}
