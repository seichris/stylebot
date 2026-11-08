import type Vue from 'vue';
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';

import CodeEditorIframe from './CodeEditorIframe.vue';

const ORIGIN = 'chrome-extension://stylebot';

describe('the options page’s CodeEditorIframe.vue', () => {
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
      mocks: { $store: { state: { options: { appearance: 'dark' } } } },
      attachTo: host,
    });
    frame = (wrapper.find('iframe').element as HTMLIFrameElement)
      .contentWindow as Window;
  });

  afterEach(() => {
    wrapper.destroy();
  });

  it("shows the editor and sends its theme, to the extension's origin, only once its own frame says Monaco loaded", async () => {
    const postMessage = jest.spyOn(frame, 'postMessage');

    post({ type: 'stylebotMonacoIframeLoaded' }, { source: window });
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain('ready');
    expect(postMessage).not.toHaveBeenCalled();

    post({ type: 'stylebotMonacoIframeLoaded' });
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).toContain('ready');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'stylebotThemeUpdate', theme: 'dark' },
      ORIGIN
    );
  });

  it('steps past the editor on Escape only when its own frame says so', () => {
    const exit = wrapper.find('.exit').element as HTMLElement;

    post(
      { type: 'stylebotEscapePressed' },
      { source: window, origin: 'https://example.com' }
    );
    expect(document.activeElement).not.toBe(exit);

    post({ type: 'stylebotEscapePressed' });
    expect(document.activeElement).toBe(exit);
  });
});
