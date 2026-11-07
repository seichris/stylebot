import {
  defaultGlobalDarkModeSettings as defaults,
  isValidGlobalDarkModeSettings,
  normalizeGlobalDarkModeSettings,
  isGlobalDarkModeActive,
  isDarkModeEnabled,
  nextMinuteDelay,
} from '../settings';

const overnight = { ...defaults, enabled: true };
const at = (hours: number, minutes = 0) =>
  new Date(2026, 10, 7, hours, minutes);

it('defaults to an opt-in global mode scheduled from 18:00 to 08:00', () => {
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
])('evaluates overnight boundary at %i:%i', (hours, minutes, active) => {
  expect(
    isGlobalDarkModeActive(overnight, at(hours as number, minutes as number))
  ).toBe(active);
});

it('handles a daytime schedule with an inclusive start and exclusive end', () => {
  const daytime = { ...overnight, start: '09:30', end: '17:00' };
  expect(isGlobalDarkModeActive(daytime, at(9, 29))).toBe(false);
  expect(isGlobalDarkModeActive(daytime, at(9, 30))).toBe(true);
  expect(isGlobalDarkModeActive(daytime, at(16, 59))).toBe(true);
  expect(isGlobalDarkModeActive(daytime, at(17))).toBe(false);
});

it('runs all day when scheduling is disabled and restores site choices when global mode is disabled', () => {
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
  { ...overnight, start: '24:00' },
  { ...overnight, start: '18:60' },
  { ...overnight, end: '18:00' },
  { ...overnight, enabled: 'true' },
])('rejects malformed settings %p', value => {
  expect(isValidGlobalDarkModeSettings(value)).toBe(false);
  expect(normalizeGlobalDarkModeSettings(value)).toEqual(defaults);
});

it('aligns checks to minute boundaries rather than drifting from popup activation time', () => {
  const now = at(17, 59);
  now.setSeconds(42, 250);
  expect(nextMinuteDelay(now)).toBe(17750);
});
