import {
  GLOBAL_DARK_MODE_KEY,
  getDarkModeSiteKey,
  isDarkModeEnabled,
  isValidGlobalDarkModeSettings,
  normalizeGlobalDarkModeSettings,
} from '@stylebot/settings';
import type { GetDarkModeResponse } from '@stylebot/types';

/**
 * Dark mode for the site of a url: its own choice, the global settings, and
 * whether it's on there now. A url off the web has no key, and is never on.
 */
export const getDarkMode = async (
  url: string
): Promise<GetDarkModeResponse> => {
  const key = getDarkModeSiteKey(url);
  const items = await chrome.storage.local.get(
    key ? [key, GLOBAL_DARK_MODE_KEY] : [GLOBAL_DARK_MODE_KEY]
  );
  const globalSettings = normalizeGlobalDarkModeSettings(
    items[GLOBAL_DARK_MODE_KEY]
  );
  const siteEnabled = !!key && items[key] === true;

  return {
    key,
    siteEnabled,
    globalSettings,
    enabled: !!key && isDarkModeEnabled(siteEnabled, globalSettings),
  };
};

/**
 * Saves a site's own Dark mode choice. Resolves whether it was saved.
 */
export const setDarkMode = async (
  url: string,
  value: boolean
): Promise<boolean> => {
  const key = getDarkModeSiteKey(url);

  if (!key) {
    return false;
  }

  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch {
    return false;
  }
};

/**
 * Saves the global settings, if they're valid. Resolves whether they were.
 */
export const setGlobalDarkModeSettings = async (
  value: unknown
): Promise<boolean> => {
  if (!isValidGlobalDarkModeSettings(value)) {
    return false;
  }

  try {
    await chrome.storage.local.set({
      [GLOBAL_DARK_MODE_KEY]: normalizeGlobalDarkModeSettings(value),
    });
    return true;
  } catch {
    return false;
  }
};
