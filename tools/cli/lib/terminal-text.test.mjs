const { stripTerminalControls } = require('./terminal-text.mjs');

const ESC = '\x1b';

describe('stripTerminalControls', () => {
  it('keeps an outline as it is laid out: lines, indents, tabs and any script', () => {
    const outline = [
      'body',
      '  header.top "Hacker News ①"',
      '    a.title "Ask HN: 東京 — naïve café ×2"',
      '\tmain "مرحبا"',
    ].join('\n');

    expect(stripTerminalControls(outline)).toBe(outline);
  });

  it('drops the ESC of a color, clear or title sequence, leaving it inert text', () => {
    expect(stripTerminalControls(`a "${ESC}[31mred${ESC}[0m"`)).toBe(
      'a "[31mred[0m"'
    );
    expect(stripTerminalControls(`${ESC}[2J${ESC}[H`)).toBe('[2J[H');
    expect(stripTerminalControls(`${ESC}]0;title\x07`)).toBe(']0;title');
  });

  it('drops the controls of an OSC 8 link that would show other text than its address', () => {
    const link = `${ESC}]8;;https://elsewhere.example${ESC}\\Open docs${ESC}]8;;${ESC}\\`;

    expect(stripTerminalControls(link)).not.toMatch(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0e-\x1f\x7f-\x9f]/
    );
    expect(stripTerminalControls(link)).toContain('Open docs');
  });

  it('drops C1 controls, which some terminals take as ESC sequences', () => {
    expect(stripTerminalControls('a\x9b31mred\x9d0;title\x07')).toBe(
      'a31mred0;title'
    );
  });

  it('turns a carriage return into a newline, so a line cannot print over another', () => {
    expect(stripTerminalControls('ok\rFAILED')).toBe('ok\nFAILED');
    expect(stripTerminalControls('a\r\nb')).toBe('a\nb');
  });

  it('drops backspaces and other C0 controls, and DEL', () => {
    expect(stripTerminalControls('safe\b\b\b\bevil\x00\x7f')).toBe('safeevil');
  });

  it('prints anything else as text', () => {
    expect(stripTerminalControls(42)).toBe('42');
  });
});
