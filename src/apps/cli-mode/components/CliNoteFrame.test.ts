import { mount } from '@vue/test-utils';

import { NOTE_FRAME_HANDSHAKE } from '../note/protocol';
import CliNoteField from './CliNoteField.vue';
import CliNoteFrame from './CliNoteFrame.vue';

type FakePort = {
  postMessage: jest.Mock;
  close: jest.Mock;
  onmessage: ((event: { data: unknown }) => void) | null;
};

let channels: Array<{ port1: FakePort; port2: FakePort }>;

const fakePort = (): FakePort => ({
  postMessage: jest.fn(),
  close: jest.fn(),
  onmessage: null,
});

beforeEach(() => {
  channels = [];
  global.chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://stylebot/${path}`,
    },
  } as unknown as typeof chrome;
  (global as unknown as { MessageChannel: unknown }).MessageChannel = jest.fn(
    () => {
      const channel = { port1: fakePort(), port2: fakePort() };
      channels.push(channel);
      return channel;
    }
  );
});

const mountFrame = (placeholder = 'tell your agent') =>
  mount(CliNoteFrame, {
    propsData: { label: 'Note to your agent', placeholder },
    attachTo: document.body,
  });

/**
 * Loads the frame, with its window's postMessage recorded.
 */
const load = (wrapper: ReturnType<typeof mountFrame>) => {
  const frame = wrapper.find('iframe').element as HTMLIFrameElement;
  const postMessage = jest.fn();

  Object.defineProperty(frame, 'contentWindow', {
    value: { postMessage },
    configurable: true,
  });
  wrapper.find('iframe').trigger('load');

  const [{ port1, port2 }] = channels.slice(-1);
  const fromFrame = (data: unknown) => port1.onmessage?.({ data });

  return { frame, postMessage, port1, port2, fromFrame };
};

describe('CliNoteFrame', () => {
  it('frames the note page from the extension, with a random token only it is told', () => {
    const first = mountFrame();
    const second = mountFrame();
    const src = first.find('iframe').attributes('src') ?? '';
    const [page, token] = src.split('#');

    expect(page).toBe('chrome-extension://stylebot/cli-mode/note/index.html');
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(second.find('iframe').attributes('src')).not.toBe(src);
    expect(first.find('iframe').attributes('title')).toBe('Note to your agent');

    first.destroy();
    second.destroy();
  });

  it("hands the frame its end of a channel, with its token, addressed to the extension's origin", () => {
    const wrapper = mountFrame();
    const token = (wrapper.find('iframe').attributes('src') ?? '').split(
      '#'
    )[1];
    const { postMessage, port2 } = load(wrapper);

    expect(postMessage).toHaveBeenCalledWith(
      { type: NOTE_FRAME_HANDSHAKE, token },
      'chrome-extension://stylebot',
      [port2]
    );

    wrapper.destroy();
  });

  it('sends the label and placeholder once the frame is ready, and again as they change', async () => {
    const wrapper = mountFrame();
    const { port1, fromFrame } = load(wrapper);

    fromFrame({ type: 'ready' });
    expect(port1.postMessage).toHaveBeenLastCalledWith({
      type: 'field',
      label: 'Note to your agent',
      placeholder: 'tell your agent',
    });

    await wrapper.setProps({ placeholder: 'what should change about 1?' });
    expect(port1.postMessage).toHaveBeenLastCalledWith({
      type: 'field',
      label: 'Note to your agent',
      placeholder: 'what should change about 1?',
    });

    wrapper.destroy();
  });

  it('emits the notes the frame sends, and nothing for one that is empty or not text', () => {
    const wrapper = mountFrame();
    const { fromFrame } = load(wrapper);

    fromFrame({ type: 'note', text: 'make it blue' });
    fromFrame({ type: 'note', text: '   ' });
    fromFrame({ type: 'note', text: 42 });

    expect(wrapper.emitted('note')).toEqual([['make it blue']]);

    wrapper.destroy();
  });

  it('puts the keyboard in the field once the frame is ready', () => {
    const wrapper = mountFrame();
    const { frame, port1, fromFrame } = load(wrapper);
    const focus = jest.spyOn(frame, 'focus');

    (wrapper.vm as unknown as { focus: () => void }).focus();
    expect(port1.postMessage).not.toHaveBeenCalledWith({ type: 'focus' });

    fromFrame({ type: 'ready' });

    expect(focus).toHaveBeenCalled();
    expect(port1.postMessage).toHaveBeenCalledWith({ type: 'focus' });

    wrapper.destroy();
  });

  it('hands the keyboard back to the page on Esc in the frame', () => {
    const wrapper = mountFrame();
    const { frame, fromFrame } = load(wrapper);
    const blur = jest.spyOn(frame, 'blur');

    fromFrame({ type: 'escape' });

    expect(blur).toHaveBeenCalled();

    wrapper.destroy();
  });

  it('grows with the field, within one line and the most it may take', async () => {
    const wrapper = mountFrame();
    const { frame, fromFrame } = load(wrapper);

    fromFrame({ type: 'height', height: 54 });
    await wrapper.vm.$nextTick();
    expect(frame.style.height).toBe('54px');

    fromFrame({ type: 'height', height: 4000 });
    await wrapper.vm.$nextTick();
    expect(frame.style.height).toBe('120px');

    fromFrame({ type: 'height', height: -5 });
    await wrapper.vm.$nextTick();
    expect(frame.style.height).toBe('18px');

    wrapper.destroy();
  });

  it('closes its channel when it goes', () => {
    const wrapper = mountFrame();
    const { port1 } = load(wrapper);

    wrapper.destroy();

    expect(port1.close).toHaveBeenCalled();
  });
});

describe('CliNoteField', () => {
  it("leaves no field in the page's DOM for the page to listen to, only the frame", () => {
    const wrapper = mount(CliNoteField, {
      propsData: { marks: [{ n: 1 }, { n: 3 }] },
    });

    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('iframe').exists()).toBe(true);
    expect(wrapper.findComponent(CliNoteFrame).props('placeholder')).toBe(
      'what_should_change_about_marks'
    );

    wrapper.destroy();
  });
});
