/**
 * The origin of the extension's own pages, as a message's origin names it.
 */
export const getExtensionOrigin = (): string => {
  const { protocol, host } = new URL(
    chrome.runtime.getURL(''),
    globalThis.location?.href
  );

  return `${protocol}//${host}`;
};

/**
 * Whether a window message came from one of the extension's own frames:
 * posted by that frame's window, from the extension's origin, with an object
 * for data. Any script on a page can post to the window an in-page panel
 * listens on, so nothing else may drive what the frame drives.
 */
export const isFromExtensionFrame = (
  event: Pick<MessageEvent, 'source' | 'origin' | 'data'>,
  frame: Window | null | undefined
): boolean =>
  Boolean(frame) &&
  event.source === frame &&
  event.origin === getExtensionOrigin() &&
  typeof event.data === 'object' &&
  event.data !== null;
