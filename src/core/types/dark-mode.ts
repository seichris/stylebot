/**
 * Dark mode for every website at once, while `enabled`: all day, or with
 * `scheduleEnabled` only from `start` until `end`, as `HH:MM` local times.
 */
export type GlobalDarkModeSettings = {
  enabled: boolean;
  scheduleEnabled: boolean;
  start: string;
  end: string;
};
