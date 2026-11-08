import MonacoEditorIframe from './MonacoEditorIframe';

/**
 * A stand-in for Monaco's editor that holds plain text and reports every
 * change synchronously, as Monaco does.
 */
const createFakeEditor = () => {
  let value = '';
  const listeners: Array<() => void> = [];

  const change = (text: string) => {
    value = text;
    listeners.forEach(listener => listener());
  };

  return {
    type: change,
    editor: {
      onDidChangeModelContent: (listener: () => void) =>
        listeners.push(listener),
      getValue: () => value,
      setValue: change,
      executeEdits: (_source: string, edits: Array<{ text: string }>) =>
        change(edits[0].text),
      getModel: () => ({
        getValue: () => value,
        getFullModelRange: () => ({}),
        findNextMatch: () => null,
      }),
      pushUndoStop: jest.fn(),
      focus: jest.fn(),
      layout: jest.fn(),
      updateOptions: jest.fn(),
      deltaDecorations: () => [],
    },
  };
};

/**
 * Posts to the editor's window, from its parent unless told otherwise: the
 * page or panel it's framed in. A top-level jsdom window is its own parent.
 */
const post = (data: unknown, source: Window | null = window.parent) =>
  window.dispatchEvent(new MessageEvent('message', { data, source }));

const sendCss = (css: unknown) =>
  post({ type: 'stylebotCssUpdate', css, focus: false });

/**
 * Another window that holds a reference to the editor's, such as a frame.
 */
const otherWindow = (): Window => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame.contentWindow as Window;
};

describe('MonacoEditorIframe', () => {
  let fake: ReturnType<typeof createFakeEditor>;
  let posted: Array<{ type: string; css?: string }>;

  beforeEach(() => {
    fake = createFakeEditor();
    posted = [];
    document.body.innerHTML = '<div id="container"></div>';

    (global as unknown as { chrome: unknown }).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://stylebot/${path}`,
      },
    };
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {
        //
      }
    };
    window.require = Object.assign(
      (_deps: Array<string>, callback: () => void) => callback(),
      { config: jest.fn() }
    );
    window.monaco = {
      editor: {
        create: () => fake.editor,
        defineTheme: jest.fn(),
        setTheme: jest.fn(),
      },
      languages: {
        css: {
          cssDefaults: {
            setDiagnosticsOptions: jest.fn(),
            setModeConfiguration: jest.fn(),
          },
        },
      },
    };
    jest
      .spyOn(MonacoEditorIframe.prototype, 'patchBlobWorkerLoading')
      .mockImplementation(() => undefined);
    jest
      .spyOn(window.parent, 'postMessage')
      .mockImplementation(message => posted.push(message));

    new MonacoEditorIframe();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const cssUpdates = () =>
    posted.filter(message => message.type === 'stylebotMonacoIframeCssUpdated');

  it("doesn't report the panel's css back as typing, which a late echo would apply over newer css", () => {
    sendCss('a { color: red; }');
    sendCss('a { color: red; } b { color: blue; }');

    expect(fake.editor.getValue()).toBe('a { color: red; } b { color: blue; }');
    expect(cssUpdates()).toEqual([]);
  });

  it('takes css only from its parent, and only as text', () => {
    sendCss('a { color: red; }');
    post(
      { type: 'stylebotCssUpdate', css: 'b { color: blue; }' },
      otherWindow()
    );
    sendCss({ toString: () => 'c {}' });
    post(null);

    expect(fake.editor.getValue()).toBe('a { color: red; }');
  });

  it('takes a theme only from its parent, and only light or dark', () => {
    const { setTheme } = window.monaco.editor;

    post({ type: 'stylebotThemeUpdate', theme: 'dark' }, otherWindow());
    post({ type: 'stylebotThemeUpdate', theme: 'neon' });
    expect(setTheme).not.toHaveBeenCalled();

    post({ type: 'stylebotThemeUpdate', theme: 'dark' });
    expect(setTheme).toHaveBeenCalled();
  });

  it('reports what the user types', () => {
    sendCss('a { color: red; }');
    fake.type('a { color: blue; }');

    expect(cssUpdates()).toEqual([
      { type: 'stylebotMonacoIframeCssUpdated', css: 'a { color: blue; }' },
    ]);
  });

  describe('save shortcut', () => {
    const pressSave = () => {
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        cancelable: true,
      });
      jest.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
      window.dispatchEvent(event);
      return event;
    };

    const saves = () =>
      posted.filter(message => message.type === 'stylebotSavePressed');

    it("leaves the in-page editor's Ctrl+S to the browser", () => {
      const event = pressSave();

      expect(saves()).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it('asks the options page to save instead of the browser saving the page', () => {
      new MonacoEditorIframe('options');
      const event = pressSave();

      expect(saves()).toEqual([{ type: 'stylebotSavePressed' }]);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  // Last, like the save shortcut's: an editor never stops listening, and one
  // for the options page would answer the keys of the tests after it.
  it('posts to any parent from the in-page editor, and only to the extension from the options page', () => {
    const postMessage = window.parent.postMessage as jest.Mock;

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'stylebotMonacoIframeLoaded' },
      '*'
    );

    fake = createFakeEditor();
    postMessage.mockClear();
    new MonacoEditorIframe('options');

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'stylebotMonacoIframeLoaded' },
      'chrome-extension://stylebot'
    );
  });
});
