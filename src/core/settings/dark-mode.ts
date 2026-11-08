import type { GlobalDarkModeSettings } from '@stylebot/types';

export const GLOBAL_DARK_MODE_KEY = 'dark-mode:global-settings';

// Off until turned on; once on, scheduled for the evening and night.
export const defaultGlobalDarkModeSettings: GlobalDarkModeSettings = {
  enabled: false,
  scheduleEnabled: true,
  start: '18:00',
  end: '08:00',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The storage key of a site's own Dark mode choice: one per origin, so the
 * choice covers the site's pages and the frames they embed. Undefined for a
 * page that isn't on the web.
 */
export const getDarkModeSiteKey = (url: string): string | undefined => {
  try {
    const { protocol, origin } = new URL(url);

    return protocol === 'http:' || protocol === 'https:'
      ? `dark-mode:${origin}`
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether a value is global Dark mode settings as the popup saves them. A
 * schedule has to start and end at different times; all day has its own
 * switch.
 */
export const isValidGlobalDarkModeSettings = (
  value: unknown
): value is GlobalDarkModeSettings => {
  const settings = value as Partial<GlobalDarkModeSettings> | null;

  return (
    typeof settings === 'object' &&
    settings !== null &&
    typeof settings.enabled === 'boolean' &&
    typeof settings.scheduleEnabled === 'boolean' &&
    typeof settings.start === 'string' &&
    TIME.test(settings.start) &&
    typeof settings.end === 'string' &&
    TIME.test(settings.end) &&
    (!settings.scheduleEnabled || settings.start !== settings.end)
  );
};

/**
 * Stored global settings, or the defaults for anything else.
 */
export const normalizeGlobalDarkModeSettings = (
  value: unknown
): GlobalDarkModeSettings =>
  isValidGlobalDarkModeSettings(value)
    ? {
        enabled: value.enabled,
        scheduleEnabled: value.scheduleEnabled,
        start: value.start,
        end: value.end,
      }
    : { ...defaultGlobalDarkModeSettings };

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
};

/**
 * Whether global Dark mode is on at a time: all day, or within its schedule
 * in the browser's local time, which follows its time zone and daylight
 * saving. The start counts and the end doesn't; a range can cross midnight.
 */
export const isGlobalDarkModeActive = (
  settings: GlobalDarkModeSettings,
  now = new Date()
): boolean => {
  if (!settings.enabled) {
    return false;
  }

  if (!settings.scheduleEnabled) {
    return true;
  }

  const current = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(settings.start);
  const end = toMinutes(settings.end);

  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

/**
 * Whether Dark mode is on for a site. While it's on for all websites, the
 * global setting and its schedule decide for every site, which keeps its own
 * choice for when that's turned off again.
 */
export const isDarkModeEnabled = (
  siteEnabled: boolean,
  settings: GlobalDarkModeSettings,
  now = new Date()
): boolean =>
  settings.enabled ? isGlobalDarkModeActive(settings, now) : siteEnabled;

/**
 * Milliseconds until the next minute starts, when a schedule may turn over.
 */
export const nextMinuteDelay = (now = new Date()): number =>
  60000 - now.getSeconds() * 1000 - now.getMilliseconds();
