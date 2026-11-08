import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
  getDarkModeSiteKey,
  isDarkModeEnabled,
  nextMinuteDelay,
  normalizeGlobalDarkModeSettings,
} from '@stylebot/settings';
import type {
  GetDarkMode,
  GetDarkModeResponse,
  GlobalDarkModeSettings,
} from '@stylebot/types';

import { getLoadedDarkMode, loadDarkMode } from './load-dark-mode';

/**
 * The storage key of the Dark mode choice a frame follows: its tab's site's,
 * which embedded frames share. Only a frame that can't name its top-level
 * origin itself, as in Firefox, asks the background.
 */
export const getSiteKey = async (
  win: Window = window
): Promise<string | undefined> => {
  if (win === win.top) {
    return getDarkModeSiteKey(win.location.href);
  }

  const ancestors = win.location.ancestorOrigins;

  if (ancestors?.length) {
    return getDarkModeSiteKey(ancestors[ancestors.length - 1]);
  }

  const message: GetDarkMode = { name: 'GetDarkMode' };
  const response = await chrome.runtime
    .sendMessage<GetDarkMode, GetDarkModeResponse>(message)
    .catch(() => undefined);

  return response?.key;
};

/**
 * Turns Dark mode on and off in this frame as its site's choice, the global
 * settings and their schedule have it, read straight from storage so it
 * applies without the background awake, loading the engine only once it's
 * on. A schedule is checked every minute and whenever the page comes back
 * into view. Returns a function that stops it.
 */
export const initDarkMode = (): (() => void) => {
  let key: string | undefined;
  let revision = 0;
  let disposed = false;
  let siteEnabled = false;
  let settings: GlobalDarkModeSettings = { ...defaultGlobalDarkModeSettings };
  let timer: number | undefined;
  let on = false;

  const evaluate = (): void => {
    if (disposed) {
      return;
    }

    on = !!key && isDarkModeEnabled(siteEnabled, settings);

    if (on) {
      // Turning it off again while the engine loads leaves it off.
      loadDarkMode()
        .then(engine => {
          if (on && !disposed) {
            engine.apply();
          }
        })
        .catch(() => undefined);
    } else {
      getLoadedDarkMode()?.remove();
    }

    window.clearTimeout(timer);
    timer =
      settings.enabled && settings.scheduleEnabled
        ? window.setTimeout(evaluate, nextMinuteDelay())
        : undefined;
  };

  // The site's choice and the settings are read together, and a read a
  // newer change overtook is dropped.
  const refresh = async (): Promise<void> => {
    if (!key || disposed) {
      return;
    }

    const current = ++revision;
    const items = await chrome.storage.local
      .get([key, GLOBAL_DARK_MODE_KEY])
      .catch(() => null);

    if (!items || disposed || current !== revision) {
      return;
    }

    siteEnabled = items[key] === true;
    settings = normalizeGlobalDarkModeSettings(items[GLOBAL_DARK_MODE_KEY]);
    evaluate();
  };

  const onStorageChanged = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ): void => {
    if (
      area === 'local' &&
      key &&
      (changes[key] || changes[GLOBAL_DARK_MODE_KEY])
    ) {
      refresh();
    }
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') {
      evaluate();
    }
  };

  chrome.storage.onChanged.addListener(onStorageChanged);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', evaluate);
  window.addEventListener('pageshow', evaluate);

  getSiteKey().then(siteKey => {
    if (disposed || !siteKey) {
      return;
    }

    key = siteKey;
    refresh();
  });

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', evaluate);
    window.removeEventListener('pageshow', evaluate);
    getLoadedDarkMode()?.remove();
  };
};
