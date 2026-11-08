/**
 * Stands in for the check that an event came from a person: stories drive
 * the UI with user-event, whose events a browser never marks trusted.
 */
export const isUserGesture = (event: Event | null | undefined): boolean =>
  Boolean(event);
