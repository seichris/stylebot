import {
  defaultGlobalDarkModeSettings as defaults,
  getDarkModeSiteKey,
  isDarkModeEnabled,
  isGlobalDarkModeActive,
  isValidGlobalDarkModeSettings,
  nextMinuteDelay,
  normalizeGlobalDarkModeSettings,
} from './dark-mode';

const overnight = { ...defaults, enabled: true };
const at = (hours: number, minutes = 0) =>
  new Date(2026, 10, 7, hours, minutes);

describe('global Dark mode settings', () => {
  it('defaults to off, scheduled from 18:00 to 08:00 once turned on', () => {
    expect(defaults).toEqual({
      enabled: false,
      scheduleEnabled: true,
      start: '18:00',
      end: '08:00',
    });
    expect(normalizeGlobalDarkModeSettings(undefined)).toEqual(defaults);
  });

  it.each([
    [17, 59, false],
    [18, 0, true],
    [23, 59, true],
    [0, 0, true],
    [7, 59, true],
    [8, 0, false],
    [12, 0, false],
  ])('at %i:%i, an overnight schedule is on: %s', (hours, minutes, active) => {
    expect(isGlobalDarkModeActive(overnight, at(hours, minutes))).toBe(active);
  });

  it('counts a daytime schedule’s start and not its end', () => {
    const daytime = { ...overnight, start: '09:30', end: '17:00' };

    expect(isGlobalDarkModeActive(daytime, at(9, 29))).toBe(false);
    expect(isGlobalDarkModeActive(daytime, at(9, 30))).toBe(true);
    expect(isGlobalDarkModeActive(daytime, at(16, 59))).toBe(true);
    expect(isGlobalDarkModeActive(daytime, at(17))).toBe(false);
  });

  it('runs all day without a schedule, and gives sites their own choice back once it’s off', () => {
    expect(
      isValidGlobalDarkModeSettings({
        ...overnight,
        scheduleEnabled: false,
        end: '18:00',
      })
    ).toBe(true);
    expect(
      isGlobalDarkModeActive({ ...overnight, scheduleEnabled: false }, at(12))
    ).toBe(true);
    expect(isDarkModeEnabled(false, overnight, at(22))).toBe(true);
    expect(isDarkModeEnabled(true, overnight, at(12))).toBe(false);
    expect(isDarkModeEnabled(true, defaults, at(12))).toBe(true);
    expect(isDarkModeEnabled(false, defaults, at(22))).toBe(false);
  });

  it.each([
    null,
    {},
    'on',
    { ...overnight, start: '24:00' },
    { ...overnight, start: '18:60' },
    { ...overnight, end: '18:00' },
    { ...overnight, enabled: 'true' },
  ])('treats %p as no settings', value => {
    expect(isValidGlobalDarkModeSettings(value)).toBe(false);
    expect(normalizeGlobalDarkModeSettings(value)).toEqual(defaults);
  });

  it('keeps only the settings’ own fields', () => {
    expect(
      normalizeGlobalDarkModeSettings({ ...overnight, extra: 'x' })
    ).toEqual(overnight);
  });

  it('checks again at the next minute, not a minute from whenever it last did', () => {
    const now = at(17, 59);

    now.setSeconds(42, 250);
    expect(nextMinuteDelay(now)).toBe(17750);
  });
});

describe('getDarkModeSiteKey', () => {
  it('keys a site by its origin, so its pages share one choice', () => {
    expect(getDarkModeSiteKey('https://example.com/a?b#c')).toBe(
      'dark-mode:https://example.com'
    );
    expect(getDarkModeSiteKey('http://localhost:8080/')).toBe(
      'dark-mode:http://localhost:8080'
    );
  });

  it.each([
    'chrome://extensions',
    'file:///tmp/a.html',
    'about:blank',
    'null',
    '',
  ])('has no key for %p, which isn’t on the web', url => {
    expect(getDarkModeSiteKey(url)).toBeUndefined();
  });
});
