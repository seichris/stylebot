import { canFetchPageSheet, setForcedOnTab } from './page-sheets';

const TAB = 7;
const PAGE = 'https://example.com/products?page=2';
const SHEET = 'https://cdn.example.net/site.css';

let session: Record<string, unknown>;
let tabUrl: string;

const fromPage = (
  changes: Partial<chrome.runtime.MessageSender> = {}
): chrome.runtime.MessageSender => ({
  id: 'stylebot',
  frameId: 0,
  url: PAGE,
  tab: { id: TAB, url: PAGE } as chrome.tabs.Tab,
  ...changes,
});

beforeEach(() => {
  session = {};
  tabUrl = PAGE;

  global.chrome = {
    runtime: { id: 'stylebot' },
    tabs: { get: jest.fn(async () => ({ id: TAB, url: tabUrl })) },
    storage: {
      session: {
        get: jest.fn(async (key: string) =>
          key in session ? { [key]: session[key] } : {}
        ),
        set: jest.fn(async (items: Record<string, unknown>) => {
          Object.assign(session, items);
        }),
        remove: jest.fn(async (key: string) => {
          delete session[key];
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('canFetchPageSheet', () => {
  it("lets a page the agent forces a state on have its own sheets fetched, even on another of the origin's urls", async () => {
    await setForcedOnTab(TAB, true);

    await expect(canFetchPageSheet(SHEET, fromPage())).resolves.toBe(true);
    await expect(
      canFetchPageSheet(
        'http://cdn.example.net/print.css',
        fromPage({ url: 'https://example.com/cart' })
      )
    ).resolves.toBe(true);
  });

  it('fetches nothing for a tab no state was forced on', async () => {
    await expect(canFetchPageSheet(SHEET, fromPage())).resolves.toBe(false);
  });

  it('fetches nothing once nothing is forced there', async () => {
    await setForcedOnTab(TAB, true);
    await setForcedOnTab(TAB, false);

    await expect(canFetchPageSheet(SHEET, fromPage())).resolves.toBe(false);
  });

  it.each<[string, Partial<chrome.runtime.MessageSender>]>([
    ['another tab', { tab: { id: 8, url: PAGE } as chrome.tabs.Tab }],
    ['a page of another origin', { url: 'https://other.example/' }],
    ['a frame in the page', { frameId: 3 }],
    ['another extension', { id: 'other' }],
  ])('fetches nothing for %s', async (_name, changes) => {
    await setForcedOnTab(TAB, true);

    await expect(canFetchPageSheet(SHEET, fromPage(changes))).resolves.toBe(
      false
    );
  });

  it.each([
    'file:///etc/hosts',
    'chrome-extension://stylebot/options.html',
    'data:text/css,a{}',
    'not a url',
  ])('fetches no sheet at %s', async url => {
    await setForcedOnTab(TAB, true);

    await expect(canFetchPageSheet(url, fromPage())).resolves.toBe(false);
  });

  it('records nothing for a page off the web', async () => {
    tabUrl = 'file:///Users/me/index.html';

    await setForcedOnTab(TAB, true);

    expect(chrome.storage.session.set).not.toBeCalled();
    await expect(
      canFetchPageSheet(
        SHEET,
        fromPage({
          url: tabUrl,
          tab: { id: TAB, url: tabUrl } as chrome.tabs.Tab,
        })
      )
    ).resolves.toBe(false);
  });
});
