import type {
  PseudoStateAction,
  PseudoState,
  PseudoStateResult,
} from '@stylebot/types';

import { setForcedOnTab } from './page-sheets';
import { inspectTab, requireNamed, resolveTab } from './targets';
import type { CliCommands } from './types';

/**
 * Forces a state on a tab's page, lists what's forced, or undoes it. The page
 * may have its cross-origin sheets fetched for their state rules while
 * anything is forced there.
 */
export const forceOnTab = async (
  tabId: number,
  action: PseudoStateAction
): Promise<PseudoStateResult> => {
  // Before the page copies the rules, which is part of forcing a state.
  if (action.op === 'add') {
    await setForcedOnTab(tabId, true);
  }

  const result = await inspectTab<PseudoStateResult>(tabId, {
    kind: 'force',
    action,
  });

  if (result.forced.length === 0) {
    await setForcedOnTab(tabId, false);
  }

  return result;
};

/**
 * Runs a callback with a state forced on a tab, and undoes the force after,
 * unless it was already forced before.
 */
export const withPseudoState = async <T>(
  tabId: number,
  selector: string,
  state: PseudoState,
  run: () => Promise<T>
): Promise<T> => {
  const { forced } = await forceOnTab(tabId, { op: 'list' });
  const already = forced.some(
    force => force.selector === selector && force.state === state
  );

  await forceOnTab(tabId, { op: 'add', selector, state });

  try {
    return await run();
  } finally {
    if (!already) {
      await forceOnTab(tabId, { op: 'release', selector, state });
    }
  }
};

export const pseudoStateCommands: CliCommands = {
  async force({ tab, selector, state, all, clear }) {
    requireNamed(tab, 'tab');
    const { id } = await resolveTab(tab);
    let action: PseudoStateAction;

    if (clear) {
      action = { op: 'clear' };
    } else if (selector === undefined) {
      action = { op: 'list' };
    } else if (state === undefined) {
      throw new Error(
        'Name a state: hover, active, focus, focus-visible or focus-within'
      );
    } else {
      action = {
        op: 'add',
        selector: String(selector),
        state: String(state) as PseudoState,
        all: !!all,
      };
    }

    return forceOnTab(id as number, action);
  },
};
