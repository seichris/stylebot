import type { Meta } from '@storybook/vue';
import {
  GLOBAL_DARK_MODE_KEY,
  defaultGlobalDarkModeSettings,
} from '@stylebot/settings';

import DarkMode from './DarkMode.vue';
import { popup } from '@stylebot/storybook/fixtures/popup';

const meta: Meta = {
  title: 'Browser Action/Dark Mode',
  component: DarkMode,
  parameters: { padded: false },
};

export default meta;

export const Off = popup();

export const OnForThisSite = popup({
  storage: { 'dark-mode:https://example.com': true },
});

export const AllWebsitesOnASchedule = popup({
  storage: {
    [GLOBAL_DARK_MODE_KEY]: { ...defaultGlobalDarkModeSettings, enabled: true },
  },
});

export const AllWebsitesAllDay = popup({
  storage: {
    [GLOBAL_DARK_MODE_KEY]: {
      ...defaultGlobalDarkModeSettings,
      enabled: true,
      scheduleEnabled: false,
    },
  },
});
