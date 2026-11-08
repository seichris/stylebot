import { isUserGesture } from './user-gesture';

describe('isUserGesture', () => {
  it('is false for an event a script dispatched', () => {
    const button = document.createElement('button');
    let clicked: Event | undefined;

    button.addEventListener('click', event => {
      clicked = event;
    });
    button.click();

    expect(isUserGesture(clicked)).toBe(false);
  });

  it('is false for a key a script dispatched', () => {
    const event = new KeyboardEvent('keydown', { key: 'z' });

    window.dispatchEvent(event);

    expect(isUserGesture(event)).toBe(false);
  });

  it('is true only for an event the browser marks trusted', () => {
    expect(isUserGesture({ isTrusted: true } as Event)).toBe(true);
    expect(isUserGesture({ isTrusted: false } as Event)).toBe(false);
  });

  it('is false without an event', () => {
    expect(isUserGesture(undefined)).toBe(false);
    expect(isUserGesture(null)).toBe(false);
  });
});
