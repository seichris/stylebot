import { apply, remove } from '@stylebot/dark-mode';
import { GetDarkMode, GetDarkModeResponse, TabMessage } from '@stylebot/types';
import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
  normalizeGlobalDarkModeSettings,
  isDarkModeEnabled,
  nextMinuteDelay,
} from '../dark-mode/settings';

export const initDarkModeController = (): (() => void) => {
  let key: string | undefined;
  let revision = 0;
  let disposed = false;
  let siteEnabled = false;
  let settings = { ...defaultGlobalDarkModeSettings };
  let timer: number | undefined;

  const evaluate = (): void => {
    if (disposed) return;
    if (isDarkModeEnabled(siteEnabled, settings)) apply();
    else remove();
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    if (settings.enabled && settings.scheduleEnabled) {
      // Run at local minute boundaries even while the service worker is asleep.
      // Resume/focus events also recheck after sleep or background suspension.
      timer = window.setTimeout(evaluate, nextMinuteDelay());
    }
  };

  const refresh = (): void => {
    if (!key || disposed) return;
    const currentRevision = ++revision;
    chrome.storage.local.get([key, GLOBAL_DARK_MODE_KEY], items => {
      if (
        chrome.runtime.lastError ||
        disposed ||
        revision !== currentRevision ||
        !key
      )
        return;
      siteEnabled = items[key] === true;
      settings = normalizeGlobalDarkModeSettings(items[GLOBAL_DARK_MODE_KEY]);
      evaluate();
    });
  };

  const onStorageChanged = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ): void => {
    if (
      area === 'local' &&
      key &&
      (changes[key] || changes[GLOBAL_DARK_MODE_KEY])
    )
      refresh();
  };
  const onMessage = (
    message: TabMessage,
    _: chrome.runtime.MessageSender,
    sendResponse: (ready: boolean) => void
  ): void => {
    if (window === window.top && message.name === 'GetDarkModeStatus')
      sendResponse(true);
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') evaluate();
  };

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', evaluate);
  window.addEventListener('pageshow', evaluate);
  const message: GetDarkMode = { name: 'GetDarkMode' };
  chrome.runtime.sendMessage(message, (response: GetDarkModeResponse) => {
    if (chrome.runtime.lastError || disposed || !response?.key) return;
    // Background resolves the top-level site's key for embedded frames too.
    key = response.key;
    refresh();
  });

  return () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', evaluate);
    window.removeEventListener('pageshow', evaluate);
    remove();
  };
};
