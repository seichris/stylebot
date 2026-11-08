/* eslint-disable @typescript-eslint/no-explicit-any */
import { COMPILED_STYLES_VERSION } from '@stylebot/saved-styles';

import { readCache } from './cache';
import { pruneImportCache } from './import-cache';
import { injectStylesheet } from './stylesheet';

const UNLISTED = 'http://intranet.example/site.css';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('injectStylesheet from a cache listing an import no stored style has', () => {
  let sendMessage: jest.Mock;

  beforeEach(() => {
    sendMessage = jest.fn();
    global.chrome = { runtime: { sendMessage } } as unknown as typeof chrome;

    localStorage.setItem(
      'stylebot-cache',
      JSON.stringify({
        version: COMPILED_STYLES_VERSION,
        styles: [
          {
            url: 'elsewhere.example',
            css: 'a{}',
            importUrls: [UNLISTED],
            enabled: true,
          },
        ],
        readability: false,
      })
    );
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.innerHTML = '';
    delete (window as any).stylebotImportCachePrunes;
  });

  const applySeededCache = () => {
    const [style] = readCache()?.styles ?? [];
    injectStylesheet(style.url, style.css, style.importUrls);
  };

  it('caches and applies nothing for an import the background refuses', async () => {
    sendMessage.mockResolvedValue('');

    applySeededCache();
    pruneImportCache(new Set());
    await flush();

    expect(sendMessage).toHaveBeenCalledWith({
      name: 'GetImportCss',
      url: UNLISTED,
    });
    expect(
      localStorage.getItem(`stylebot-import-cache:${UNLISTED}`)
    ).toBeNull();
    expect(
      document.getElementById('stylebot-css-imports-elsewhere.example')
        ?.textContent ?? ''
    ).toBe('');
  });

  it('does not write back an answer that lands after the saved styles pruned its url', async () => {
    let deliver: (css: string) => void = () => undefined;
    sendMessage.mockReturnValue(
      new Promise<string>(resolve => {
        deliver = resolve;
      })
    );

    applySeededCache();
    pruneImportCache(new Set());
    deliver('.late{}');
    await flush();

    expect(
      localStorage.getItem(`stylebot-import-cache:${UNLISTED}`)
    ).toBeNull();
  });
});
