import type Vue from 'vue';
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';

import CodeEditorIframe from './CodeEditorIframe.vue';

const ORIGIN = 'chrome-extension://stylebot';

describe('the editor’s CodeEditorIframe.vue', () => {
  let wrapper: Wrapper<Vue>;
  let frame: Window;

  const post = (
    data: unknown,
    {
      source = frame,
      origin = ORIGIN,
    }: { source?: Window; origin?: string } = {}
  ) =>
    window.dispatchEvent(new MessageEvent('message', { data, source, origin }));

  beforeEach(() => {
    global.chrome = {
      runtime: { getURL: (path: string) => `${ORIGIN}/${path}` },
    } as unknown as typeof chrome;
    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;

    const host = document.createElement('div');
    document.documentElement.append(host);

    wrapper = mount(CodeEditorIframe, {
      mocks: { $store: { state: { options: { appearance: 'light' } } } },
      attachTo: host,
    });
    frame = (wrapper.find('iframe').element as HTMLIFrameElement)
      .contentWindow as Window;
  });

  afterEach(() => {
    wrapper.destroy();
  });

  it('shows the editor only once its own frame says Monaco loaded', async () => {
    post(
      { type: 'stylebotMonacoIframeLoaded' },
      { source: window, origin: 'https://example.com' }
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain('ready');

    post({ type: 'stylebotMonacoIframeLoaded' });
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).toContain('ready');
  });

  it("sends its theme only to the extension's origin", () => {
    const postMessage = jest.spyOn(frame, 'postMessage');

    post({ type: 'stylebotMonacoIframeLoaded' });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'stylebotThemeUpdate', theme: 'light' },
      ORIGIN
    );
  });
});
