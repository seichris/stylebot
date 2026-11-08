// C0 controls but tab and newline, DEL, and C1 controls: ESC starts the
// sequences that recolor, clear or retitle a terminal, or link text (OSC 8).
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;

/**
 * Text that may come from a page, made safe to print to a terminal: control
 * characters dropped, so a page can't drive the terminal or forge the lines
 * around its own, with tabs and newlines kept for the output's layout. A
 * carriage return, which would print over a line, becomes a newline.
 */
export const stripTerminalControls = text =>
  String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[\v\f]/g, ' ')
    .replace(CONTROLS, '');
