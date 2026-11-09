import tinycolor from 'tinycolor2';

import { composite, createPalette } from './colors';

const ATTRIBUTE = 'data-stylebot-dark-id';
const STYLESHEET_ID = 'stylebot-dark-mode';

// Stylebot's own UI, which keeps its own themes.
const STYLEBOT_UI =
  '#stylebot, #stylebot-reader, #stylebot-overlay, stylebot-cli-mode, stylebot-gallery-preview';

const EXCLUDE = `${STYLEBOT_UI}, script, style, link, meta, head, img, picture, video, canvas, iframe, object, embed`;

const REFRESH_DELAY_MS = 150;

type Palette = ReturnType<typeof createPalette>;

let enabled = false;
let stylesheet: HTMLStyleElement | undefined;
let observer: MutationObserver | undefined;
let timer: number | undefined;
let nextId = 0;
let ruleIds = new Map<string, string>();
const elements = new Map<Element, string | null>();

/**
 * Updates the markers after all computed styles have been read. Elements
 * that no longer get a rule must stop matching their old, shared rule.
 */
const updateMarkers = (markers: Map<Element, string>): void => {
  elements.forEach((previous, element) => {
    if (!markers.has(element)) {
      restoreMarker(element, previous);
      elements.delete(element);
    }
  });

  markers.forEach((id, element) => {
    const current = element.getAttribute(ATTRIBUTE);

    if (!elements.has(element)) {
      elements.set(element, current);
    }

    if (current !== id) {
      element.setAttribute(ATTRIBUTE, id);
    }
  });
};

const restoreMarker = (element: Element, previous: string | null): void => {
  if (previous === null) {
    element.removeAttribute(ATTRIBUTE);
  } else {
    element.setAttribute(ATTRIBUTE, previous);
  }
};

/**
 * Whether an element declares its own dark scheme, or that it's only light.
 */
const optedOut = (style: CSSStyleDeclaration): boolean => {
  const scheme = style.getPropertyValue('color-scheme');

  return /\bdark\b/.test(scheme) || /\bonly\b/.test(scheme);
};

/**
 * A gradient with its colors darkened; any background with an image in it,
 * a photo or a sprite, is left alone.
 */
const transformGradient = (value: string, palette: Palette): string => {
  if (!value.includes('gradient(') || value.includes('url(')) {
    return value;
  }

  return value.replace(/rgba?\([^)]+\)/g, color =>
    palette.background(color).toRgbString()
  );
};

/**
 * Whether most of the viewport already looks dark, sampled at nine points
 * through the backgrounds stacked there.
 */
const hasDarkViewport = (): boolean => {
  if (!document.elementFromPoint) {
    return false;
  }

  let dark = 0;
  let samples = 0;

  [0.15, 0.5, 0.85].forEach(x =>
    [0.15, 0.5, 0.85].forEach(y => {
      let element = document.elementFromPoint(
        window.innerWidth * x,
        window.innerHeight * y
      );

      if (!element || element.closest(STYLEBOT_UI)) {
        return;
      }

      const layers: Array<string> = [];

      while (element) {
        layers.unshift(getComputedStyle(element).backgroundColor);
        element = element.parentElement;
      }

      const background = layers.reduce(
        (bg, color) => composite(color, bg),
        tinycolor('#fff')
      );

      samples++;

      if (background.isDark()) {
        dark++;
      }
    })
  );

  return samples > 0 && dark > samples / 2;
};

/**
 * Puts the generated stylesheet ahead of the styles Stylebot injects for
 * the page, so a saved style wins over Dark mode where the two tie.
 */
const insertStylesheet = (style: HTMLStyleElement): void => {
  const firstSaved = document.documentElement.querySelector(
    ':scope > style[id^="stylebot-css-"]'
  );

  document.documentElement.insertBefore(style, firstSaved);
};

/**
 * The rules for one element, without the shared selector prefix. Includes
 * its colors, borders, gradients, and pseudo-elements.
 */
const rulesFor = (
  element: Element,
  style: CSSStyleDeclaration,
  background: tinycolor.Instance,
  effectiveBackground: tinycolor.Instance,
  palette: Palette
): Array<string> => {
  const declarations = [
    `color: ${palette.foreground(style.color, effectiveBackground)} !important`,
    `background-color: ${background.toRgbString()} !important`,
  ];

  ['top', 'right', 'bottom', 'left'].forEach(side => {
    const color = palette.background(
      style.getPropertyValue(`border-${side}-color`)
    );

    if (color.isValid()) {
      declarations.push(
        `border-${side}-color: ${color.toRgbString()} !important`
      );
    }
  });

  const gradient = transformGradient(style.backgroundImage, palette);

  if (gradient !== style.backgroundImage) {
    declarations.push(`background-image: ${gradient} !important`);
  }

  // Neutral vector icons are adapted; colored illustrations keep their colors.
  if (element instanceof SVGElement) {
    ['fill', 'stroke'].forEach(property => {
      const value = style.getPropertyValue(property);
      const color = tinycolor(value);

      if (color.isValid() && color.getAlpha() > 0 && color.toHsl().s < 0.15) {
        declarations.push(
          `${property}: ${palette.foreground(
            value,
            effectiveBackground
          )} !important`
        );
      }
    });
  }

  const rules = [` { ${declarations.join('; ')}; }`];

  ['::before', '::after'].forEach(pseudo => {
    const pseudoStyle = getComputedStyle(element, pseudo);

    if (
      !pseudoStyle.content ||
      ['none', 'normal'].includes(pseudoStyle.content)
    ) {
      return;
    }

    const bg = palette.background(pseudoStyle.backgroundColor).toRgbString();
    const fg = palette.foreground(
      pseudoStyle.color,
      palette.composite(bg, effectiveBackground)
    );

    rules.push(
      `${pseudo} { color: ${fg} !important; background-color: ${bg} !important; }`
    );
  });

  return rules;
};

