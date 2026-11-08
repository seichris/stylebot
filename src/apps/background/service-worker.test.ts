/*
 * @jest-environment node
 */
import fs from 'node:fs';
import path from 'node:path';

const isSource = (name: string): boolean =>
  name.endsWith('.ts') && !name.endsWith('.test.ts');

const getSources = (dir: string): Array<string> =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return getSources(file);
    }

    return isSource(entry.name) ? [file] : [];
  });

// Every package the background imports, read from its sources so one added
// later is covered too.
const PACKAGES = Array.from(
  new Set(
    getSources(__dirname).flatMap(file =>
      Array.from(
        fs
          .readFileSync(file, 'utf8')
          .matchAll(/(?:from|import) '(@stylebot\/[a-z-]+)'/g),
        match => match[1]
      )
    )
  )
).sort();

/*
 * The background runs as a service worker, with no window or document. A
 * package that touched either as it loaded would stop the worker before it
 * registered a listener, and with it every saved style and the editor.
 */
describe('the packages the background imports', () => {
  it('are read from its sources', () => {
    expect(PACKAGES).toEqual(
      expect.arrayContaining(['@stylebot/saved-styles', '@stylebot/utils'])
    );
  });

  it.each(PACKAGES)('load %s without a window or document', name => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');

    jest.isolateModules(() => {
      expect(() => require(name)).not.toThrow();
    });
  });
});
