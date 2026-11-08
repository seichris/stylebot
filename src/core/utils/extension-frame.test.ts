import { getExtensionOrigin, isFromExtensionFrame } from './extension-frame';

const ORIGIN = 'chrome-extension://stylebot';

describe('extension frames', () => {
  let frame: Window;

  beforeEach(() => {
    global.chrome = {
      runtime: { getURL: (path: string) => `${ORIGIN}/${path}` },
    } as unknown as typeof chrome;

    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    frame = iframe.contentWindow as Window;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it("names the extension's origin as messages do, without a trailing slash", () => {
    expect(getExtensionOrigin()).toBe(ORIGIN);
  });

  it("takes a message its frame's window posted from the extension's origin", () => {
    expect(
      isFromExtensionFrame(
        { source: frame, origin: ORIGIN, data: { type: 'x' } },
        frame
      )
    ).toBe(true);
  });

  it.each([
    [
      'a message from another window',
      () => ({ source: window, origin: ORIGIN, data: {} }),
    ],
    [
      'a message from another origin',
      () => ({ source: frame, origin: 'https://example.com', data: {} }),
    ],
    [
      'a message without data',
      () => ({ source: frame, origin: ORIGIN, data: null }),
    ],
    [
      'a message whose data is not an object',
      () => ({ source: frame, origin: ORIGIN, data: 'x' }),
    ],
  ])('refuses %s', (_name, event) => {
    expect(isFromExtensionFrame(event() as MessageEvent, frame)).toBe(false);
  });

  it('refuses everything while there is no frame', () => {
    expect(
      isFromExtensionFrame({ source: null, origin: ORIGIN, data: {} }, null)
    ).toBe(false);
  });
});
