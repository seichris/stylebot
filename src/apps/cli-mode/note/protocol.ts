// The note field's page, framed in the terminal (see CliNoteFrame.vue).
export const NOTE_FRAME_PATH = 'cli-mode/note/index.html';

// What the terminal sends the frame, once, with its end of their channel.
export const NOTE_FRAME_HANDSHAKE = 'stylebot-cli-note-channel';

// One of the terminal's 18px lines, and the most the field grows to.
export const NOTE_FIELD_HEIGHT = 18;
export const NOTE_MAX_HEIGHT = 120;

export type NoteFrameHandshake = {
  type: typeof NOTE_FRAME_HANDSHAKE;
  token: string;
};

export type ToNoteFrame =
  | { type: 'field'; label: string; placeholder: string }
  | { type: 'focus' };

export type FromNoteFrame =
  | { type: 'ready' }
  | { type: 'note'; text: string }
  | { type: 'escape' }
  | { type: 'height'; height: number };

/**
 * A random token for the frame's url. From getRandomValues, which unlike
 * randomUUID works on pages that aren't a secure context.
 */
export const createToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
