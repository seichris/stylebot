// The origin of the page a tab showed when the agent forced a state on it,
// under a key of the tab's own. Kept for the session, as a state stays forced
// while the worker sleeps.
const forcedPageKey = (tabId: number): string => `cli-forced-page:${tabId}`;

/**
 * The origin of an http(s) url, which is all the CLI forces states on.
 */
const getWebOrigin = (url: string | undefined): string | null => {
  try {
    const { protocol, origin } = new URL(url ?? '');
    return protocol === 'http:' || protocol === 'https:' ? origin : null;
  } catch {
    return null;
  }
};

/**
 * Records that the agent forces a state on the page a tab shows, so its own
 * stylesheets may be fetched for it (see canFetchPageSheet), or forgets it
 * once nothing is forced there.
 */
export const setForcedOnTab = async (
  tabId: number,
  forced: boolean
): Promise<void> => {
  const key = forcedPageKey(tabId);
  const origin = forced
    ? getWebOrigin((await chrome.tabs.get(tabId)).url)
    : null;

  if (origin) {
    await chrome.storage.session.set({ [key]: origin });
  } else {
    await chrome.storage.session.remove(key);
  }
};

/**
 * Whether the background may fetch one of a page's own stylesheets, which it
 * can't read itself, for the CLI to copy its state rules from: an http(s)
 * sheet asked for by the top frame of a tab the agent forces a state on,
 * while it shows the origin it was forced on. The page chooses which sheets
 * it links, so nothing but the agent forcing a state there lets them be
 * fetched.
 */
export const canFetchPageSheet = async (
  url: string,
  sender: chrome.runtime.MessageSender
): Promise<boolean> => {
  const tabId = sender.tab?.id;

  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    tabId === undefined ||
    !getWebOrigin(url)
  ) {
    return false;
  }

  const key = forcedPageKey(tabId);
  const { [key]: origin } = await chrome.storage.session.get(key);

  return (
    typeof origin === 'string' &&
    origin === getWebOrigin(sender.url || sender.tab?.url)
  );
};
