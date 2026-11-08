import tinycolor from 'tinycolor2';

import { adaptBackground, adaptForeground, composite } from './colors';

const ATTRIBUTE = 'data-stylebot-dark-id';
const STYLESHEET_ID = 'stylebot-dark-mode';

// Stylebot's own UI, which keeps its own themes.
const STYLEBOT_UI =
  '#stylebot, #stylebot-reader, #stylebot-overlay, stylebot-cli-mode, stylebot-gallery-preview';

const EXCLUDE = `${STYLEBOT_UI}, script, style, link, meta, head, img, picture, video, canvas, iframe, object, embed`;

const REFRESH_DELAY_MS = 150;

let enabled = false;
let stylesheet: HTMLStyleElement | undefined;
let observer: MutationObserver | undefined;
let timer: number | undefined;
let nextId = 0;
const elements = new Map<Element, { id: string; previous: string | null }>();

/**
 * The selector of a marker attribute the element gets for its rule, keeping
 * whatever value the attribute had to put back when Dark mode goes.
 */
const selectorFor = (element: Element): string => {
  let entry = elements.get(element);

  if (!entry) {
    entry = { id: String(++nextId), previous: element.getAttribute(ATTRIBUTE) };
    elements.set(element, entry);
    element.setAttribute(ATTRIBUTE, entry.id);
  }

  return `[${ATTRIBUTE}="${entry.id}"]`;
};

const restoreMarker = (
  element: Element,
  { previous }: { previous: string | null }
): void => {
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
const transformGradient = (value: string): string => {
  if (!value.includes('gradient(') || value.includes('url(')) {
    return value;
  }

  return value.replace(/rgba?\([^)]+\)/g, color =>
    adaptBackground(color).toRgbString()
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
 * The rules for one element: its colors, borders and gradients adapted to
 * the dark background it ends up on, and its pseudo-elements'.
 */
const rulesFor = (
  element: Element,
  style: CSSStyleDeclaration,
  background: tinycolor.Instance,
  effectiveBackground: tinycolor.Instance
): Array<string> => {
  const declarations = [
    `color: ${adaptForeground(
      style.color,
      effectiveBackground
    ).toRgbString()} !important`,
    `background-color: ${background.toRgbString()} !important`,
  ];

  ['top', 'right', 'bottom', 'left'].forEach(side => {
    const color = style.getPropertyValue(`border-${side}-color`);

    if (tinycolor(color).isValid()) {
      declarations.push(
        `border-${side}-color: ${adaptBackground(
          color
        ).toRgbString()} !important`
      );
    }
  });

  const gradient = transformGradient(style.backgroundImage);

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
          `${property}: ${adaptForeground(
            value,
            effectiveBackground
          ).toRgbString()} !important`
        );
      }
    });
  }

  const selector = selectorFor(element);
  const rules = [`${selector} { ${declarations.join('; ')}; }`];

  ['::before', '::after'].forEach(pseudo => {
    const pseudoStyle = getComputedStyle(element, pseudo);

    if (
      !pseudoStyle.content ||
      ['none', 'normal'].includes(pseudoStyle.content)
    ) {
      return;
    }

    const bg = adaptBackground(pseudoStyle.backgroundColor);
    const fg = adaptForeground(
      pseudoStyle.color,
      composite(bg.toRgbString(), effectiveBackground)
    );

    rules.push(
      `${selector}${pseudo} { color: ${fg.toRgbString()} !important; background-color: ${bg.toRgbString()} !important; }`
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

    if (
      !/\b(dark|only)\b/.test(declaredScheme) &&
      !optedOut(rootStyle) &&
      !optedOut(bodyStyle) &&
      pageBackground.isLight() &&
      !hasDarkViewport()
    ) {
      const backgrounds = new Map<Element, tinycolor.Instance>();
      const excluded = new Set<Element>();
      const darkCanvas = adaptBackground(pageBackground.toRgbString());

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
            : adaptBackground(style.backgroundColor);
        const effectiveBackground = composite(
          background.toRgbString(),
          parentBackground
        );

        backgrounds.set(element, effectiveBackground);
        rules.push(
          ...rulesFor(element, style, background, effectiveBackground)
        );
      });
    }

    if (!stylesheet) {
      stylesheet = document.createElement('style');
      stylesheet.id = STYLESHEET_ID;
    }

    stylesheet.textContent = rules.join('\n');

    if (!stylesheet.isConnected) {
      insertStylesheet(stylesheet);
    }

    elements.forEach((entry, element) => {
      if (!element.isConnected) {
        restoreMarker(element, entry);
        elements.delete(element);
      }
    });
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

const LISTENED = [
  'DOMContentLoaded',
  'mouseover',
  'mouseout',
  'focusin',
  'focusout',
] as const;

/**
 * Turns Dark mode on for the document, and keeps it current as the page
 * changes, loads more, or reacts to hover and focus.
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
  document.addEventListener('load', schedule, true);
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
  document.removeEventListener('load', schedule, true);
  window.removeEventListener('resize', schedule);
  stylesheet?.remove();
  stylesheet = undefined;
  elements.forEach((entry, element) => restoreMarker(element, entry));
  elements.clear();
};
