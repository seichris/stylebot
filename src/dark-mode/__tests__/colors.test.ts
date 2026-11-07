import tinycolor from 'tinycolor2';
import { adaptBackground, adaptForeground, composite } from '../colors';

describe('adaptive colors', () => {
  it('darkens light surfaces, preserves hue and alpha, and keeps dark surfaces', () => {
    const source = tinycolor('rgba(180, 220, 250, 0.7)');
    const result = adaptBackground(source.toRgbString());
    expect(result.isDark()).toBe(true);
    expect(result.toHsl().h).toBeCloseTo(source.toHsl().h);
    expect(result.getAlpha()).toBe(0.7);
    expect(adaptBackground('#222').toHexString()).toBe('#222222');
    expect(adaptBackground('transparent').getAlpha()).toBe(0);
  });

  it.each(['#000', '#333', '#0000ff', '#008800', '#cc0000'])(
    'makes %s text readable against a transformed surface',
    value => {
      const background = adaptBackground('#fff');
      const foreground = adaptForeground(value, background);
      expect(
        tinycolor.readability(foreground, background)
      ).toBeGreaterThanOrEqual(4.5);
      if (tinycolor(value).toHsl().s > 0)
        expect(foreground.toHsl().h).toBeCloseTo(tinycolor(value).toHsl().h);
    }
  );

  it('preserves transparent text and already readable colors', () => {
    expect(adaptForeground('transparent', tinycolor('#222')).getAlpha()).toBe(
      0
    );
    expect(adaptForeground('#fff', tinycolor('#222')).toHexString()).toBe(
      '#ffffff'
    );
  });

  it('composites translucent backgrounds before assessing contrast', () => {
    expect(composite('rgba(255,255,255,0.5)', '#000').toHexString()).toBe(
      '#808080'
    );
  });
});
