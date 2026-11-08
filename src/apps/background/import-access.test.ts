jest.mock('./styles', () => ({ ensureCompiledStyles: jest.fn() }));
jest.mock('./gallery-preview', () => ({
  getGalleryPreviewImportUrls: jest.fn(),
}));

import { COMPILED_STYLES_VERSION } from '@stylebot/saved-styles';
import type { CompiledStyle, CompiledStyles } from '@stylebot/types';

import { getGalleryPreviewImportUrls } from './gallery-preview';
import { canFetchImport } from './import-access';
import { ensureCompiledStyles } from './styles';

const THEME = 'https://cdn.example.com/theme.css';
const UNLISTED = 'http://intranet.example/site.css';

const compiled = (styles: Record<string, Partial<CompiledStyle>>) =>
  ({
    version: COMPILED_STYLES_VERSION,
    revision: '1',
    styles: Object.fromEntries(
      Object.entries(styles).map(([url, style]) => [
        url,
        {
          css: 'a{color:red!important}',
          importUrls: [],
          enabled: true,
          readability: false,
          ...style,
        },
      ])
    ),
  } as CompiledStyles);

const fromPage = (
  url: string,
  overrides: Partial<chrome.runtime.MessageSender> = {}
): chrome.runtime.MessageSender => ({
  id: 'stylebot',
  url,
  tab: { id: 7, url } as chrome.tabs.Tab,
  ...overrides,
});

describe('canFetchImport', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.chrome = { runtime: { id: 'stylebot' } } as unknown as typeof chrome;
    (getGalleryPreviewImportUrls as jest.Mock).mockResolvedValue([]);
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(compiled({}));
  });

  it('allows an import a stored style for the page declares', async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'example.com': { importUrls: [THEME] } })
    );

    await expect(
      canFetchImport(THEME, fromPage('https://example.com/a'))
    ).resolves.toBe(true);
  });

  it('allows the import of a disabled style for the page, which its cache lists too', async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'example.com': { importUrls: [THEME], enabled: false } })
    );

    await expect(
      canFetchImport(THEME, fromPage('https://example.com/a'))
    ).resolves.toBe(true);
  });

  it("refuses an import only the page's own cache lists", async () => {
    await expect(
      canFetchImport(UNLISTED, fromPage('https://elsewhere.example/'))
    ).resolves.toBe(false);
  });

  it('refuses an import a stored style declares for another site', async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'example.com': { importUrls: [UNLISTED] } })
    );

    await expect(
      canFetchImport(UNLISTED, fromPage('https://elsewhere.example/'))
    ).resolves.toBe(false);
  });

  it("goes by the asking frame's url rather than its tab's", async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'top.example': { importUrls: [THEME] } })
    );
    const sender = fromPage('https://frame.example/', {
      tab: { id: 7, url: 'https://top.example/' } as chrome.tabs.Tab,
    });

    await expect(canFetchImport(THEME, sender)).resolves.toBe(false);
  });

  it("falls back to the tab's url when the browser leaves the frame's out", async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'example.com': { importUrls: [THEME] } })
    );
    const sender = fromPage('https://example.com/', { url: undefined });

    await expect(canFetchImport(THEME, sender)).resolves.toBe(true);
  });

  it("allows an import of the gallery style the tab previews on the preview's site", async () => {
    (getGalleryPreviewImportUrls as jest.Mock).mockResolvedValue([THEME]);

    await expect(
      canFetchImport(THEME, fromPage('https://news.example.com/'))
    ).resolves.toBe(true);
    expect(getGalleryPreviewImportUrls).toHaveBeenCalledWith(
      7,
      'https://news.example.com/'
    );
  });

  it('allows a Google Fonts stylesheet without reading the stored styles', async () => {
    await expect(
      canFetchImport(
        'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap',
        fromPage('https://example.com/')
      )
    ).resolves.toBe(true);
    expect(ensureCompiledStyles).not.toHaveBeenCalled();
  });

  it.each([
    'https://fonts.googleapis.com.elsewhere.example/css?family=Inter',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'http://fonts.googleapis.com/css?family=Inter',
  ])('treats %s like any other import', async url => {
    await expect(
      canFetchImport(url, fromPage('https://example.com/'))
    ).resolves.toBe(false);
  });

  it('refuses a message from another extension', async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({ 'example.com': { importUrls: [THEME] } })
    );

    await expect(
      canFetchImport(THEME, fromPage('https://example.com/', { id: 'other' }))
    ).resolves.toBe(false);
  });

  it('refuses a sender with no page', async () => {
    await expect(canFetchImport(THEME, { id: 'stylebot' })).resolves.toBe(
      false
    );
    expect(ensureCompiledStyles).not.toHaveBeenCalled();
  });

  it('still allows the stored imports when another stored style has an invalid regex pattern', async () => {
    (ensureCompiledStyles as jest.Mock).mockResolvedValue(
      compiled({
        '^https://example\\.com/(': { importUrls: [UNLISTED] },
        'example.com': { importUrls: [THEME] },
      })
    );

    await expect(
      canFetchImport(THEME, fromPage('https://example.com/'))
    ).resolves.toBe(true);
    await expect(
      canFetchImport(UNLISTED, fromPage('https://example.com/'))
    ).resolves.toBe(false);
  });
});
