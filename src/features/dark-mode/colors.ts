import tinycolor from 'tinycolor2';

/**
 * A color laid over a background, as the eye sees it: the result is opaque.
 */
export const composite = (
  foreground: string,
  background: string | tinycolor.Instance
): tinycolor.Instance => {
  const fg = tinycolor(foreground).toRgb();
  const bg = tinycolor(background).toRgb();

  return tinycolor({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  });
};

/**
 * A light background darkened with its hue kept, the lighter it was the
 * darker it gets. Dark, transparent and invalid colors stay as they are.
 */
export const adaptBackground = (value: string): tinycolor.Instance => {
  const color = tinycolor(value);

  if (!color.isValid() || color.getAlpha() === 0 || color.isDark()) {
    return color;
  }

  const hsl = color.toHsl();

  return tinycolor({ ...hsl, l: 0.1 + (1 - hsl.l) * 0.3 });
};

/**
 * A text color lightened with its hue and alpha kept, just enough to reach
 * a 4.5:1 contrast with the background it sits on.
 */
export const adaptForeground = (
  value: string,
  background: tinycolor.Instance
): tinycolor.Instance => {
  const color = tinycolor(value);

  if (!color.isValid() || color.getAlpha() === 0) {
    return color;
  }

  const contrast = (candidate: tinycolor.Instance) =>
    tinycolor.readability(
      composite(candidate.toRgbString(), background),
      background
    );

  if (contrast(color) >= 4.5) {
    return color;
  }

  const hsl = color.toHsl();
  let result = color;

  for (let l = Math.max(hsl.l, 0.78); l <= 1.001; l += 0.02) {
    result = tinycolor({ ...hsl, l: Math.min(l, 1) });

    if (contrast(result) >= 4.5) {
      return result;
    }
  }

  return result;
};
