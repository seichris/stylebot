import { COMPILED_STYLES_VERSION } from '@stylebot/saved-styles';
import type { PageStyleOptions } from '@stylebot/types';

// localStorage is readable synchronously (chrome.storage isn't), so the
// last-applied result is cached here, one entry per origin.
const CACHE_KEY = 'stylebot-cache';

// Mirrors the compiled style, so applying it at first paint parses nothing.
export type CachedStyle = {
  url: string;
  css: string;
  importUrls: Array<string>;
  enabled: boolean;
};

export type CachedState = {
  styles: Array<CachedStyle>;
  readability: boolean;
  options?: PageStyleOptions;
};

const isStringArray = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isCachedStyle = (value: unknown): value is CachedStyle => {
  const style = value as Partial<CachedStyle> | null;

  return (
    typeof style === 'object' &&
    style !== null &&
    typeof style.url === 'string' &&
    typeof style.css === 'string' &&
    typeof style.enabled === 'boolean' &&
    isStringArray(style.importUrls)
  );
};

const isPageStyleOptions = (value: unknown): value is PageStyleOptions =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every(
    option =>
      typeof option?.value === 'string' && typeof option?.css === 'string'
  );

/**
 * The cached state, if this compiler version wrote it in writeCache's shape;
 * anything else reads as no cache and is overwritten by the next write. The
 * page can write localStorage too, so the cache only paints: the background
 * checks each @import it lists against the stored styles.
 */
export const readCache = (): CachedState | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;

    if (
      cached?.version !== COMPILED_STYLES_VERSION ||
      !Array.isArray(cached.styles) ||
      !cached.styles.every(isCachedStyle) ||
      typeof cached.readability !== 'boolean' ||
      (cached.options !== undefined && !isPageStyleOptions(cached.options))
    ) {
      return null;
    }

    return {
      styles: cached.styles,
      readability: cached.readability,
      ...(cached.options && { options: cached.options }),
    };
  } catch {
    return null;
  }
};

export const writeCache = (state: CachedState): void => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: COMPILED_STYLES_VERSION, ...state })
    );
  } catch {
    // localStorage may be unavailable (e.g. blocked by the page); the next
    // load will simply fall back to the hide-until-ready path again.
  }
};
