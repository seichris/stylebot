import {
  Style,
  StylebotOptions,
  StylebotCommands,
  ReadabilitySettings,
  Timestamp,
  GlobalDarkModeSettings,
} from '@stylebot/types';

export type GetAllOptionsResponse = StylebotOptions;
export type GetOptionResponse = StylebotOptions[keyof StylebotOptions];

export type GetAllStylesResponse = {
  [url: string]: {
    css: string;
    enabled: boolean;
    readability: boolean;
    modifiedTime: Timestamp;
  };
};

export type GetStylesForPageResponse = {
  styles: Array<Style>;
  defaultStyle?: Style;
};

export type GetCommandsResponse = StylebotCommands;
export type GetReadabilitySettingsResponse = ReadabilitySettings;

export type GetImportCssResponse = string;
export type RunGoogleDriveSyncResponse = void;
export type GetDarkModeResponse = {
  enabled: boolean;
  siteEnabled: boolean;
  key?: string;
  globalSettings: GlobalDarkModeSettings;
};

type BackgroundPageMessageResponse =
  | GetAllOptionsResponse
  | GetOptionResponse
  | GetAllStylesResponse
  | GetStylesForPageResponse
  | GetCommandsResponse
  | GetReadabilitySettingsResponse
  | GetImportCssResponse
  | RunGoogleDriveSyncResponse
  | GetDarkModeResponse
  | boolean;

export default BackgroundPageMessageResponse;
