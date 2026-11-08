// Builds the Firefox extension and packages what AMO asks for: the extension
// zip, and a zip of the source it was built from with build steps for reviewers.
//
//   yarn package:firefox

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import { requireReleaseTag } from '../stores/shared.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'release');

// Kept out of the source zip: store art and the Safari app aren't part of the
// Firefox build.
const EXCLUDED_FROM_SOURCE = ['store', 'safari'];

const AMO_MAX_JS_MB = 4;

/**
 * The JavaScript files in dir that are too large for AMO's linter to parse,
 * relative to dir.
 */
function findFilesTooLargeForAMO(dir) {
  return readdirSync(dir, { recursive: true })
    .filter(file => file.endsWith('.js'))
    .filter(
      file => statSync(path.join(dir, file)).size > AMO_MAX_JS_MB * 2 ** 20
    );
}

/**
 * Runs a command in the repo root, printing its output.
 */
function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

/**
 * The build steps AMO reviewers follow to rebuild the extension from source.
 */
function getBuildInstructions(version, { clientId, clientSecret }) {
  const nodeVersion = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();

  return `# Building Stylebot ${version} for Firefox

Requirements: Node.js ${nodeVersion} and Yarn 1 (classic). Any OS with a POSIX shell.

1. \`yarn install --frozen-lockfile\`
2. \`STYLEBOT_GOOGLE_CLIENT_ID=${clientId} STYLEBOT_GOOGLE_CLIENT_SECRET=${clientSecret} yarn build:firefox\`

The built extension is written to \`firefox-dist/\`, which matches the uploaded
package. The variables are the id and secret of Stylebot's Google sign-in
client for installed apps, which Google treats as public since they ship in
the package; they're kept out of the repository only. No network access
beyond the npm registry is needed.

## Notes for reviewers

Stylebot shows no ads and runs no analytics scripts. Besides the pages the
user styles, it talks to these:

- **Gallery** (\`api.stylebot.dev\`), on by default: when the popup opens on a
  public site the Gallery lists, Stylebot asks the Gallery for that site's
  styles, sending its hostname. The list of sites is downloaded to decide
  that locally; private windows never ask, and the Gallery suggestions setting
  turns it off. Installing a Gallery style sends a random install id, kept in
  the browser's synced storage, so each person's install counts once. Styles
  installed from the Gallery are checked for updates once a day, by style id,
  and updated unless the user edited them; there's no setting for this.
  Publishing a style hands the Gallery site its CSS, name, url pattern and a
  screenshot of the page, only when the user clicks Publish.
- **Sync**, only when the user turns it on, signs in with Google through
  \`identity\` and stores styles in the user's own Google Drive, with the
  \`drive.file\` scope, so it only sees files it created.
- **Google Fonts**: fonts the user picks in the editor or the reader are
  loaded from Google Fonts.
- **Imported stylesheets**: a style's \`@import\` rules are fetched for the
  pages that style applies to, from whatever host the style names.
- **stylebot.dev**: a welcome page opens on install and release notes on some
  updates, and uninstalling opens a goodbye page with the version in its url.

All code ships in the package; nothing but CSS is loaded remotely: Gallery
styles and the stylesheets a style imports. The privacy policy is at
https://stylebot.dev/privacy.
`;
}

const status = execFileSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
});

if (status.trim()) {
  console.error(
    'Commit or set aside your changes first: the source zip is made from the ' +
      'last commit, so it has to match what gets built.'
  );
  process.exit(1);
}

const clientId = process.env.STYLEBOT_GOOGLE_CLIENT_ID;
const clientSecret = process.env.STYLEBOT_GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Set STYLEBOT_GOOGLE_CLIENT_ID and STYLEBOT_GOOGLE_CLIENT_SECRET to the ' +
      'Desktop OAuth client id and secret; Google sign-in needs them.'
  );
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8')
);
try {
  requireReleaseTag(version);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const extensionZip = path.join(outDir, `stylebot-${version}-firefox.zip`);
const sourceZip = path.join(outDir, `stylebot-${version}-source.zip`);

mkdirSync(outDir, { recursive: true });
rmSync(extensionZip, { force: true });
rmSync(sourceZip, { force: true });

run('yarn', ['build:firefox']);

const tooLarge = findFilesTooLargeForAMO(path.join(root, 'firefox-dist'));

if (tooLarge.length) {
  console.error(
    `AMO's linter can't parse JavaScript files over ${AMO_MAX_JS_MB} MB, so ` +
      `it would reject the upload:\n  ${tooLarge.join('\n  ')}`
  );
  process.exit(1);
}

run('zip', ['-r', '-X', '-q', extensionZip, '.', '-x', '.build-complete'], {
  cwd: path.join(root, 'firefox-dist'),
});

run('git', [
  'archive',
  '--format=zip',
  `--add-virtual-file=AMO-BUILD.md:${getBuildInstructions(version, {
    clientId,
    clientSecret,
  })}`,
  '-o',
  sourceZip,
  'HEAD',
  '--',
  '.',
  ...EXCLUDED_FROM_SOURCE.map(dir => `:(exclude)${dir}`),
]);

console.log(`\nUpload to AMO:\n  ${extensionZip}\n  ${sourceZip} (source)`);
