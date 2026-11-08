import { matchesUrlPattern } from '@stylebot/saved-styles';
import type { CompiledStyles } from '@stylebot/types';

import { getGalleryPreviewImportUrls } from './gallery-preview';
import { ensureCompiledStyles } from './styles';

// Google Fonts serves its stylesheets to any origin, so fetching one for a
// page gives it nothing it couldn't fetch itself. Font previews, the reader's
// fonts and a font just picked in the editor import these before any save.
const GOOGLE_FONTS_CSS = /^https:\/\/fonts\.googleapis\.com\/css2?\?/;

/**
 * The page a message came from: its frame's url, or its tab's where the
 * browser leaves the frame's out.
 */
const getSenderPageUrl = (
  sender: chrome.runtime.MessageSender
): string | undefined => sender.url || sender.tab?.url;

/**
 * Whether a stored style whose url pattern matches the page imports the url,
 * enabled or not, as the page's own cache lists both.
 */
const isSavedImport = (
  url: string,
  pageUrl: string,
  compiled: CompiledStyles
): boolean =>
  Object.entries(compiled.styles).some(
    ([pattern, style]) =>
      Array.isArray(style.importUrls) &&
      style.importUrls.includes(url) &&
      matchesUrlPattern(pageUrl, pattern)
  );

/**
 * Whether the background may fetch a stylesheet for a page's @import: one a
 * stored style for the page imports, one the gallery style its tab previews
 * imports, or a Google Fonts stylesheet. Checked against the styles in
 * storage, never the page's own cache of them, which the page can write.
 */
export const canFetchImport = async (
  url: string,
  sender: chrome.runtime.MessageSender
): Promise<boolean> => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (GOOGLE_FONTS_CSS.test(url)) {
    return true;
  }

  const pageUrl = getSenderPageUrl(sender);

  if (!pageUrl) {
    return false;
  }

  if (isSavedImport(url, pageUrl, await ensureCompiledStyles())) {
    return true;
  }

  const tabId = sender.tab?.id;

  return (
    tabId !== undefined &&
    (await getGalleryPreviewImportUrls(tabId, pageUrl)).includes(url)
  );
};
