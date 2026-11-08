import { acceptTerminal, createNoteField } from './frame';
import { NOTE_FRAME_HANDSHAKE, type FromNoteFrame } from './protocol';

const TOKEN = 'a1b2c3';

const fakePort = () => ({
  postMessage: jest.fn(),
  onmessage: null as ((event: { data: unknown }) => void) | null,
});

const handshake = (
  token: string,
  port: ReturnType<typeof fakePort> | null
): Pick<MessageEvent, 'data' | 'ports'> => ({
  data: { type: NOTE_FRAME_HANDSHAKE, token },
  ports: (port ? [port] : []) as unknown as ReadonlyArray<MessagePort>,
});

const press = (target: HTMLElement, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  target.dispatchEvent(event);
  return event;
};

describe('acceptTerminal', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => root.remove());

  it('builds the field on the channel sent with its token, and says it is ready', () => {
    const port = fakePort();

    acceptTerminal(root, TOKEN)(handshake(TOKEN, port));

    expect(root.querySelector('textarea')).not.toBeNull();
    expect(port.postMessage).toHaveBeenNthCalledWith(1, { type: 'ready' });
  });

  it('ignores a channel sent without its token, as anything but the terminal would', () => {
    const port = fakePort();

    acceptTerminal(root, TOKEN)(handshake('guess', port));

    expect(root.querySelector('textarea')).toBeNull();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a handshake without a channel, or of another kind', () => {
    const accept = acceptTerminal(root, TOKEN);

    accept(handshake(TOKEN, null));
    accept({
      data: { type: 'other', token: TOKEN },
      ports: [fakePort()] as unknown as ReadonlyArray<MessagePort>,
    });

    expect(root.querySelector('textarea')).toBeNull();
  });

  it('takes only the first channel, so a later one gets nothing', () => {
    const accept = acceptTerminal(root, TOKEN);
    const first = fakePort();
    const second = fakePort();

    accept(handshake(TOKEN, first));
    accept(handshake(TOKEN, second));

    expect(root.querySelectorAll('textarea')).toHaveLength(1);
    expect(second.postMessage).not.toHaveBeenCalled();
  });

  it('accepts nothing without a token in its url', () => {
    acceptTerminal(root, '')(handshake('', fakePort()));

    expect(root.querySelector('textarea')).toBeNull();
  });

  it('applies the label and placeholder the terminal sends over the channel', () => {
    const port = fakePort();

    acceptTerminal(root, TOKEN)(handshake(TOKEN, port));
    port.onmessage?.({
      data: {
        type: 'field',
        label: 'Note to your agent',
        placeholder: 'what should change about 1, 3?',
      },
    });

    const field = root.querySelector('textarea') as HTMLTextAreaElement;

    expect(field.getAttribute('aria-label')).toBe('Note to your agent');
    expect(field.placeholder).toBe('what should change about 1, 3?');
  });
});

describe('createNoteField', () => {
  let root: HTMLElement;
  let sent: Array<FromNoteFrame>;
  let field: HTMLTextAreaElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    sent = [];
    createNoteField(root, message => sent.push(message));
    field = root.querySelector('textarea') as HTMLTextAreaElement;
  });

  afterEach(() => root.remove());

  const type = (value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };

  it('sends the note on Enter, trimmed, and clears the field', () => {
    type('  make it blue  ');
    const event = press(field, { key: 'Enter' });

    expect(event.defaultPrevented).toBe(true);
    expect(sent).toContainEqual({ type: 'note', text: 'make it blue' });
    expect(field.value).toBe('');
  });

  it('leaves Shift+Enter to start a new line', () => {
    type('bigger');
    const event = press(field, { key: 'Enter', shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(sent.some(message => message.type === 'note')).toBe(false);
  });

  it('does not send an empty note', () => {
    type('   ');
    press(field, { key: 'Enter' });

    expect(sent.some(message => message.type === 'note')).toBe(false);
  });

  it('hands the keyboard back to the page on Esc', () => {
    field.focus();
    press(field, { key: 'Escape' });

    expect(document.activeElement).not.toBe(field);
    expect(sent).toContainEqual({ type: 'escape' });
  });

  it('tells the terminal its height as it changes', () => {
    type('one');

    expect(sent).toContainEqual({ type: 'height', height: expect.any(Number) });
  });

  it('shows the Enter hint only while there is something to send', () => {
    const enter = root.querySelector('.enter') as HTMLElement;

    expect(enter.hidden).toBe(true);
    type('x');
    expect(enter.hidden).toBe(false);
  });
});
