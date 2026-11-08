import type { ForcedPseudoState, PseudoStateResult } from '@stylebot/types';

import { setForcedOnTab } from './page-sheets';
import { forceOnTab } from './pseudo-states';
import { inspectTab } from './targets';

jest.mock('./page-sheets', () => ({ setForcedOnTab: jest.fn() }));
jest.mock('./targets', () => ({
  inspectTab: jest.fn(),
  requireNamed: jest.fn(),
  resolveTab: jest.fn(),
}));

const HOVER: ForcedPseudoState = {
  selector: '.row',
  state: 'hover',
  elements: 1,
  ancestors: 2,
};

const answer = (forced: Array<ForcedPseudoState>): PseudoStateResult => ({
  forced,
  changed: [],
  unreadable: [],
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('forceOnTab', () => {
  it("lets the page's sheets be fetched before it forces the state, which copies their rules", async () => {
    const calls: Array<string> = [];
    jest.mocked(setForcedOnTab).mockImplementation(async (_tabId, forced) => {
      calls.push(`forced ${forced}`);
    });
    jest.mocked(inspectTab).mockImplementation(async () => {
      calls.push('inspect');
      return answer([HOVER]);
    });

    await expect(
      forceOnTab(1, { op: 'add', selector: '.row', state: 'hover' })
    ).resolves.toEqual(answer([HOVER]));

    expect(calls).toEqual(['forced true', 'inspect']);
    expect(setForcedOnTab).toBeCalledWith(1, true);
  });

  it.each([{ op: 'clear' } as const, { op: 'list' } as const])(
    'stops it once nothing is forced ($op)',
    async action => {
      jest.mocked(inspectTab).mockResolvedValue(answer([]));

      await forceOnTab(1, action);

      expect(setForcedOnTab).toBeCalledTimes(1);
      expect(setForcedOnTab).toBeCalledWith(1, false);
    }
  );

  it('leaves it while a state is still forced', async () => {
    jest.mocked(inspectTab).mockResolvedValue(answer([HOVER]));

    await forceOnTab(1, { op: 'release', selector: '.icon', state: 'hover' });

    expect(setForcedOnTab).not.toBeCalled();
  });
});
