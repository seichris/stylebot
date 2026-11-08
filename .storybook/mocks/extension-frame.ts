/**
 * Stands in for the checks that a message came from one of the extension's
 * frames: stories stub the Monaco frame out and post its messages from their
 * own window instead.
 */
export const getExtensionOrigin = (): string => window.location.origin;

export const isFromExtensionFrame = (
  event: Pick<MessageEvent, 'data'>,
  _frame?: Window | null
): boolean => typeof event.data === 'object' && event.data !== null;