/**
 * Rebuilds the generated stylesheet from the page's own colors, read with
 * it switched off so a pass never adapts colors it adapted itself. A page
 * that's already dark, or declares a dark or only-light scheme, gets none.
 */
const render = (): void => {
  if (!enabled || !document.body) {
    return;
  }

  observer?.disconnect();

  if (stylesheet?.sheet) {
    stylesheet.sheet.disabled = true;
  }

  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const rootBackground = composite(rootStyle.backgroundColor, '#fff');
    const pageBackground = composite(bodyStyle.backgroundColor, rootBackground);
    const declaredScheme =
      document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute('content') ?? '';
    const rules: Array<string> = [];
    const markers = new Map<Element, string>();
    const currentRuleIds = new Map<string, string>();

    if (
      !/\b(dark|only)\b/.test(declaredScheme) &&
      !optedOut(rootStyle) &&
      !optedOut(bodyStyle) &&
      pageBackground.isLight() &&
      !hasDarkViewport()
    ) {
      const backgrounds = new Map<Element, tinycolor.Instance>();
      const excluded = new Set<Element>();
      const palette = createPalette();
      const darkCanvas = palette.background(pageBackground.toRgbString());

      backgrounds.set(document.documentElement, darkCanvas);
      rules.push(
        `html { background-color: ${darkCanvas.toRgbString()} !important; color-scheme: dark !important; }`
      );

      document.querySelectorAll('html, body, body *').forEach(element => {
        if (
          element.matches(EXCLUDE) ||
          element.closest(STYLEBOT_UI) ||
          (element.parentElement && excluded.has(element.parentElement))
        ) {
          excluded.add(element);
          return;
        }

        const style = getComputedStyle(element);

        if (optedOut(style)) {
          excluded.add(element);
          return;
        }

        const parentBackground =
          backgrounds.get(element.parentElement as Element) ?? darkCanvas;
        const background =
          element === document.documentElement
            ? darkCanvas
            : palette.background(style.backgroundColor);
        const effectiveBackground = palette.composite(
          background.toRgbString(),
          parentBackground
        );

        backgrounds.set(element, effectiveBackground);
        const elementRules = rulesFor(
          element,
          style,
          background,
          effectiveBackground,
          palette
        );
        const key = elementRules.join('\n');
        let id = currentRuleIds.get(key);

        if (!id) {
          id = ruleIds.get(key) ?? String(++nextId);
          currentRuleIds.set(key, id);
          const selector = `[${ATTRIBUTE}="${id}"]`;

          elementRules.forEach(rule => rules.push(selector + rule));
        }

        markers.set(element, id);
      });
    }

    updateMarkers(markers);
    ruleIds = currentRuleIds;

    if (!stylesheet) {
      stylesheet = document.createElement('style');
      stylesheet.id = STYLESHEET_ID;
    }

    stylesheet.textContent = rules.join('\n');

    if (!stylesheet.isConnected) {
      insertStylesheet(stylesheet);
    }
  } finally {
    if (stylesheet?.sheet) {
      stylesheet.sheet.disabled = false;
    }

    observer?.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
};

/**
 * Renders again once the page settles, at most once per short pause.
 */
const schedule = (): void => {
  if (!enabled || timer !== undefined) {
    return;
  }

  timer = window.setTimeout(() => {
    timer = undefined;
    render();
  }, REFRESH_DELAY_MS);
};

const LISTENED = ['DOMContentLoaded', 'focusin', 'focusout'] as const;

const onLoad = (event: Event): void => {
  // Replacing the generated rules can fire a load event on this stylesheet.
  if (event.target !== stylesheet) {
    schedule();
  }
};

/**
 * Turns Dark mode on for the document, and keeps it current as the page
 * changes, loads more, or reacts to focus.
 */
export const applyDarkMode = (): void => {
  if (enabled) {
    return;
  }

  enabled = true;
  observer = new MutationObserver(records => {
    const fromPage = records.some(record => {
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;

      return !target?.closest(`${STYLEBOT_UI}, #${STYLESHEET_ID}`);
    });

    if (fromPage) {
      schedule();
    }
  });

  LISTENED.forEach(type => document.addEventListener(type, schedule));
  document.addEventListener('load', onLoad, true);
  window.addEventListener('resize', schedule);
  render();
};

/**
 * Turns Dark mode off for the document: its stylesheet, markers, observer,
 * timer and listeners all go, and the page's own styles were never edited.
 */
export const removeDarkMode = (): void => {
  enabled = false;
  observer?.disconnect();
  observer = undefined;

  if (timer !== undefined) {
    window.clearTimeout(timer);
  }

  timer = undefined;
  LISTENED.forEach(type => document.removeEventListener(type, schedule));
  document.removeEventListener('load', onLoad, true);
  window.removeEventListener('resize', schedule);
  stylesheet?.remove();
  stylesheet = undefined;
  elements.forEach((previous, element) => restoreMarker(element, previous));
  elements.clear();
  ruleIds.clear();
};
