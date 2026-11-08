<template>
  <div class="dark-mode">
    <popup-row hover :disabled="siteLocked">
      <s-toggle-switch
        :value="enabled"
        :disabled="siteLocked"
        track-end
        @change="setSite"
      >
        <span class="dark-mode-label">
          <s-text as="span" size="large">{{ t('dark_mode') }}</s-text>
          <s-text
            v-if="globalSettings.enabled"
            as="span"
            size="caption"
            variant="muted"
          >
            {{ t('controlled_by_all_websites') }}
          </s-text>
        </span>
      </s-toggle-switch>
    </popup-row>

    <popup-row hover :disabled="globalLocked">
      <s-toggle-switch
        :value="globalSettings.enabled"
        :disabled="globalLocked"
        track-end
        @change="setGlobal('enabled', $event)"
      >
        <s-text as="span">{{ t('all_websites') }}</s-text>
      </s-toggle-switch>
    </popup-row>

    <div v-if="globalSettings.enabled" class="schedule">
      <label class="schedule-toggle">
        <s-checkbox
          :value="globalSettings.scheduleEnabled"
          :disabled="globalSaving"
          @change="setGlobal('scheduleEnabled', $event)"
        />
        <s-text as="span">{{ t('use_schedule') }}</s-text>
      </label>

      <div v-if="globalSettings.scheduleEnabled" class="schedule-times">
        <label class="schedule-time">
          <s-text as="span" size="caption" variant="muted">
            {{ t('from') }}
          </s-text>
          <s-text-input
            type="time"
            required
            :value="globalSettings.start"
            :disabled="globalSaving"
            @change="setGlobal('start', $event)"
          />
        </label>
        <label class="schedule-time">
          <s-text as="span" size="caption" variant="muted">
            {{ t('until') }}
          </s-text>
          <s-text-input
            type="time"
            required
            :value="globalSettings.end"
            :disabled="globalSaving"
            @change="setGlobal('end', $event)"
          />
        </label>
      </div>

      <s-text size="caption" variant="muted">
        {{ t('times_in_zone', [timeZone]) }}
      </s-text>
    </div>

    <s-text v-if="invalidSchedule" size="caption" class="error" role="alert">
      {{
        t(
          'choose_different_start_and_end_times_or_turn_off_use_schedule_for_all_day'
        )
      }}
    </s-text>
    <s-text v-if="failed" size="caption" class="error" role="alert">
      {{ t('couldnt_save_dark_mode_try_again') }}
    </s-text>
  </div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import Vue from 'vue';
import {
  SCheckbox,
  SText,
  STextInput,
  SToggleSwitch,
} from '@stylebot/components';
import {
  defaultGlobalDarkModeSettings,
  isDarkModeEnabled,
  isValidGlobalDarkModeSettings,
  normalizeGlobalDarkModeSettings,
} from '@stylebot/settings';
import type {
  GetDarkMode,
  GetDarkModeResponse,
  GlobalDarkModeSettings,
  SetDarkMode,
  SetDarkModeResponse,
  SetGlobalDarkModeSettings,
  SetGlobalDarkModeSettingsResponse,
} from '@stylebot/types';

import PopupRow from './PopupRow.vue';

// Often enough that a schedule turning over shows while the popup is open.
const CLOCK_MS = 1000;

/**
 * Dark mode for the tab's site, and for all websites with an optional daily
 * schedule in local time. While all websites is on, it decides for this site
 * too, which keeps its own choice for when that's turned off again.
 */
