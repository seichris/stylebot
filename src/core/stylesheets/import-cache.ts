import type { GetImportCss, GetImportCssResponse } from '@stylebot/types';

import { pruneFontCache } from './font-cache';

const IMPORT_CACHE_PREFIX = 'stylebot-import-cache:';
const importCacheKey = (url: string) => `${IMPORT_CACHE_PREFIX}${url}`;

type Prunes = { count: number; liveUrls: ReadonlySet<string> };

// On the window Stylebot's scripts on the page share, since each bundles this
// module and a fetch one starts can outlive a prune another runs.
type ImportCacheWindow = Window & { stylebotImportCachePrunes?: Prunes };

const shared = window as ImportCacheWindow;

const getPrunes = (): Prunes =>
  shared.stylebotImportCachePrunes ?? { count: 0, liveUrls: new Set() };

const readImportCache = (url: string): string | null => {
  try {
    return localStorage.getItem(importCacheKey(url));
  } catch {
    return null;
  }
};

const writeImportCache = (url: string, css: string): void => {
  try {
    localStorage.setItem(importCacheKey(url), css);
  } catch {
    // localStorage may be unavailable (e.g. blocked by the page); the next
    // load will simply fetch again instead of hitting the cache.
  }
};

/**
 * Removes cached @import responses for urls no current style references, so
 * editing or removing an @import doesn't leak its entry on this origin, and
 * the font files only those responses loaded.
 */
export const pruneImportCache = (liveUrls: ReadonlySet<string>): void => {
  shared.stylebotImportCachePrunes = {
    count: getPrunes().count + 1,
    liveUrls: new Set(liveUrls),
  };

  try {
    const staleKeys: Array<string> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (
        key?.startsWith(IMPORT_CACHE_PREFIX) &&
        !liveUrls.has(key.slice(IMPORT_CACHE_PREFIX.length))
      ) {
        staleKeys.push(key);
      }
    }

    staleKeys.forEach(key => localStorage.removeItem(key));
  } catch {
    // localStorage may be unavailable; nothing to clean up then.
  }

  pruneFontCache(Array.from(liveUrls, url => readImportCache(url) ?? ''));
};

/**
 * Fetches a stylesheet's CSS via the background service worker, to get
 * around CORS. Empty when it can't be fetched, or when the background won't
 * fetch it for this page because no saved style for it imports it.
 */
export const requestImportCss = (url: string): Promise<string> => {
  const message: GetImportCss = { name: 'GetImportCss', url };

  return chrome.runtime
    .sendMessage<GetImportCss, GetImportCssResponse>(message)
    .catch(() => '');
};

/**
 * Fetches an import and caches the answer, unless a prune while it was in
 * flight dropped its url: the saved styles that prune went by no longer use
 * it, so writing it back would restore an entry they don't account for.
 */
const fetchAndCacheImportCss = async (url: string): Promise<string> => {
  const prunesBefore = getPrunes().count;
  const response = await requestImportCss(url);
  const prunes = getPrunes();

  if (response && (prunes.count === prunesBefore || prunes.liveUrls.has(url))) {
    writeImportCache(url, response);
  }

  return response;
};

/**
 * Resolves from the cache at once, since waking the background can be slow,
 * and refreshes it behind the scenes so a real change reaches the next load.
 */
export const fetchImportCss = (url: string): Promise<string> => {
  const cached = readImportCache(url);

  if (cached === null) {
    return fetchAndCacheImportCss(url);
  }

  fetchAndCacheImportCss(url);
  return Promise.resolve(cached);
};
