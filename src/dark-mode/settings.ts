import { GlobalDarkModeSettings } from '@stylebot/types';

export const GLOBAL_DARK_MODE_KEY = 'dark-mode:global-settings';
export const defaultGlobalDarkModeSettings: GlobalDarkModeSettings = {
  enabled: false,
  scheduleEnabled: true,
  start: '18:00',
  end: '08:00',
};

export const isValidGlobalDarkModeSettings = (
  value: unknown
): value is GlobalDarkModeSettings => {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<GlobalDarkModeSettings>;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return (
    typeof settings.enabled === 'boolean' &&
    typeof settings.scheduleEnabled === 'boolean' &&
    typeof settings.start === 'string' &&
    time.test(settings.start) &&
    typeof settings.end === 'string' &&
    time.test(settings.end) &&
    (!settings.scheduleEnabled || settings.start !== settings.end)
  );
};

export const normalizeGlobalDarkModeSettings = (
  value: unknown
): GlobalDarkModeSettings =>
  isValidGlobalDarkModeSettings(value)
    ? { ...value }
    : { ...defaultGlobalDarkModeSettings };

const minutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const isGlobalDarkModeActive = (
  settings: GlobalDarkModeSettings,
  now = new Date()
): boolean => {
  if (!settings.enabled) return false;
  if (!settings.scheduleEnabled) return true;
  // Local wall-clock time follows the browser's current time zone and DST.
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(settings.start);
  const end = minutes(settings.end);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

export const isDarkModeEnabled = (
  siteEnabled: boolean,
  settings: GlobalDarkModeSettings,
  now = new Date()
): boolean =>
  settings.enabled ? isGlobalDarkModeActive(settings, now) : siteEnabled;

export const nextMinuteDelay = (now = new Date()): number =>
  60000 - now.getSeconds() * 1000 - now.getMilliseconds();
