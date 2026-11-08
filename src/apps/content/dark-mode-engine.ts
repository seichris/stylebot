// Entry for inject-css/dark-mode.js, which load-dark-mode.ts imports on demand.
import { applyDarkMode, removeDarkMode } from '@stylebot/dark-mode';

import type { DarkModeWindow } from './load-dark-mode';

(window as DarkModeWindow).stylebotDarkMode = {
  apply: applyDarkMode,
  remove: removeDarkMode,
};
