import Vue from 'vue';
import { shallowMount } from '@vue/test-utils';
import CodeEditor from '../CodeEditor.vue';

Object.assign(global, {
  chrome: {
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  },
});

it('accepts CSS only from the expected extension iframe', () => {
  const wrapper = shallowMount(CodeEditor, { propsData: { css: '' } });
  const frame = {} as Window;
  const vm = wrapper.vm as Vue & {
    getIframeContentWindow: () => Window;
    handleMessage: (message: Record<string, unknown>) => void;
  };
  jest.spyOn(vm, 'getIframeContentWindow').mockReturnValue(frame);
  const data = {
    type: 'stylebotMonacoIframeCssUpdated',
    css: 'body { color: red; }',
  };
  vm.handleMessage({ source: window, origin: 'https://example.com', data });
  vm.handleMessage({ source: frame, origin: 'https://example.com', data });
  vm.handleMessage({ source: window, origin: 'chrome-extension://test', data });
  vm.handleMessage({
    source: frame,
    origin: 'chrome-extension://test',
    data: null,
  });
  expect(wrapper.emitted('update')).toBeUndefined();
  vm.handleMessage({ source: frame, origin: 'chrome-extension://test', data });
  expect(wrapper.emitted('update')).toEqual([[data.css]]);
  wrapper.destroy();
});
