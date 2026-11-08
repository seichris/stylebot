/**
 * Whether an event came from the person using the browser rather than from
 * a script dispatching one. Stylebot's panels in a page share its DOM, so the
 * page can click their controls itself; what acts for the user checks this.
 */
export const isUserGesture = (event: Event | null | undefined): boolean =>
  event?.isTrusted === true;
