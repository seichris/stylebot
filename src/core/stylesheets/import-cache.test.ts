/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchImportCss, pruneImportCache } from './import-cache';

global.chrome = {
  runtime: {
    sendMessage: () => Promise.resolve(''),
  },
} as unknown as typeof chrome;

describe('import-cache', () => {
  afterEach(() => {
    localStorage.clear();
    delete (window as any).stylebotImportCachePrunes;
  });

  describe('fetchImportCss', () => {
    const originalSendMessage = global.chrome.runtime.sendMessage;

    afterEach(() => {
      global.chrome.runtime.sendMessage = originalSendMessage;
    });

    it('fetches and caches the response when nothing is cached', async () => {
      const sendMessage = jest.fn((_message: any) =>
        Promise.resolve('.a{color:red}')
      );
      global.chrome.runtime.sendMessage = sendMessage as any;

      const result = await fetchImportCss('https://example.com/a.css');

      expect(result).toBe('.a{color:red}');
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(
        localStorage.getItem('stylebot-import-cache:https://example.com/a.css')
      ).toBe('.a{color:red}');
    });

    it('resolves from the cache without waiting on the fetch to complete', async () => {
      localStorage.setItem(
        'stylebot-import-cache:https://example.com/a.css',
        '.cached{}'
      );

      let deliver: (response: string) => void = () => undefined;
      const sendMessage = jest.fn(
        (_message: any) =>
          new Promise<string>(resolve => {
            deliver = resolve;
          })
      );
      global.chrome.runtime.sendMessage = sendMessage as any;

      const result = await fetchImportCss('https://example.com/a.css');

      expect(result).toBe('.cached{}');
      // still refreshes the cache in the background
      expect(sendMessage).toHaveBeenCalledTimes(1);

      deliver('.fresh{}');
    });

    it('resolves empty and does not cache if the background is unreachable', async () => {
      const sendMessage = jest.fn((_message: any) =>
        Promise.reject(new Error('Could not establish connection.'))
      );
      global.chrome.runtime.sendMessage = sendMessage as any;

      const result = await fetchImportCss('https://example.com/down.css');

      expect(result).toBe('');
      expect(
        localStorage.getItem(
          'stylebot-import-cache:https://example.com/down.css'
        )
      ).toBeNull();
    });

    it('does not cache an empty response', async () => {
      const sendMessage = jest.fn((_message: any) => Promise.resolve(''));
      global.chrome.runtime.sendMessage = sendMessage as any;

      await fetchImportCss('https://example.com/missing.css');

      expect(
        localStorage.getItem(
          'stylebot-import-cache:https://example.com/missing.css'
        )
      ).toBeNull();
    });

    describe('with a prune while the fetch is in flight', () => {
      const URL = 'https://example.com/a.css';
      const KEY = `stylebot-import-cache:${URL}`;
      let deliver: (response: string) => void;

      beforeEach(() => {
        global.chrome.runtime.sendMessage = jest.fn(
          (_message: any) =>
            new Promise<string>(resolve => {
              deliver = resolve;
            })
        ) as any;
      });

      it('does not write back an answer for a url the prune dropped, but still resolves with it', async () => {
        const result = fetchImportCss(URL);

        pruneImportCache(new Set());
        deliver('.late{}');

        await expect(result).resolves.toBe('.late{}');
        expect(localStorage.getItem(KEY)).toBeNull();
      });

      it("does not restore a page-seeded entry the prune removed when the cache's refresh lands late", async () => {
        localStorage.setItem(KEY, '.seeded{}');

        await expect(fetchImportCss(URL)).resolves.toBe('.seeded{}');

        pruneImportCache(new Set());
        expect(localStorage.getItem(KEY)).toBeNull();

        deliver('.late{}');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(localStorage.getItem(KEY)).toBeNull();
      });

      it('caches an answer for a url the prune kept', async () => {
        const result = fetchImportCss(URL);

        pruneImportCache(new Set([URL]));
        deliver('.kept{}');
        await result;

        expect(localStorage.getItem(KEY)).toBe('.kept{}');
      });

      it("honours a prune run by another of Stylebot's scripts on the page", async () => {
        const result = fetchImportCss(URL);

        jest.isolateModules(() => {
          const other = require('./import-cache');
          other.pruneImportCache(new Set());
        });
        deliver('.late{}');
        await result;

        expect(localStorage.getItem(KEY)).toBeNull();
      });
    });
  });

  describe('pruneImportCache', () => {
    it('removes cache entries for urls that are no longer live', () => {
      localStorage.setItem(
        'stylebot-import-cache:https://example.com/still-used.css',
        '.a{}'
      );
      localStorage.setItem(
        'stylebot-import-cache:https://example.com/removed.css',
        '.b{}'
      );

      pruneImportCache(new Set(['https://example.com/still-used.css']));

      expect(
        localStorage.getItem(
          'stylebot-import-cache:https://example.com/still-used.css'
        )
      ).toBe('.a{}');
      expect(
        localStorage.getItem(
          'stylebot-import-cache:https://example.com/removed.css'
        )
      ).toBeNull();
    });

    it('removes cached font files only a removed import loaded', () => {
      const kept = 'https://fonts.gstatic.com/s/kept/a.woff2';
      const removed = 'https://fonts.gstatic.com/s/removed/b.woff2';

      localStorage.setItem(
        'stylebot-import-cache:https://example.com/still-used.css',
        `@font-face{src:url(${kept})}`
      );
      localStorage.setItem(
        'stylebot-import-cache:https://example.com/removed.css',
        `@font-face{src:url(${removed})}`
      );
      localStorage.setItem(`stylebot-font-cache:${kept}`, 'a');
      localStorage.setItem(`stylebot-font-cache:${removed}`, 'b');

      pruneImportCache(new Set(['https://example.com/still-used.css']));

      expect(localStorage.getItem(`stylebot-font-cache:${kept}`)).toBe('a');
      expect(localStorage.getItem(`stylebot-font-cache:${removed}`)).toBeNull();
    });

    it('leaves unrelated localStorage keys alone', () => {
      localStorage.setItem('some-other-key', 'value');

      pruneImportCache(new Set());

      expect(localStorage.getItem('some-other-key')).toBe('value');
    });
  });
});
