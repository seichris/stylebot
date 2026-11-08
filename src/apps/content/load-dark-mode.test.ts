import type { DarkModeEngine, DarkModeWindow } from './load-dark-mode';

const BUNDLE = 'chrome-extension://stylebot/inject-css/dark-mode.js';

const shared = window as DarkModeWindow;

let loadDarkMode: typeof import('./load-dark-mode').loadDarkMode;
let getLoadedDarkMode: typeof import('./load-dark-mode').getLoadedDarkMode;
let registers: boolean;
let engine: DarkModeEngine;

beforeEach(() => {
  jest.resetModules();
  delete shared.stylebotDarkMode;
  registers = true;
  engine = { apply: jest.fn(), remove: jest.fn() };

  global.chrome = {
    runtime: {
      getURL: jest.fn((path: string) => `chrome-extension://stylebot/${path}`),
    },
  } as unknown as typeof chrome;

  // The bundle registers its engine on the content script's window as it runs.
  jest.doMock(
    BUNDLE,
    () => {
      if (registers) {
        shared.stylebotDarkMode = engine;
      }

      return {};
    },
    { virtual: true }
  );

  ({ loadDarkMode, getLoadedDarkMode } = require('./load-dark-mode'));
});

afterEach(() => {
  delete shared.stylebotDarkMode;
});

describe('loadDarkMode', () => {
  it('loads the engine bundle once, on first use', async () => {
    expect(getLoadedDarkMode()).toBeUndefined();

    await expect(loadDarkMode()).resolves.toBe(engine);
    await expect(loadDarkMode()).resolves.toBe(engine);

    expect(chrome.runtime.getURL).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.getURL).toHaveBeenCalledWith(
      'inject-css/dark-mode.js'
    );
    expect(getLoadedDarkMode()).toBe(engine);
  });

  it('fails, and tries again next time, when the bundle registers no engine', async () => {
    registers = false;

    await expect(loadDarkMode()).rejects.toThrow(
      'inject-css/dark-mode.js did not register Dark mode'
    );

    // The bundle has run already; a fresh copy of it registers this time.
    jest.resetModules();
    registers = true;
    jest.doMock(
      BUNDLE,
      () => {
        shared.stylebotDarkMode = engine;
        return {};
      },
      { virtual: true }
    );

    await expect(loadDarkMode()).resolves.toBe(engine);
  });
});
