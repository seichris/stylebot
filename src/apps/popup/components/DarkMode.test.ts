import type Vue from 'vue';
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { defaultGlobalDarkModeSettings } from '@stylebot/settings';
import type { GlobalDarkModeSettings } from '@stylebot/types';

import DarkMode from './DarkMode.vue';

type DarkModeVm = Vue & {
  enabled: boolean;
  siteEnabled: boolean;
  siteLocked: boolean;
  saving: boolean;
  failed: boolean;
  invalidSchedule: boolean;
  globalSettings: GlobalDarkModeSettings;
  setSite: (value: boolean) => Promise<void>;
  setGlobal: <K extends keyof GlobalDarkModeSettings>(
    field: K,
    value: GlobalDarkModeSettings[K]
  ) => Promise<void>;
};

const TAB = { id: 42, url: 'https://example.com/article' };

let globalSettings: GlobalDarkModeSettings;
let siteEnabled: boolean;
let siteKey: string | undefined;
let saves: boolean;
let sendMessage: jest.Mock;

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const mountDarkMode = async (): Promise<Wrapper<DarkModeVm>> => {
  const wrapper = shallowMount(DarkMode, {
    propsData: { tab: TAB },
  }) as Wrapper<DarkModeVm>;

  await flush();
  return wrapper;
};

beforeEach(() => {
  globalSettings = { ...defaultGlobalDarkModeSettings };
  siteEnabled = true;
  siteKey = 'dark-mode:https://example.com';
  saves = true;
  sendMessage = jest.fn(async (message: { name: string }) => {
    switch (message.name) {
      case 'GetDarkMode':
        return {
          key: siteKey,
          siteEnabled,
          enabled: siteEnabled,
          globalSettings,
        };
      case 'SetDarkMode':
      case 'SetGlobalDarkModeSettings':
        return saves;
    }
  });
  global.chrome = { runtime: { sendMessage } } as unknown as typeof chrome;
});

describe('DarkMode.vue', () => {
  it("shows the site's choice, and saves a change for the exact tab and page the popup shows", async () => {
    const wrapper = await mountDarkMode();

    expect(sendMessage).toHaveBeenCalledWith({
      name: 'GetDarkMode',
      tabId: 42,
    });
    expect(wrapper.vm.enabled).toBe(true);

    await wrapper.vm.setSite(false);

    expect(sendMessage).toHaveBeenLastCalledWith({
      name: 'SetDarkMode',
      tabId: 42,
      url: 'https://example.com/article',
      value: false,
    });
    expect(wrapper.vm.enabled).toBe(false);
    wrapper.destroy();
  });

  it('puts the switch back and says so when the save fails', async () => {
    siteEnabled = false;
    saves = false;
    const wrapper = await mountDarkMode();

    await wrapper.vm.setSite(true);

    expect(wrapper.vm.enabled).toBe(false);
    expect(wrapper.vm.failed).toBe(true);
    expect(wrapper.vm.saving).toBe(false);
    wrapper.destroy();
  });

  it('can’t be turned on for a page Dark mode can’t apply to', async () => {
    siteKey = undefined;
    const wrapper = await mountDarkMode();

    expect(wrapper.vm.enabled).toBe(false);
    expect(wrapper.vm.siteLocked).toBe(true);
    wrapper.destroy();
  });

  it('saves All websites without touching the site’s choice, and follows its schedule while open', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 7, 12));
    const wrapper = await mountDarkMode();

    await wrapper.vm.setGlobal('enabled', true);

    expect(sendMessage).toHaveBeenLastCalledWith({
      name: 'SetGlobalDarkModeSettings',
      value: { ...defaultGlobalDarkModeSettings, enabled: true },
    });
    expect(wrapper.vm.siteLocked).toBe(true);
    expect(wrapper.vm.enabled).toBe(false);
    expect(wrapper.vm.siteEnabled).toBe(true);

    jest.setSystemTime(new Date(2026, 10, 7, 22));
    jest.advanceTimersByTime(1000);
    expect(wrapper.vm.enabled).toBe(true);

    await wrapper.vm.setGlobal('enabled', false);

    expect(wrapper.vm.enabled).toBe(true);
    expect(
      sendMessage.mock.calls.some(([message]) => message.name === 'SetDarkMode')
    ).toBe(false);
    wrapper.destroy();
    jest.useRealTimers();
  });

  it('doesn’t save a schedule that starts when it ends, and puts a failed save back', async () => {
    globalSettings = { ...defaultGlobalDarkModeSettings, enabled: true };
    const wrapper = await mountDarkMode();

    sendMessage.mockClear();
    await wrapper.vm.setGlobal('end', '18:00');

    expect(wrapper.vm.invalidSchedule).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();

    await wrapper.vm.setGlobal('end', '07:00');

    expect(wrapper.vm.invalidSchedule).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    saves = false;
    await wrapper.vm.setGlobal('scheduleEnabled', false);

    expect(wrapper.vm.globalSettings).toEqual({
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      end: '07:00',
    });
    expect(wrapper.vm.failed).toBe(true);
    wrapper.destroy();
  });
});
