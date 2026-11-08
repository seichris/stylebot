/**
 * CLI mode's note field, framed in the terminal so the page it's on never
 * gets the keys typed in it. Talks to the terminal only over the channel the
 * terminal hands it (see frame.ts).
 */
import { t } from '@stylebot/i18n';

import { acceptTerminal } from './frame';
import './note.scss';

document.documentElement.lang = t('language_code');

window.addEventListener(
  'message',
  acceptTerminal(document.body, window.location.hash.slice(1))
);
