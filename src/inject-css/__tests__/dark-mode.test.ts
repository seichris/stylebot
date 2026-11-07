jest.mock('@stylebot/dark-mode', () => ({
  apply: jest.fn(),
  remove: jest.fn(),
}));
import { apply, remove } from '@stylebot/dark-mode';
import { initDarkModeController } from '../dark-mode';
import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
} from '../../dark-mode/settings';

const key = 'dark-mode:https://example.com';
let items: Record<string, unknown>;
let listener: (changes: Record<string, unknown>, area: string) => void;
let responseKey: string;
let storageListeners: Array<(
  changes: Record<string, unknown>,
  area: string
) => void>;
let pendingReads: Array<(items: Record<string, unknown>) => void>;
let delayReads: boolean;
let dispose: (() => void) | undefined;
const onMessage = jest.fn();

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(2026, 10, 7, 17, 59, 45));
  jest.clearAllMocks();
  items = { [key]: false };
  responseKey = key;
  storageListeners = [];
  pendingReads = [];
  delayReads = false;
  Object.assign(global, {
    chrome: {
      runtime: {
        onMessage: { addListener: onMessage, removeListener: jest.fn() },
        sendMessage(
          message: { name: string },
          callback: (response: unknown) => void
        ) {
          callback({ key: responseKey });
        },
      },
      storage: {
        onChanged: {
          addListener(callback: typeof listener) {
            listener = callback;
            storageListeners.push(callback);
          },
          removeListener: jest.fn(),
        },
        local: {
          get(keys: string[], callback: (data: typeof items) => void) {
            if (delayReads) pendingReads.push(callback);
            else callback({ ...items });
          },
        },
      },
    },
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  jest.useRealTimers();
});
const change = (changes: Record<string, unknown>) => {
  Object.assign(items, changes);
  storageListeners.forEach(callback =>
    callback(
      Object.fromEntries(
        Object.entries(changes).map(([key, newValue]) => [key, { newValue }])
      ),
      'local'
    )
  );
};

it('answers readiness independently of editor initialization', () => {
  dispose = initDarkModeController();
  const ready = jest.fn();
  onMessage.mock.calls[0][0]({ name: 'GetDarkModeStatus' }, {}, ready);
  expect(ready).toHaveBeenCalledWith(true);
});

it('ignores stale startup reads, responds to site changes, and isolates unrelated sites', () => {
  delayReads = true;
  dispose = initDarkModeController();
  change({ [key]: true });
  pendingReads[1]({ ...items });
  expect(apply).toHaveBeenCalledTimes(1);
  pendingReads[0]({ [key]: false });
  expect(remove).not.toHaveBeenCalled();
  listener({ 'dark-mode:https://other.com': { newValue: false } }, 'local');
  expect(pendingReads).toHaveLength(2);
  delayReads = false;
  change({ [key]: false });
  expect(remove).toHaveBeenCalledTimes(1);
});

it('turns on at 18:00 and off at 08:00 without any background-worker message', () => {
  items[GLOBAL_DARK_MODE_KEY] = {
    ...defaultGlobalDarkModeSettings,
    enabled: true,
  };
  dispose = initDarkModeController();
  expect(remove).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(15000);
  expect(apply).toHaveBeenCalledTimes(1);
  jest.setSystemTime(new Date(2026, 10, 8, 7, 59, 59));
  window.dispatchEvent(new Event('pageshow'));
  jest.clearAllMocks();
  jest.advanceTimersByTime(1000);
  expect(remove).toHaveBeenCalledTimes(1);
});

it('rechecks after sleep or a wall-clock change and honors global changes across open tabs', () => {
  dispose = initDarkModeController();
  change({
    [GLOBAL_DARK_MODE_KEY]: {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      scheduleEnabled: false,
    },
  });
  expect(apply).toHaveBeenCalledTimes(1);
  change({
    [GLOBAL_DARK_MODE_KEY]: { ...defaultGlobalDarkModeSettings, enabled: true },
  });
  jest.setSystemTime(new Date(2026, 10, 7, 22));
  window.dispatchEvent(new Event('focus'));
  expect(apply).toHaveBeenCalledTimes(2);
  jest.setSystemTime(new Date(2026, 10, 8, 9));
  window.dispatchEvent(new Event('pageshow'));
  expect(remove).toHaveBeenCalledTimes(3);
  change({ [key]: true });
  change({
    [GLOBAL_DARK_MODE_KEY]: {
      ...defaultGlobalDarkModeSettings,
      enabled: false,
    },
  });
  expect(apply).toHaveBeenCalledTimes(3);
});

it('applies one global preference to controllers for different websites', () => {
  const first = initDarkModeController();
  responseKey = 'dark-mode:https://another-site.example';
  const second = initDarkModeController();
  dispose = () => {
    first();
    second();
  };
  jest.clearAllMocks();
  change({
    [GLOBAL_DARK_MODE_KEY]: {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      scheduleEnabled: false,
    },
  });
  expect(apply).toHaveBeenCalledTimes(2);
  change({
    [GLOBAL_DARK_MODE_KEY]: {
      ...defaultGlobalDarkModeSettings,
      enabled: false,
    },
  });
  expect(remove).toHaveBeenCalledTimes(2);
});
