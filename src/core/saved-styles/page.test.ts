import type { StyleMap } from '@stylebot/types';

import { getStylesForPage } from './page';

const style = (css: string): StyleMap[string] => ({
  css,
  enabled: true,
  readability: false,
  modifiedTime: '2026-01-01T00:00:00.000Z',
});

describe('getStylesForPage', () => {
  it('still finds the styles for a page when another style has an invalid regex pattern', () => {
    const styles: StyleMap = {
      '^https://example\\.com/(': style('a { color: red; }'),
      'example.com': style('b { color: blue; }'),
    };

    const { styles: matched, defaultStyle } = getStylesForPage(
      'https://example.com/',
      styles
    );

    expect(matched.map(({ url }) => url)).toEqual(['example.com']);
    expect(defaultStyle?.url).toBe('example.com');
  });
});
