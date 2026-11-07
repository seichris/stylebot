import tinycolor from 'tinycolor2';
import { adaptBackground, adaptForeground, composite } from './colors';

const ATTRIBUTE = 'data-stylebot-dark-id';
const EXCLUDE =
  '#stylebot, #stylebot-reader, script, style, link, meta, head, img, picture, video, canvas, iframe, object, embed';
let enabled = false;
let stylesheet: HTMLStyleElement | undefined;
let observer: MutationObserver | undefined;
let timer: number | undefined;
let nextId = 0;
const elements = new Map<Element, { id: string; previous: string | null }>();

const selectorFor = (element: Element): string => {
  let entry = elements.get(element);
  if (!entry) {
    entry = { id: String(++nextId), previous: element.getAttribute(ATTRIBUTE) };
    elements.set(element, entry);
    element.setAttribute(ATTRIBUTE, entry.id);
  }
  return `[${ATTRIBUTE}="${entry.id}"]`;
};

const optedOut = (style: CSSStyleDeclaration): boolean => {
  const scheme = style.getPropertyValue('color-scheme');
  return /\bdark\b/.test(scheme) || /\bonly\b/.test(scheme);
};

const transformGradient = (value: string): string => {
  // Never rewrite URLs, photographs, or CSS image sprites.
  if (!value.includes('gradient(') || value.includes('url(')) return value;
  return value.replace(/rgba?\([^)]+\)/g, color =>
    adaptBackground(color).toRgbString()
  );
};

const hasDarkViewport = (): boolean => {
  if (!document.elementFromPoint) return false;
  let dark = 0;
  let samples = 0;
  [0.15, 0.5, 0.85].forEach(x =>
    [0.15, 0.5, 0.85].forEach(y => {
      let element = document.elementFromPoint(
        window.innerWidth * x,
        window.innerHeight * y
      );
      if (!element || element.closest('#stylebot, #stylebot-reader')) return;
      const layers: string[] = [];
      while (element) {
        layers.unshift(getComputedStyle(element).backgroundColor);
        element = element.parentElement;
      }
      const background = layers.reduce(
        (bg, color) => composite(color, bg),
        tinycolor('#fff')
      );
      samples++;
      if (background.isDark()) dark++;
    })
  );
  return samples > 0 && dark > samples / 2;
};

const render = (): void => {
  if (!enabled || !document.body) return;
  observer?.disconnect();
  // Always read authored styles. Rebuild in the same task to avoid color drift.
  if (stylesheet?.sheet) stylesheet.sheet.disabled = true;
  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const rootBackground = composite(rootStyle.backgroundColor, '#fff');
    const pageBackground = composite(bodyStyle.backgroundColor, rootBackground);
    const rules: string[] = [];
    const declaredScheme =
      document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute('content') || '';
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
          element.closest('#stylebot, #stylebot-reader') ||
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
          backgrounds.get(element.parentElement as Element) || darkCanvas;
        const background =
          element === document.documentElement
            ? darkCanvas
            : adaptBackground(style.backgroundColor);
        const effectiveBackground = composite(
          background.toRgbString(),
          parentBackground
        );
        backgrounds.set(element, effectiveBackground);
        const declarations = [
          `color: ${adaptForeground(
            style.color,
            effectiveBackground
          ).toRgbString()} !important`,
          `background-color: ${background.toRgbString()} !important`,
        ];
        ['top', 'right', 'bottom', 'left'].forEach(side => {
          const color = style.getPropertyValue(`border-${side}-color`);
          if (tinycolor(color).isValid())
            declarations.push(
              `border-${side}-color: ${adaptBackground(
                color
              ).toRgbString()} !important`
            );
        });
        const gradient = transformGradient(style.backgroundImage);
        if (gradient !== style.backgroundImage)
          declarations.push(`background-image: ${gradient} !important`);
        // Adapt neutral vector icons while preserving colored illustrations.
        if (element instanceof SVGElement) {
          ['fill', 'stroke'].forEach(property => {
            const value = style.getPropertyValue(property);
            const color = tinycolor(value);
            if (
              color.isValid() &&
              color.getAlpha() > 0 &&
              color.toHsl().s < 0.15
            ) {
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
        rules.push(`${selector} { ${declarations.join('; ')}; }`);
        ['::before', '::after'].forEach(pseudo => {
          const pseudoStyle = getComputedStyle(element, pseudo);
          if (
            !pseudoStyle.content ||
            ['none', 'normal'].includes(pseudoStyle.content)
          )
            return;
          const bg = adaptBackground(pseudoStyle.backgroundColor);
          const fg = adaptForeground(
            pseudoStyle.color,
            composite(bg.toRgbString(), effectiveBackground)
          );
          rules.push(
            `${selector}${pseudo} { color: ${fg.toRgbString()} !important; background-color: ${bg.toRgbString()} !important; }`
          );
        });
      });
    }
    if (!stylesheet) {
      stylesheet = document.createElement('style');
      stylesheet.id = 'stylebot-dark-mode';
    }
    stylesheet.textContent = rules.join('\n');
    if (!stylesheet.isConnected)
      document.documentElement.appendChild(stylesheet);
    elements.forEach((entry, element) => {
      if (!element.isConnected) {
        if (entry.previous === null) element.removeAttribute(ATTRIBUTE);
        else element.setAttribute(ATTRIBUTE, entry.previous);
        elements.delete(element);
      }
    });
  } finally {
    if (stylesheet?.sheet) stylesheet.sheet.disabled = false;
    observer?.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
};

const schedule = (): void => {
  if (!enabled || timer !== undefined) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    render();
  }, 150);
};

export const apply = (): void => {
  if (enabled) return;
  enabled = true;
  observer = new MutationObserver(records => {
    if (
      records.some(record => {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        return !target?.closest(
          '#stylebot, #stylebot-reader, #stylebot-dark-mode'
        );
      })
    )
      schedule();
  });
  document.addEventListener('DOMContentLoaded', schedule);
  document.addEventListener('load', schedule, true);
  document.addEventListener('mouseover', schedule);
  document.addEventListener('mouseout', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  window.addEventListener('resize', schedule);
  render();
};

export const remove = (): void => {
  enabled = false;
  observer?.disconnect();
  observer = undefined;
  if (timer !== undefined) window.clearTimeout(timer);
  timer = undefined;
  document.removeEventListener('DOMContentLoaded', schedule);
  document.removeEventListener('load', schedule, true);
  document.removeEventListener('mouseover', schedule);
  document.removeEventListener('mouseout', schedule);
  document.removeEventListener('focusin', schedule);
  document.removeEventListener('focusout', schedule);
  window.removeEventListener('resize', schedule);
  stylesheet?.remove();
  stylesheet = undefined;
  elements.forEach((entry, element) => {
    if (entry.previous === null) element.removeAttribute(ATTRIBUTE);
    else element.setAttribute(ATTRIBUTE, entry.previous);
  });
  elements.clear();
};