export default Vue.extend({
  name: 'DarkMode',

  components: {
    PopupRow,
    SCheckbox,
    SText,
    STextInput,
    SToggleSwitch,
  },

  props: {
    tab: {
      type: Object as PropType<chrome.tabs.Tab>,
      required: true,
    },
  },

  data(): {
    enabled: boolean;
    siteEnabled: boolean;
    siteSupported: boolean;
    saving: boolean;
    globalSettings: GlobalDarkModeSettings;
    savedGlobalSettings: GlobalDarkModeSettings;
    globalLoaded: boolean;
    globalSaving: boolean;
    invalidSchedule: boolean;
    failed: boolean;
    timeZone: string;
    clock: number | undefined;
  } {
    return {
      enabled: false,
      siteEnabled: false,
      siteSupported: false,
      saving: false,
      globalSettings: { ...defaultGlobalDarkModeSettings },
      savedGlobalSettings: { ...defaultGlobalDarkModeSettings },
      globalLoaded: false,
      globalSaving: false,
      invalidSchedule: false,
      failed: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clock: undefined,
    };
  },

  computed: {
    siteLocked(): boolean {
      return (
        !this.siteSupported ||
        this.saving ||
        this.globalSaving ||
        this.globalSettings.enabled
      );
    },

    globalLocked(): boolean {
      return !this.globalLoaded || this.globalSaving;
    },
  },

  async created() {
    this.clock = window.setInterval(this.refreshEnabled, CLOCK_MS);

    const message: GetDarkMode = { name: 'GetDarkMode', tabId: this.tab.id };
    const response = await chrome.runtime
      .sendMessage<GetDarkMode, GetDarkModeResponse>(message)
      .catch(() => undefined);

    if (!response) {
      return;
    }

    this.globalSettings = normalizeGlobalDarkModeSettings(
      response.globalSettings
    );
    this.savedGlobalSettings = { ...this.globalSettings };
    this.globalLoaded = true;
    this.siteSupported = !!response.key;
    this.siteEnabled = response.siteEnabled === true;
    this.refreshEnabled();
  },

  beforeDestroy() {
    window.clearInterval(this.clock);
  },

  methods: {
    /**
     * Shows whether Dark mode is on for the site now, as saved.
     */
    refreshEnabled(): void {
      this.enabled =
        this.siteSupported &&
        isDarkModeEnabled(this.siteEnabled, this.savedGlobalSettings);
    },

    async setSite(value: boolean): Promise<void> {
      const { id: tabId, url } = this.tab;

      if (tabId === undefined || !url) {
        return;
      }

      this.enabled = value;
      this.saving = true;
      this.failed = false;

      const message: SetDarkMode = { name: 'SetDarkMode', tabId, url, value };
      const saved = await chrome.runtime
        .sendMessage<SetDarkMode, SetDarkModeResponse>(message)
        .catch(() => false);

      this.saving = false;

      if (saved) {
        this.siteEnabled = value;
      } else {
        this.failed = true;
      }

      this.refreshEnabled();
    },

    /**
     * Changes one of the global settings and saves them, unless that leaves
     * a schedule that starts and ends at the same time.
     */
    async setGlobal<K extends keyof GlobalDarkModeSettings>(
      field: K,
      value: GlobalDarkModeSettings[K]
    ): Promise<void> {
      const next = { ...this.globalSettings, [field]: value };

      this.globalSettings = next;
      this.failed = false;

      if (!isValidGlobalDarkModeSettings(next)) {
        this.invalidSchedule = true;
        return;
      }

      this.invalidSchedule = false;
      this.globalSaving = true;

      const message: SetGlobalDarkModeSettings = {
        name: 'SetGlobalDarkModeSettings',
        value: next,
      };
      const saved = await chrome.runtime
        .sendMessage<
          SetGlobalDarkModeSettings,
          SetGlobalDarkModeSettingsResponse
        >(message)
        .catch(() => false);

      this.globalSaving = false;

      if (saved) {
        this.savedGlobalSettings = { ...next };
      } else {
        this.globalSettings = { ...this.savedGlobalSettings };
        this.failed = true;
      }

      this.refreshEnabled();
    },
  },
});
</script>

<style lang="scss" scoped>
.dark-mode-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schedule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 10px 8px;
}

.schedule-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.schedule-times {
  display: flex;
  gap: 8px;
}

.schedule-time {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.error {
  padding: 0 10px 8px;
  color: var(--danger);
}
</style>
