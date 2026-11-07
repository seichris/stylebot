import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
} from '../../dark-mode/settings';
import {
  siteKey,
  getDarkMode,
  setDarkMode,
  setGlobalDarkModeSettings,
} from '../dark-mode-settings';

const data: Record<string, unknown> = {};
Object.assign(global, {
  chrome: {
    runtime: {},
    storage: {
      local: {
        get: jest.fn((key, callback) => callback(data)),
        set: jest.fn((items, callback) => {
          Object.assign(data, items);
          callback();
        }),
      },
    },
  },
});

describe('per-site dark mode', () => {
  it('shares preferences across paths, isolating origins and ports', () => {
    expect(siteKey('https://example.com/a')).toBe(
      siteKey('https://example.com/b')
    );
    expect(siteKey('https://example.com')).not.toBe(
      siteKey('https://other.example.com')
    );
    expect(siteKey('http://localhost:80')).not.toBe(
      siteKey('http://localhost:4387')
    );
  });
  it.each(['chrome://settings', 'about:blank', 'file:///tmp/a', 'invalid'])(
    'rejects unsupported URL %s',
    async url => {
      expect(siteKey(url)).toBeUndefined();
      expect(await setDarkMode(url, true)).toBe(false);
    }
  );
  it('defaults off, persists toggles, and does not alter custom styles', async () => {
    expect((await getDarkMode('https://example.com')).enabled).toBe(false);
    expect(await setDarkMode('https://example.com/a', true)).toBe(true);
    expect((await getDarkMode('https://example.com/b')).enabled).toBe(true);
    expect((await getDarkMode('https://other.example.com')).enabled).toBe(
      false
    );
    expect(await setDarkMode('https://example.com', false)).toBe(true);
    expect((await getDarkMode('https://example.com')).enabled).toBe(false);
    expect(data).not.toHaveProperty('styles');
  });
});

describe('global dark mode persistence', () => {
  it('saves global settings without modifying individual site settings', async () => {
    const value = {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      scheduleEnabled: false,
    };
    expect(await setGlobalDarkModeSettings(value)).toBe(true);
    expect(data[GLOBAL_DARK_MODE_KEY]).toEqual(value);
    expect((await getDarkMode('https://new-site.example')).enabled).toBe(true);
    expect((await getDarkMode('chrome://settings')).enabled).toBe(false);
    expect((await getDarkMode('chrome://settings')).globalSettings).toEqual(
      value
    );
    expect(await setGlobalDarkModeSettings({ ...value, start: '29:00' })).toBe(
      false
    );
    expect(data[GLOBAL_DARK_MODE_KEY]).toEqual(value);
    await setGlobalDarkModeSettings(defaultGlobalDarkModeSettings);
    expect((await getDarkMode('https://new-site.example')).enabled).toBe(false);
  });
});
