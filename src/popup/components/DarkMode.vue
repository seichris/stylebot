<template>
  <b-list-group-item>
    <b-form-checkbox
      v-model="enabled"
      switch
      :disabled="!available || saving || globalSaving || globalSettings.enabled"
      @change="onChange"
    >
      {{ t('dark_mode') }}
    </b-form-checkbox>
    <small v-if="globalSettings.enabled">
      {{ t('dark_mode_global_controls_site') }}
    </small>

    <div class="mt-2 pt-2 border-top">
      <b-form-checkbox
        v-model="globalSettings.enabled"
        switch
        :disabled="!globalLoaded || globalSaving"
        @change="saveGlobalSettings"
      >
        {{ t('dark_mode_all_websites') }}
      </b-form-checkbox>
      <div v-if="globalSettings.enabled" class="mt-2">
        <b-form-checkbox
          v-model="globalSettings.scheduleEnabled"
          :disabled="globalSaving"
          @change="saveGlobalSettings"
        >
          {{ t('dark_mode_use_schedule') }}
        </b-form-checkbox>
        <div v-if="globalSettings.scheduleEnabled" class="d-flex mt-2">
          <label class="mr-2 mb-0" for="dark-mode-start">
            <small>{{ t('dark_mode_from') }}</small>
            <input
              id="dark-mode-start"
              v-model="globalSettings.start"
              type="time"
              class="form-control form-control-sm"
              required
              :disabled="globalSaving"
              @change="saveGlobalSettings"
            />
          </label>
          <label class="mb-0" for="dark-mode-end">
            <small>{{ t('dark_mode_until') }}</small>
            <input
              id="dark-mode-end"
              v-model="globalSettings.end"
              type="time"
              class="form-control form-control-sm"
              required
              :disabled="globalSaving"
              @change="saveGlobalSettings"
            />
          </label>
        </div>
        <small class="d-block mt-1">{{ timeZone }}</small>
      </div>
      <small v-if="invalidSchedule" class="d-block text-danger" role="alert">
        {{ t('dark_mode_schedule_error') }}
      </small>
    </div>
    <div v-if="needsReload" class="mt-1">
      <small>{{ t('dark_mode_reload_hint') }}</small>
      <button
        type="button"
        class="btn btn-link btn-sm p-0 d-block"
        @click="reloadPage"
      >
        {{ t('dark_mode_reload_page') }}
      </button>
    </div>
    <small v-if="failed" role="alert">{{ t('dark_mode_error') }}</small>
  </b-list-group-item>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import {
  GetDarkMode,
  GetDarkModeResponse,
  GetDarkModeStatus,
  SetDarkMode,
  SetGlobalDarkModeSettings,
} from '@stylebot/types';
import {
  defaultGlobalDarkModeSettings,
  normalizeGlobalDarkModeSettings,
  isValidGlobalDarkModeSettings,
  isDarkModeEnabled,
} from '../../dark-mode/settings';

export default Vue.extend({
  name: 'DarkMode',
  props: {
    tab: { type: Object as PropType<chrome.tabs.Tab>, required: true },
  },
  data() {
    return {
      enabled: false,
      available: false,
      saving: false,
      failed: false,
      needsReload: false,
      siteEnabled: false,
      siteSupported: false,
      globalSettings: { ...defaultGlobalDarkModeSettings },
      savedGlobalSettings: { ...defaultGlobalDarkModeSettings },
      globalLoaded: false,
      globalSaving: false,
      invalidSchedule: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clock: undefined as number | undefined,
    };
  },
  created() {
    const message: GetDarkMode = { name: 'GetDarkMode', tab: this.tab };
    chrome.runtime.sendMessage(message, (response: GetDarkModeResponse) => {
      if (chrome.runtime.lastError || !response) return;
      this.globalSettings = normalizeGlobalDarkModeSettings(
        response.globalSettings
      );
      this.savedGlobalSettings = { ...this.globalSettings };
      this.globalLoaded = true;
      this.siteSupported = !!response.key;
      this.siteEnabled =
        typeof response.siteEnabled === 'boolean'
          ? response.siteEnabled
          : response.enabled;
      this.refreshEnabled();
      if (!response.key || this.tab.id === undefined) return;
      const status: GetDarkModeStatus = { name: 'GetDarkModeStatus' };
      chrome.tabs.sendMessage(
        this.tab.id,
        status,
        { frameId: 0 },
        (ready: boolean) => {
          this.available = !chrome.runtime.lastError && ready === true;
          this.needsReload = !this.available;
        }
      );
    });
    this.clock = window.setInterval(this.refreshEnabled, 1000);
  },
  beforeDestroy() {
    if (this.clock !== undefined) window.clearInterval(this.clock);
  },
  methods: {
    refreshEnabled(): void {
      this.enabled =
        this.siteSupported &&
        isDarkModeEnabled(this.siteEnabled, this.savedGlobalSettings);
    },
    saveGlobalSettings(): void {
      if (this.globalSaving) return;
      if (!isValidGlobalDarkModeSettings(this.globalSettings)) {
        this.invalidSchedule = true;
        return;
      }
      this.invalidSchedule = false;
      this.failed = false;
      this.globalSaving = true;
      const value = { ...this.globalSettings };
      const message: SetGlobalDarkModeSettings = {
        name: 'SetGlobalDarkModeSettings',
        value,
      };
      chrome.runtime.sendMessage(message, (success: boolean) => {
        this.globalSaving = false;
        if (chrome.runtime.lastError || !success) {
          this.globalSettings = { ...this.savedGlobalSettings };
          this.failed = true;
        } else {
          this.savedGlobalSettings = value;
        }
        this.refreshEnabled();
      });
    },
    reloadPage(): void {
      if (this.tab.id === undefined) return;
      chrome.tabs.reload(this.tab.id, () => {
        if (chrome.runtime.lastError) {
          this.failed = true;
          return;
        }
        window.close();
      });
    },
    onChange(value: boolean): void {
      if (this.tab.id === undefined || !this.tab.url) return;
      this.saving = true;
      this.failed = false;
      const message: SetDarkMode = {
        name: 'SetDarkMode',
        tabId: this.tab.id,
        url: this.tab.url,
        value,
      };
      chrome.runtime.sendMessage(message, (success: boolean) => {
        this.saving = false;
        if (chrome.runtime.lastError || !success) {
          this.failed = true;
        } else {
          this.siteEnabled = value;
        }
        this.refreshEnabled();
      });
    },
  },
});
</script>
