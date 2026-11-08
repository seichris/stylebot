import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
} from '@stylebot/settings';

import {
  getDarkMode,
  setDarkMode,
  setGlobalDarkModeSettings,
} from './dark-mode-settings';

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys: Array<string>) =>
          Object.fromEntries(keys.map(key => [key, data[key]]))
        ),
        set: jest.fn(async (items: Record<string, unknown>) => {
          Object.assign(data, items);
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe("a site's Dark mode", () => {
  it('is off by default, and one choice covers the site’s pages and no other site', async () => {
    await expect(getDarkMode('https://example.com')).resolves.toMatchObject({
      key: 'dark-mode:https://example.com',
      enabled: false,
    });

    await expect(setDarkMode('https://example.com/a', true)).resolves.toBe(
      true
    );
    expect((await getDarkMode('https://example.com/b')).enabled).toBe(true);
    expect((await getDarkMode('https://other.example.com')).enabled).toBe(
      false
    );

    await setDarkMode('https://example.com', false);
    expect((await getDarkMode('https://example.com')).enabled).toBe(false);
    expect(data).not.toHaveProperty('styles');
  });

  it.each(['chrome://settings', 'about:blank', 'file:///tmp/a', 'invalid'])(
    'can’t be saved for %s, which isn’t on the web',
    async url => {
      await expect(setDarkMode(url, true)).resolves.toBe(false);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    }
  );

  it('says so when storage refuses the save', async () => {
    (chrome.storage.local.set as jest.Mock).mockRejectedValue(
      new Error('quota')
    );

    await expect(setDarkMode('https://example.com', true)).resolves.toBe(false);
  });
});

describe('global Dark mode', () => {
  it('saves valid settings without touching any site’s own choice', async () => {
    const value = {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      scheduleEnabled: false,
    };

    await setDarkMode('https://example.com', false);
    await expect(setGlobalDarkModeSettings(value)).resolves.toBe(true);

    expect(data[GLOBAL_DARK_MODE_KEY]).toEqual(value);
    expect(data['dark-mode:https://example.com']).toBe(false);
    expect((await getDarkMode('https://new-site.example')).enabled).toBe(true);
    expect((await getDarkMode('chrome://settings')).enabled).toBe(false);
    expect((await getDarkMode('chrome://settings')).globalSettings).toEqual(
      value
    );
  });

  it('refuses settings that aren’t valid, keeping what was saved', async () => {
    const value = { ...defaultGlobalDarkModeSettings, enabled: true };

    await setGlobalDarkModeSettings(value);

    await expect(
      setGlobalDarkModeSettings({ ...value, start: '29:00' })
    ).resolves.toBe(false);
    await expect(
      setGlobalDarkModeSettings({ ...value, end: value.start })
    ).resolves.toBe(false);
    expect(data[GLOBAL_DARK_MODE_KEY]).toEqual(value);
  });
});
