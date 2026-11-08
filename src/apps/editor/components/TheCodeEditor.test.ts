import Vue from 'vue';
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';

import TheCodeEditor from './TheCodeEditor.vue';

const CodeEditorIframeStub = { template: '<div><iframe /></div>' };

const buildMockStore = (css = '') => {
  const state = Vue.observable({
    css,
    activeSelector: '',
    options: { mode: 'code' },
  });

  const dispatch = jest.fn((action: string, payload?: { css: string }) => {
    if (action === 'applyCss' && payload) {
      state.css = payload.css;
    }
  });

  return { state, dispatch };
};

const EXTENSION_ORIGIN = 'chrome-extension://stylebot';

// The window of the mounted editor's Monaco frame.
let frameWindow: Window | null = null;

/**
 * Posts a message to the window the editor listens on, from its Monaco
 * frame unless told otherwise.
 */
const post = (
  data: unknown,
  {
    source = frameWindow,
    origin = EXTENSION_ORIGIN,
  }: { source?: Window | null; origin?: string } = {}
) =>
  window.dispatchEvent(new MessageEvent('message', { data, source, origin }));

const type = (css: unknown) =>
  post({ type: 'stylebotMonacoIframeCssUpdated', css });

/**
 * A connected element to mount over, so the editor's iframe gets a window:
 * mounting over document.body itself would replace it for later tests.
 */
const mountPoint = (): HTMLElement => {
  const el = document.createElement('div');
  document.documentElement.append(el);
  return el;
};

const applyCssCalls = (store: ReturnType<typeof buildMockStore>) =>
  store.dispatch.mock.calls.filter(([action]) => action === 'applyCss');

describe('TheCodeEditor.vue', () => {
  let wrapper: Wrapper<Vue> | undefined;
  let store: ReturnType<typeof buildMockStore>;

  beforeEach(() => {
    jest.useFakeTimers();
    (global as unknown as { chrome: unknown }).chrome = {
      runtime: { getURL: (path: string) => `${EXTENSION_ORIGIN}/${path}` },
    };

    store = buildMockStore('a { color: red; }');
    wrapper = mount(TheCodeEditor, {
      mocks: { $store: store },
      stubs: { CodeEditorIframe: CodeEditorIframeStub },
      attachTo: mountPoint(),
    });
    frameWindow = (wrapper.find('iframe').element as HTMLIFrameElement)
      .contentWindow;
  });

  afterEach(() => {
    wrapper?.destroy();
    wrapper = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('applies a burst of typing once, with the last text, after typing pauses', () => {
    type('h');
    type('h1');
    type('h1 { color: blue; }');

    jest.advanceTimersByTime(199);
    expect(applyCssCalls(store)).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(applyCssCalls(store)).toEqual([
      ['applyCss', { css: 'h1 { color: blue; }', source: 'code' }],
    ]);
  });

  it('does not re-apply text that matches the store, such as typing undone back to it', () => {
    type('a { color: red; }');
    jest.advanceTimersByTime(200);

    expect(applyCssCalls(store)).toHaveLength(0);
  });

  it('applies pending typing before a newly picked selector refreshes the editor from the store', async () => {
    type('a { color: blue; }');
    store.state.activeSelector = 'a';
    await Vue.nextTick();

    expect(applyCssCalls(store)[0]).toEqual([
      'applyCss',
      { css: 'a { color: blue; }', source: 'code' },
    ]);
  });

  it('adds an empty rule for a picked selector it has no rule for', async () => {
    // jsdom gives the editor's iframe no window to post the css to.
    jest
      .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue(window);

    store.state.activeSelector = '.parent .child';
    await Vue.nextTick();

    expect(store.state.css).toBe(
      'a { color: red; }\n\n.parent .child {\n  \n}'
    );
  });

  it('drops pending typing when the css is replaced from outside the editor', async () => {
    type('a { color: blue; }');
    store.state.css = 'b { color: green; }';
    await Vue.nextTick();

    jest.advanceTimersByTime(200);
    expect(applyCssCalls(store)).toHaveLength(0);
    expect(store.state.css).toBe('b { color: green; }');
  });

  it('applies pending typing when the editor is torn down', () => {
    type('a { color: blue; }');
    wrapper?.destroy();
    wrapper = undefined;

    expect(applyCssCalls(store)).toEqual([
      ['applyCss', { css: 'a { color: blue; }', source: 'code' }],
    ]);
  });

  it('applies pending typing when its page unloads, as closing a side panel or window does', () => {
    type('a { color: blue; }');
    window.dispatchEvent(new Event('pagehide'));

    expect(applyCssCalls(store)).toEqual([
      ['applyCss', { css: 'a { color: blue; }', source: 'code' }],
    ]);
  });

  describe('messages from anywhere but its Monaco frame', () => {
    const typed = { type: 'stylebotMonacoIframeCssUpdated', css: 'b {}' };

    it('ignores css a script posts to the window it listens on, as the page it sits on can', () => {
      post(typed, { source: window, origin: 'https://example.com' });
      jest.advanceTimersByTime(200);

      expect(applyCssCalls(store)).toHaveLength(0);
    });

    it('ignores css from its frame window with another origin', () => {
      post(typed, { origin: 'https://example.com' });
      jest.advanceTimersByTime(200);

      expect(applyCssCalls(store)).toHaveLength(0);
    });

    it('ignores css that is not text, and a message with no data', () => {
      type({ toString: () => 'b {}' });
      post(null);
      jest.advanceTimersByTime(200);

      expect(applyCssCalls(store)).toHaveLength(0);
    });

    it('ignores Escape a script posts, which would close the code view', () => {
      post(
        { type: 'stylebotEscapePressed' },
        { source: window, origin: 'https://example.com' }
      );

      expect(wrapper?.emitted('leave')).toBeUndefined();
    });
  });
});
