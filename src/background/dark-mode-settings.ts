import { GetDarkModeResponse } from '@stylebot/types';
import {
  GLOBAL_DARK_MODE_KEY,
  normalizeGlobalDarkModeSettings,
  isValidGlobalDarkModeSettings,
  isDarkModeEnabled,
} from '../dark-mode/settings';

export const siteKey = (url: string): string | undefined => {
  try {
    const site = new URL(url);
    if (!['http:', 'https:'].includes(site.protocol)) return;
    return `dark-mode:${site.origin}`;
  } catch {
    return;
  }
};

export const getDarkMode = (url: string): Promise<GetDarkModeResponse> =>
  new Promise(resolve => {
    const key = siteKey(url);
    chrome.storage.local.get(
      key ? [key, GLOBAL_DARK_MODE_KEY] : [GLOBAL_DARK_MODE_KEY],
      items => {
        const globalSettings = normalizeGlobalDarkModeSettings(
          items[GLOBAL_DARK_MODE_KEY]
        );
        const siteEnabled = !!key && items[key] === true;
        resolve({
          key,
          siteEnabled,
          globalSettings,
          enabled: !!key && isDarkModeEnabled(siteEnabled, globalSettings),
        });
      }
    );
  });

export const setGlobalDarkModeSettings = (value: unknown): Promise<boolean> =>
  new Promise(resolve => {
    if (!isValidGlobalDarkModeSettings(value)) return resolve(false);
    chrome.storage.local.set({ [GLOBAL_DARK_MODE_KEY]: value }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });

export const setDarkMode = (url: string, value: boolean): Promise<boolean> =>
  new Promise(resolve => {
    const key = siteKey(url);
    if (!key) return resolve(false);
    chrome.storage.local.set({ [key]: value }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
