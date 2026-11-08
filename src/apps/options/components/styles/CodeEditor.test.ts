import type Vue from 'vue';
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';

import CodeEditor from './CodeEditor.vue';

const ORIGIN = 'chrome-extension://stylebot';

const CodeEditorIframeStub = { template: '<div><iframe /></div>' };

describe('CodeEditor.vue', () => {
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

    const host = document.createElement('div');
    document.documentElement.append(host);

    wrapper = mount(CodeEditor, {
      propsData: { css: '' },
      stubs: { CodeEditorIframe: CodeEditorIframeStub },
      attachTo: host,
    });
    frame = (wrapper.find('iframe').element as HTMLIFrameElement)
      .contentWindow as Window;
  });

  afterEach(() => {
    wrapper.destroy();
  });

  it("takes css only from its own Monaco frame, from the extension's origin, as text", () => {
    const typed = {
      type: 'stylebotMonacoIframeCssUpdated',
      css: 'body { color: red; }',
    };

    post(typed, { source: window, origin: 'https://example.com' });
    post(typed, { origin: 'https://example.com' });
    post(typed, { source: window });
    post(null);
    post({ type: 'stylebotMonacoIframeCssUpdated', css: 42 });
    expect(wrapper.emitted('update')).toBeUndefined();

    post(typed);
    expect(wrapper.emitted('update')).toEqual([[typed.css]]);
  });

  it('saves only when its own frame asks to', () => {
    post({ type: 'stylebotSavePressed' }, { source: window });
    expect(wrapper.emitted('save')).toBeUndefined();

    post({ type: 'stylebotSavePressed' });
    expect(wrapper.emitted('save')).toHaveLength(1);
  });
});
