export type DarkModeEngine = { apply: () => void; remove: () => void };

// The inject-css/dark-mode bundle sets stylebotDarkMode once it has run.
export type DarkModeWindow = Window & { stylebotDarkMode?: DarkModeEngine };

let loading: Promise<DarkModeEngine> | null = null;

/**
 * Loads Dark mode's engine, which ships as its own bundle so the content
 * script every frame runs doesn't carry it on pages Dark mode is off for. A
 * failed load is forgotten, so the next try loads it again.
 */
export const loadDarkMode = (): Promise<DarkModeEngine> => {
  if (!loading) {
    const url = chrome.runtime.getURL('inject-css/dark-mode.js');

    loading = import(/* webpackIgnore: true */ url)
      .then(() => {
        const engine = (window as DarkModeWindow).stylebotDarkMode;

        if (!engine) {
          throw new Error('inject-css/dark-mode.js did not register Dark mode');
        }

        return engine;
      })
      .catch((e: unknown) => {
        loading = null;
        throw e;
      });
  }

  return loading;
};

/**
 * The engine if it has loaded, which turning Dark mode off never needs to.
 */
export const getLoadedDarkMode = (): DarkModeEngine | undefined =>
  (window as DarkModeWindow).stylebotDarkMode;
