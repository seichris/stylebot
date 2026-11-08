import {
  NOTE_FRAME_HANDSHAKE,
  NOTE_MAX_HEIGHT,
  type FromNoteFrame,
  type NoteFrameHandshake,
  type ToNoteFrame,
} from './protocol';

export type NoteField = {
  fit: () => void;
  receive: (message: ToNoteFrame) => void;
};

/**
 * Builds the note field in the frame's document, as a terminal prompt: Enter
 * sends, Shift+Enter starts a new line, Esc hands the keyboard back to the
 * page. Tells the terminal through `send`; `receive` takes its messages.
 */
export const createNoteField = (
  root: HTMLElement,
  send: (message: FromNoteFrame) => void
): NoteField => {
  const field = document.createElement('textarea');
  const enter = document.createElement('span');

  field.className = 'field';
  field.rows = 1;
  enter.className = 'enter';
  enter.textContent = '⏎';
  enter.hidden = true;
  enter.setAttribute('aria-hidden', 'true');
  root.append(field, enter);

  const fit = (): void => {
    field.style.height = 'auto';

    const height = Math.min(field.scrollHeight, NOTE_MAX_HEIGHT);

    field.style.height = `${height}px`;
    enter.hidden = !field.value.trim();
    send({ type: 'height', height });
  };

  field.addEventListener('input', fit);
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      field.blur();
      send({ type: 'escape' });
    } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();

      const text = field.value.trim();

      if (text) {
        send({ type: 'note', text });
        field.value = '';
        fit();
      }
    }
  });

  return {
    fit,
    receive: message => {
      if (message?.type === 'field') {
        field.placeholder = message.placeholder;
        field.setAttribute('aria-label', message.label);
      } else if (message?.type === 'focus') {
        field.focus();
      }
    },
  };
};

/**
 * A listener for the frame's window that takes the terminal's channel from
 * the first message carrying this frame's token, which only the terminal
 * that framed it knows, and builds the field on it. Anything else is ignored.
 */
export const acceptTerminal = (
  root: HTMLElement,
  token: string
): ((event: Pick<MessageEvent, 'data' | 'ports'>) => void) => {
  let connected = false;

  return event => {
    const [port] = event.ports ?? [];
    const data = event.data as Partial<NoteFrameHandshake> | null;

    if (
      connected ||
      !token ||
      !port ||
      data?.type !== NOTE_FRAME_HANDSHAKE ||
      data.token !== token
    ) {
      return;
    }

    connected = true;

    const field = createNoteField(root, message => port.postMessage(message));

    port.onmessage = ({ data: message }) => field.receive(message);
    port.postMessage({ type: 'ready' });
    field.fit();
  };
};
