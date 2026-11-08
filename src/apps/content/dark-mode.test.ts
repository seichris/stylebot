jest.mock('./load-dark-mode', () => ({
  loadDarkMode: jest.fn(),
  getLoadedDarkMode: jest.fn(),
}));

import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
} from '@stylebot/settings';

import { getSiteKey, initDarkMode } from './dark-mode';
import { getLoadedDarkMode, loadDarkMode } from './load-dark-mode';

// jsdom's page, the top frame here.
const KEY = 'dark-mode:http://localhost';

type Listener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string
) => void;

let items: Record<string, unknown>;
let listeners: Array<Listener>;
let pendingReads: Array<() => void>;
let delayReads: boolean;
let sendMessage: jest.Mock;
let dispose: (() => void) | undefined;
let loaded: boolean;

const engine = { apply: jest.fn(), remove: jest.fn() };

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

/**
 * Changes storage the way another page would, telling every listener.
 */
const change = (changes: Record<string, unknown>) => {
  Object.assign(items, changes);
  listeners.forEach(listener =>
    listener(
      Object.fromEntries(
        Object.entries(changes).map(([key, newValue]) => [key, { newValue }])
      ),
      'local'
    )
  );
};

const globalOn = (overrides = {}) => ({
  [GLOBAL_DARK_MODE_KEY]: {
    ...defaultGlobalDarkModeSettings,
    enabled: true,
    ...overrides,
  },
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 7, 17, 59, 45));
  jest.clearAllMocks();
  items = { [KEY]: false };
  listeners = [];
  pendingReads = [];
  delayReads = false;
  sendMessage = jest.fn(async () => ({ key: KEY }));
  loaded = false;
  (loadDarkMode as jest.Mock).mockImplementation(async () => {
    loaded = true;
    return engine;
  });
  (getLoadedDarkMode as jest.Mock).mockImplementation(() =>
    loaded ? engine : undefined
  );

  global.chrome = {
    runtime: { sendMessage },
    storage: {
      onChanged: {
        addListener: (listener: Listener) => listeners.push(listener),
        removeListener: (listener: Listener) => {
          listeners = listeners.filter(each => each !== listener);
        },
      },
      local: {
        get: jest.fn(() => {
          const snapshot = { ...items };

          return delayReads
            ? new Promise(resolve => pendingReads.push(() => resolve(snapshot)))
            : Promise.resolve(snapshot);
        }),
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  jest.useRealTimers();
});

describe('initDarkMode', () => {
  it('loads the engine only once Dark mode is on, without waking the background in the top frame', async () => {
    dispose = initDarkMode();
    await flush();
    expect(loadDarkMode).not.toHaveBeenCalled();

    change({ [KEY]: true });
    await flush();
    expect(loadDarkMode).toHaveBeenCalledTimes(1);
    expect(engine.apply).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();

    change({ [KEY]: false });
    await flush();
    expect(engine.remove).toHaveBeenCalledTimes(1);
  });

  it('drops a read a newer change overtook, and ignores other sites’ choices', async () => {
    delayReads = true;
    dispose = initDarkMode();
    await flush();
    change({ [KEY]: true });

    pendingReads[1]();
    await flush();
    expect(engine.apply).toHaveBeenCalledTimes(1);

    pendingReads[0]();
    await flush();
    expect(engine.remove).not.toHaveBeenCalled();

    listeners.forEach(listener =>
      listener(
        { 'dark-mode:https://other.example': { newValue: true } },
        'local'
      )
    );
    expect(pendingReads).toHaveLength(2);
  });

  it('stays off when it’s turned off again while the engine loads', async () => {
    let finishLoading: () => void = () => undefined;

    (loadDarkMode as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          finishLoading = () => {
            loaded = true;
            resolve(engine);
          };
        })
    );
    items[KEY] = true;
    dispose = initDarkMode();
    await flush();

    change({ [KEY]: false });
    await flush();
    finishLoading();
    await flush();

    expect(engine.apply).not.toHaveBeenCalled();
  });

  it('turns on at 18:00 and off at 08:00 by itself, on a schedule', async () => {
    Object.assign(items, globalOn());
    dispose = initDarkMode();
    await flush();
    expect(engine.apply).not.toHaveBeenCalled();

    jest.advanceTimersByTime(15000);
    await flush();
    expect(engine.apply).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(2026, 10, 8, 7, 59, 59));
    window.dispatchEvent(new Event('pageshow'));
    await flush();
    engine.remove.mockClear();
    jest.advanceTimersByTime(1000);
    expect(engine.remove).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('checks again on focus after sleep or a clock change, and follows the global settings as they change', async () => {
    dispose = initDarkMode();
    await flush();

    change(globalOn({ scheduleEnabled: false }));
    await flush();
    expect(engine.apply).toHaveBeenCalledTimes(1);

    change(globalOn());
    await flush();
    jest.setSystemTime(new Date(2026, 10, 7, 22));
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(engine.apply).toHaveBeenCalledTimes(2);

    engine.remove.mockClear();
    jest.setSystemTime(new Date(2026, 10, 8, 9));
    window.dispatchEvent(new Event('pageshow'));
    expect(engine.remove).toHaveBeenCalledTimes(1);

    engine.apply.mockClear();
    change({ [KEY]: true });
    change({ [GLOBAL_DARK_MODE_KEY]: defaultGlobalDarkModeSettings });
    await flush();
    expect(engine.apply).toHaveBeenCalled();
  });

  it('stops listening and takes Dark mode off once stopped', async () => {
    items[KEY] = true;
    dispose = initDarkMode();
    await flush();
    dispose();
    dispose = undefined;

    expect(engine.remove).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);

    engine.apply.mockClear();
    change({ [KEY]: true });
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(engine.apply).not.toHaveBeenCalled();
  });
});

describe('getSiteKey', () => {
  /**
   * A frame's window: framed in another page unless it's the top one.
   */
  const frame = ({
    href,
    ancestorOrigins,
    top = false,
  }: {
    href: string;
    ancestorOrigins?: Array<string>;
    top?: boolean;
  }): Window => {
    const win = {
      location: { href, ancestorOrigins },
      top: undefined as unknown,
    };

    win.top = top ? win : {};
    return win as unknown as Window;
  };

  it('keys the top frame by its own site', async () => {
    await expect(
      getSiteKey(frame({ href: 'https://example.com/a', top: true }))
    ).resolves.toBe('dark-mode:https://example.com');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keys an embedded frame by its tab’s site, from its ancestors', async () => {
    await expect(
      getSiteKey(
        frame({
          href: 'https://widgets.example/embed',
          ancestorOrigins: ['https://middle.example', 'https://example.com'],
        })
      )
    ).resolves.toBe('dark-mode:https://example.com');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('asks the background for an embedded frame that can’t see its ancestors', async () => {
    await expect(
      getSiteKey(frame({ href: 'https://widgets.example/embed' }))
    ).resolves.toBe(KEY);
    expect(sendMessage).toHaveBeenCalledWith({ name: 'GetDarkMode' });
  });

  it('has no key for a page that isn’t on the web', async () => {
    await expect(
      getSiteKey(frame({ href: 'about:blank', top: true }))
    ).resolves.toBeUndefined();
  });
});
