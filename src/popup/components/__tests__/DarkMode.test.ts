import { defaultGlobalDarkModeSettings } from '../../../dark-mode/settings';
import Vue from 'vue';
import { shallowMount } from '@vue/test-utils';
import DarkMode from '../DarkMode.vue';

let globalSettings = { ...defaultGlobalDarkModeSettings };
let fail = false;
let storageEnabled = true;
let controllerReady = true;
let disconnected = false;
const sendMessage = jest.fn((message, callback) => {
  if (message.name === 'GetDarkMode')
    callback({
      key: 'dark-mode:https://example.com',
      enabled: storageEnabled,
      siteEnabled: storageEnabled,
      globalSettings,
    });
  if (message.name === 'SetDarkMode') callback(!fail);
  if (message.name === 'SetGlobalDarkModeSettings') callback(!fail);
});
const runtime = {
  sendMessage,
  lastError: undefined as { message: string } | undefined,
};
const sendTabMessage = jest.fn((id, message, options, callback) => {
  if (disconnected)
    runtime.lastError = {
      message: 'Could not establish connection. Receiving end does not exist.',
    };
  callback(controllerReady);
  runtime.lastError = undefined;
});
const reload = jest.fn((id, callback) => callback());
Object.assign(global, {
  chrome: {
    runtime,
    tabs: { sendMessage: sendTabMessage, reload },
  },
});
beforeEach(() => {
  globalSettings = { ...defaultGlobalDarkModeSettings };
  fail = false;
  storageEnabled = true;
  controllerReady = true;
  disconnected = false;
  runtime.lastError = undefined;
  sendMessage.mockClear();
  sendTabMessage.mockClear();
  reload.mockClear();
});

it('checks the dark-mode controller in the Gmail main frame independently of the editor', () => {
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: {
      tab: { id: 42, url: 'https://mail.google.com/mail/u/0/#inbox' },
    },
  });
  expect(sendTabMessage).toHaveBeenCalledWith(
    42,
    { name: 'GetDarkModeStatus' },
    { frameId: 0 },
    expect.any(Function)
  );
  expect(wrapper.vm.$data.available).toBe(true);
  expect(wrapper.vm.$data.needsReload).toBe(false);
  wrapper.destroy();
});

it('offers to refresh a Gmail tab disconnected by an extension reload', async () => {
  disconnected = true;
  controllerReady = false;
  const close = jest.spyOn(window, 'close').mockImplementation(() => undefined);
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: {
      tab: { id: 42, url: 'https://mail.google.com/mail/u/0/#inbox' },
    },
  });
  expect(wrapper.vm.$data.available).toBe(false);
  expect(wrapper.vm.$data.needsReload).toBe(true);
  expect(wrapper.vm.$data.enabled).toBe(true);
  await wrapper.find('button').trigger('click');
  expect(reload).toHaveBeenCalledWith(42, expect.any(Function));
  expect(close).toHaveBeenCalled();
  wrapper.destroy();
  close.mockRestore();
});

it('loads persisted state and targets the exact tab displayed by the popup', () => {
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: { tab: { id: 42, url: 'https://example.com/article' } },
  });
  expect(wrapper.vm.$data.enabled).toBe(true);
  expect(wrapper.vm.$data.available).toBe(true);
  (wrapper.vm as Vue & { onChange: (value: boolean) => void }).onChange(false);
  expect(sendMessage).toHaveBeenLastCalledWith(
    {
      name: 'SetDarkMode',
      tabId: 42,
      url: 'https://example.com/article',
      value: false,
    },
    expect.any(Function)
  );
  wrapper.destroy();
});

it('restores the old value and reports a failed save', () => {
  fail = true;
  storageEnabled = false;
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: { tab: { id: 42, url: 'https://example.com' } },
  });
  (wrapper.vm as Vue & { onChange: (value: boolean) => void }).onChange(true);
  expect(wrapper.vm.$data.enabled).toBe(false);
  expect(wrapper.vm.$data.failed).toBe(true);
  expect(wrapper.vm.$data.saving).toBe(false);
  wrapper.destroy();
});

it('defaults global mode to an overnight schedule and saves it without altering site choices', async () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(2026, 10, 7, 12));
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: { tab: { id: 42, url: 'https://example.com' } },
  });
  expect(wrapper.vm.$data.globalSettings).toEqual({
    enabled: false,
    scheduleEnabled: true,
    start: '18:00',
    end: '08:00',
  });
  const vm = wrapper.vm as Vue & { saveGlobalSettings: () => void };
  await wrapper.setData({
    globalSettings: { ...defaultGlobalDarkModeSettings, enabled: true },
  });
  vm.saveGlobalSettings();
  expect(sendMessage).toHaveBeenLastCalledWith(
    {
      name: 'SetGlobalDarkModeSettings',
      value: { ...defaultGlobalDarkModeSettings, enabled: true },
    },
    expect.any(Function)
  );
  expect(wrapper.vm.$data.enabled).toBe(false);
  expect(wrapper.vm.$data.siteEnabled).toBe(true);
  jest.setSystemTime(new Date(2026, 10, 7, 22));
  jest.advanceTimersByTime(1000);
  expect(wrapper.vm.$data.enabled).toBe(true);
  await wrapper.setData({
    globalSettings: { ...defaultGlobalDarkModeSettings },
  });
  vm.saveGlobalSettings();
  expect(wrapper.vm.$data.enabled).toBe(true);
  expect(
    sendMessage.mock.calls.some(([message]) => message.name === 'SetDarkMode')
  ).toBe(false);
  wrapper.destroy();
  jest.useRealTimers();
});

it('rejects equal schedule times and rolls back a failed global save', async () => {
  const wrapper = shallowMount(DarkMode, {
    stubs: ['b-list-group-item', 'b-form-checkbox'],
    propsData: { tab: { id: 42, url: 'https://example.com' } },
  });
  const vm = wrapper.vm as Vue & { saveGlobalSettings: () => void };
  await wrapper.setData({
    globalSettings: {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      end: '18:00',
    },
  });
  sendMessage.mockClear();
  vm.saveGlobalSettings();
  expect(wrapper.vm.$data.invalidSchedule).toBe(true);
  expect(sendMessage).not.toHaveBeenCalled();
  fail = true;
  await wrapper.setData({
    globalSettings: { ...defaultGlobalDarkModeSettings, enabled: true },
  });
  vm.saveGlobalSettings();
  expect(wrapper.vm.$data.globalSettings.enabled).toBe(false);
  expect(wrapper.vm.$data.failed).toBe(true);
  wrapper.destroy();
});
