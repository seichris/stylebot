import { mount } from '@vue/test-utils';

jest.mock('@stylebot/utils', () => ({
  ...jest.requireActual('@stylebot/utils'),
  isUserGesture: jest.fn(),
}));
jest.mock('../../utils/gallery', () => ({ getGalleryStyle: jest.fn() }));

import { isUserGesture } from '@stylebot/utils';

import TheGalleryStatus from './TheGalleryStatus.vue';

const published = {
  styleId: 1,
  version: 1,
  cssHash: 'x',
  slug: 'tokyo-night',
};

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

describe('the Gallery bar under the editor', () => {
  it('publishes changes on a person’s click, and ignores the page’s', async () => {
    const $store = store({ publishedGalleryStyle: published });
    const wrapper = mount(TheGalleryStatus, { mocks: { $store } });
    const publish = wrapper
      .findAll('button')
      .filter(button => button.text() === 'publish')
      .at(0);

    asPage();
    (publish.element as HTMLButtonElement).click();
    expect($store.dispatch).not.toHaveBeenCalledWith('publishToGallery');

    asPerson();
    await publish.trigger('click');
    expect($store.dispatch).toHaveBeenCalledWith('publishToGallery');
  });

  it('reverts to the Gallery version on a person’s click, and ignores the page’s', async () => {
    const $store = store({
      installedGalleryStyle: { id: 1, slug: 'tokyo-night', version: 1 },
    });
    const wrapper = mount(TheGalleryStatus, { mocks: { $store } });
    const revert = wrapper.find('button[aria-label="use_gallery_version"]');

    asPage();
    (revert.element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();
    expect($store.dispatch).not.toHaveBeenCalledWith('resetToGalleryVersion');

    asPerson();
    await revert.trigger('click');
    expect($store.dispatch).toHaveBeenCalledWith('resetToGalleryVersion');
  });
});
