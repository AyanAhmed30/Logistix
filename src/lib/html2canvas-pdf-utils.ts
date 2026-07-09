const INLINE_STYLE_PROPS = [
  "display",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "border",
  "borderWidth",
  "borderStyle",
  "borderColor",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "backgroundColor",
  "color",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textDecoration",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "verticalAlign",
  "flex",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "alignSelf",
  "gap",
  "gridTemplateColumns",
  "gridColumn",
  "gridRow",
  "overflow",
  "opacity",
  "visibility",
  "tableLayout",
  "borderCollapse",
] as const;

const COLOR_PROPS = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
]);

const UNSAFE_COLOR_PATTERN = /\b(oklch|lab|lch|color)\(/i;

function toKebabCase(prop: string) {
  return prop.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function isTransparentColor(value: string) {
  return !value || value === "transparent" || value === "rgba(0, 0, 0, 0)";
}

let colorProbeCanvas: HTMLCanvasElement | null = null;

function getColorProbeContext() {
  if (!colorProbeCanvas) {
    colorProbeCanvas = document.createElement("canvas");
    colorProbeCanvas.width = 1;
    colorProbeCanvas.height = 1;
  }
  return colorProbeCanvas.getContext("2d");
}

export function toSafeCssColor(color: string, fallback = "#000000"): string {
  if (!color || isTransparentColor(color)) {
    return color || "transparent";
  }

  const trimmed = color.trim();
  if (!UNSAFE_COLOR_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const ctx = getColorProbeContext();
  if (!ctx) return fallback;

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = fallback;
    ctx.fillStyle = trimmed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return "transparent";
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return fallback;
  }
}

function applySafeComputedStyles(sourceEl: HTMLElement, targetEl: HTMLElement) {
  const computed = getComputedStyle(sourceEl);

  for (const prop of INLINE_STYLE_PROPS) {
    let value = computed[prop];
    if (!value || value === "initial") continue;

    if (COLOR_PROPS.has(prop)) {
      const fallback = prop === "backgroundColor" ? "#ffffff" : "#1e293b";
      value = toSafeCssColor(value, fallback);
    }

    targetEl.style.setProperty(toKebabCase(prop), value);
  }

  const bgImage = computed.backgroundImage;
  if (bgImage && bgImage !== "none") {
    targetEl.style.backgroundImage = "none";
    if (isTransparentColor(targetEl.style.backgroundColor)) {
      targetEl.style.backgroundColor = bgImage.includes("gradient") ? "#e5e5e5" : "#ffffff";
    }
  }

  targetEl.style.boxShadow = "none";
  targetEl.style.outline = "none";
}

function applyTextSpanStyles(span: HTMLSpanElement, sourceEl: HTMLElement) {
  const computed = getComputedStyle(sourceEl);
  span.style.display = "block";
  span.style.width = "100%";
  span.style.whiteSpace = "pre-wrap";
  span.style.wordBreak = "break-word";
  span.style.fontSize = computed.fontSize;
  span.style.fontFamily = computed.fontFamily;
  span.style.fontWeight = computed.fontWeight;
  span.style.lineHeight = computed.lineHeight;
  span.style.color = toSafeCssColor(computed.color, "#1e293b");
  span.style.textAlign = computed.textAlign;
  span.style.padding = computed.padding;
  span.style.minHeight = computed.minHeight;

  if (!span.textContent) {
    span.style.minHeight = "1.25rem";
  }
}

function prepareCloneTree(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  cloneRoot.querySelectorAll("button").forEach((button) => button.remove());

  function walk(sourceNode: Element, cloneNode: Element) {
    if (!(sourceNode instanceof HTMLElement) || !(cloneNode instanceof HTMLElement)) {
      return;
    }

    if (cloneNode.matches("input, textarea")) {
      const sourceInput = sourceNode as HTMLInputElement | HTMLTextAreaElement;
      const span = cloneRoot.ownerDocument!.createElement("span");
      span.textContent = sourceInput.value.trim();
      applyTextSpanStyles(span, sourceInput);
      cloneNode.replaceWith(span);
      return;
    }

    cloneNode.removeAttribute("class");
    applySafeComputedStyles(sourceNode, cloneNode);

    const sourceChildren = Array.from(sourceNode.children);
    const cloneChildren = Array.from(cloneNode.children);
    const childCount = Math.min(sourceChildren.length, cloneChildren.length);

    for (let i = 0; i < childCount; i += 1) {
      walk(sourceChildren[i], cloneChildren[i]);
    }
  }

  walk(sourceRoot, cloneRoot);
}

function sanitizeInlineColors(root: HTMLElement) {
  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;

    for (let i = 0; i < node.style.length; i += 1) {
      const prop = node.style[i];
      const value = node.style.getPropertyValue(prop);
      if (!value || !UNSAFE_COLOR_PATTERN.test(value)) continue;

      const fallback = prop.includes("background") ? "#ffffff" : "#1e293b";
      node.style.setProperty(prop, toSafeCssColor(value, fallback));
    }
  }
}

export function buildIsolatedCanvasElement(sourceElement: HTMLElement): {
  element: HTMLElement;
  cleanup: () => void;
} {
  const width = Math.max(sourceElement.scrollWidth, sourceElement.clientWidth, 720);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "border:0",
    `width:${width}px`,
    "height:1px",
    "opacity:0",
    "pointer-events:none",
  ].join(";");

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) {
    iframe.remove();
    throw new Error("Unable to create isolated PDF render frame.");
  }

  iframeDoc.open();
  iframeDoc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#ffffff;"></body></html>'
  );
  iframeDoc.close();

  const clone = sourceElement.cloneNode(true) as HTMLElement;
  iframeDoc.body.appendChild(clone);
  prepareCloneTree(sourceElement, clone);
  sanitizeInlineColors(clone);

  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("crossorigin", "anonymous");
  });

  return {
    element: clone,
    cleanup: () => {
      iframe.remove();
    },
  };
}

export function finalizeCanvasClone(clonedDoc: Document, clonedRoot: HTMLElement | null) {
  if (!clonedRoot) return;

  clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => node.remove());
  clonedRoot.querySelectorAll("[class]").forEach((node) => node.removeAttribute("class"));
  clonedRoot.querySelectorAll("button").forEach((button) => button.remove());
  sanitizeInlineColors(clonedRoot);

  clonedRoot.querySelectorAll("img").forEach((img) => {
    img.setAttribute("crossorigin", "anonymous");
  });
}
