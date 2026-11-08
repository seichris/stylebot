import { mount } from '@vue/test-utils';

jest.mock('@stylebot/utils', () => ({
  ...jest.requireActual('@stylebot/utils'),
  isUserGesture: jest.fn(),
}));

import { isUserGesture } from '@stylebot/utils';

import TheGalleryMenuItem from './TheGalleryMenuItem.vue';

const store = (
  state: Record<string, unknown>,
  hasUnpublishedChanges = true
) => ({
  state: {
    publishing: false,
    publishedGalleryStyle: null,
    installedGalleryStyle: null,
    ...state,
  },
  getters: { hasUnpublishedChanges, hasChangesSinceInstall: true },
  dispatch: jest.fn(async () => ({ ok: true })),
});

/**
 * A person's click, as the browser marks it; jsdom marks none trusted.
 */
const asPerson = () =>
  (isUserGesture as jest.Mock).mockImplementation(() => true);

/**
 * A click the page dispatches into the panel, checked for real.
 */
const asPage = () =>
  (isUserGesture as jest.Mock).mockImplementation(
    jest.requireActual('@stylebot/utils').isUserGesture
  );

describe('Publish to Gallery in the ⋯ menu', () => {
  it('publishes on a person’s click', async () => {
    asPerson();
    const $store = store({});
    const wrapper = mount(TheGalleryMenuItem, { mocks: { $store } });

    await wrapper.find('button').trigger('click');

    expect($store.dispatch).toHaveBeenCalledWith('publishToGallery');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('ignores a click the page dispatches, so it can’t capture the page or open a draft', async () => {
    asPage();
    const $store = store({});
    const wrapper = mount(TheGalleryMenuItem, { mocks: { $store } });

    (wrapper.find('button').element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();

    expect($store.dispatch).not.toHaveBeenCalled();
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});
