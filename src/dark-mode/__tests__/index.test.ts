import { apply, remove } from '../index';

// jsdom does not implement pseudo-element computed styles.
const computedStyle = window.getComputedStyle;

beforeEach(() => {
  jest.useFakeTimers();
  document.documentElement.style.backgroundColor = '#fff';
  document.body.style.backgroundColor = 'transparent';
  document.body.innerHTML =
    '<main style="background:white;color:black"><p>Text</p><img src="photo.png"><canvas></canvas></main>';
  jest
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element, pseudo) => {
      if (pseudo) return { content: 'none' } as CSSStyleDeclaration;
      return computedStyle(element);
    });
});
afterEach(() => {
  remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
  document.documentElement.removeAttribute('style');
});

it('adds reversible styles without modifying authored inline styles or media', () => {
  const main = document.querySelector('main') as HTMLElement;
  const original = main.getAttribute('style');
  apply();
  expect(document.getElementById('stylebot-dark-mode')?.textContent).toContain(
    '!important'
  );
  expect(main.getAttribute('style')).toBe(original);
  expect(
    document.querySelector('img')?.hasAttribute('data-stylebot-dark-id')
  ).toBe(false);
  expect(
    document.querySelector('canvas')?.hasAttribute('data-stylebot-dark-id')
  ).toBe(false);
  remove();
  expect(document.getElementById('stylebot-dark-mode')).toBeNull();
  expect(document.querySelectorAll('[data-stylebot-dark-id]').length).toBe(0);
  apply();
  expect(document.getElementById('stylebot-dark-mode')?.textContent).toContain(
    '!important'
  );
});

it('leaves a dark page alone', () => {
  document.body.style.backgroundColor = '#111';
  apply();
  expect(document.getElementById('stylebot-dark-mode')?.textContent).toBe('');
  document.body.style.backgroundColor = '';
});

it('honors native dark support and explicit opt-outs', () => {
  document.documentElement.style.setProperty('color-scheme', 'light dark');
  apply();
  expect(document.getElementById('stylebot-dark-mode')?.textContent).toBe('');
});

it('cancels pending application when disabled before DOM readiness', () => {
  apply();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  remove();
  jest.runOnlyPendingTimers();
  expect(document.getElementById('stylebot-dark-mode')).toBeNull();
});
