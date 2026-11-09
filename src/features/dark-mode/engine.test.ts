import { applyDarkMode, removeDarkMode } from './engine';

// jsdom has no computed styles for pseudo-elements.
const computedStyle = window.getComputedStyle;

const darkStylesheet = () => document.getElementById('stylebot-dark-mode');

describe('the Dark mode engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.style.backgroundColor = '#fff';
    document.body.style.backgroundColor = 'transparent';
    document.body.innerHTML =
      '<main style="background:white;color:black"><p>Text</p><img src="photo.png"><canvas></canvas></main>';
    jest
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) =>
        pseudo
          ? ({ content: 'none' } as CSSStyleDeclaration)
          : computedStyle(element)
      );
  });

  afterEach(() => {
    removeDarkMode();
    jest.restoreAllMocks();
    jest.useRealTimers();
    document.documentElement.removeAttribute('style');
    document
      .querySelectorAll('html > style, stylebot-cli-mode')
      .forEach(el => el.remove());
  });

  it('adds styles it can take back, without touching the page’s own styles or media', () => {
    const main = document.querySelector('main') as HTMLElement;
    const original = main.getAttribute('style');

    applyDarkMode();

    expect(darkStylesheet()?.textContent).toContain('!important');
    expect(main.getAttribute('style')).toBe(original);
    expect(
      document.querySelector('img')?.hasAttribute('data-stylebot-dark-id')
    ).toBe(false);
    expect(
      document.querySelector('canvas')?.hasAttribute('data-stylebot-dark-id')
    ).toBe(false);

    removeDarkMode();

    expect(darkStylesheet()).toBeNull();
    expect(document.querySelectorAll('[data-stylebot-dark-id]')).toHaveLength(
      0
    );

    applyDarkMode();

    expect(darkStylesheet()?.textContent).toContain('!important');
  });

  it('leaves a dark page alone', () => {
    document.body.style.backgroundColor = '#111';

    applyDarkMode();

    expect(darkStylesheet()?.textContent).toBe('');
  });

  it('leaves a page that declares its own dark scheme alone', () => {
    document.documentElement.style.setProperty('color-scheme', 'light dark');

    applyDarkMode();

    expect(darkStylesheet()?.textContent).toBe('');
  });

  it('applies nothing it had pending once it’s turned off before the page is ready', () => {
    applyDarkMode();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    removeDarkMode();
    jest.runOnlyPendingTimers();

    expect(darkStylesheet()).toBeNull();
  });

  it('keeps the stylesheet in place on hover', () => {
    const main = document.querySelector('main')!;

    applyDarkMode();
    const originalRules = darkStylesheet()?.firstChild;

    main.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    main.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    jest.runOnlyPendingTimers();

    expect(darkStylesheet()?.firstChild).toBe(originalRules);
  });

  it('does not rebuild when its own stylesheet fires a load event', () => {
    applyDarkMode();
    const stylesheet = darkStylesheet()!;
    const originalRules = stylesheet.firstChild;

    stylesheet.dispatchEvent(new Event('load'));
    jest.runOnlyPendingTimers();

    expect(stylesheet.firstChild).toBe(originalRules);
  });

  it('leaves Stylebot’s own UI to its own themes', () => {
    const terminal = document.createElement('stylebot-cli-mode');
    const editor = document.createElement('div');

    editor.id = 'stylebot';
    editor.innerHTML = '<p>Panel</p>';
    document.body.append(terminal, editor);

    applyDarkMode();

    expect(terminal.hasAttribute('data-stylebot-dark-id')).toBe(false);
    expect(editor.hasAttribute('data-stylebot-dark-id')).toBe(false);
    expect(
      editor.querySelector('p')?.hasAttribute('data-stylebot-dark-id')
    ).toBe(false);
  });

  it('goes ahead of the styles Stylebot injects for the page, so a saved style wins a tie', () => {
    const saved = document.createElement('style');

    saved.id = 'stylebot-css-example.com';
    document.documentElement.append(saved);

    applyDarkMode();

    expect(darkStylesheet()?.nextElementSibling).toBe(saved);
  });
});
