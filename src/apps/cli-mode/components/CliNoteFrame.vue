<template>
  <iframe
    ref="frame"
    class="note-frame"
    :src="src"
    :title="label"
    :style="{ height: `${height}px` }"
    @load="connect"
  ></iframe>
</template>

<script lang="ts">
import Vue from 'vue';
import { getExtensionOrigin } from '@stylebot/utils';

import {
  NOTE_FIELD_HEIGHT,
  NOTE_FRAME_HANDSHAKE,
  NOTE_FRAME_PATH,
  NOTE_MAX_HEIGHT,
  createToken,
  type FromNoteFrame,
  type NoteFrameHandshake,
  type ToNoteFrame,
} from '../note/protocol';

/**
 * The note field, as an extension page in a frame. Keys typed in a field in
 * the page's own DOM reach the page's capture listeners first, whatever the
 * field does with them; in a frame from the extension's origin the page never
 * gets them. The two talk over a MessageChannel, handed to the frame with the
 * token in its url, which the page can't read. Emits `note` with the text.
 */
export default Vue.extend({
  name: 'CliNoteFrame',

  props: {
    label: {
      type: String,
      required: true,
    },

    placeholder: {
      type: String,
      required: true,
    },
  },

  data(): {
    token: string;
    port: MessagePort | null;
    ready: boolean;
    focusWhenReady: boolean;
    height: number;
  } {
    return {
      token: createToken(),
      port: null,
      ready: false,
      focusWhenReady: false,
      height: NOTE_FIELD_HEIGHT,
    };
  },

  computed: {
    src(): string {
      return `${chrome.runtime.getURL(NOTE_FRAME_PATH)}#${this.token}`;
    },
  },

  watch: {
    label: 'sendField',
    placeholder: 'sendField',
  },

  beforeDestroy() {
    this.port?.close();
  },

  methods: {
    /**
     * Hands the frame its end of a new channel each time it loads, addressed
     * to the extension's origin so it goes nowhere else.
     */
    connect(): void {
      const frame = this.$refs.frame as HTMLIFrameElement;
      const { port1, port2 } = new MessageChannel();
      const handshake: NoteFrameHandshake = {
        type: NOTE_FRAME_HANDSHAKE,
        token: this.token,
      };

      this.port?.close();
      this.port = port1;
      this.ready = false;
      port1.onmessage = ({ data }: MessageEvent<FromNoteFrame>) =>
        this.receive(data);
      frame.contentWindow?.postMessage(handshake, getExtensionOrigin(), [
        port2,
      ]);
    },

    receive(message: FromNoteFrame): void {
      switch (message?.type) {
        case 'ready':
          this.ready = true;
          this.sendField();

          if (this.focusWhenReady) {
            this.focusWhenReady = false;
            this.focus();
          }
          break;

        case 'note':
          if (typeof message.text === 'string' && message.text.trim()) {
            this.$emit('note', message.text);
          }
          break;

        case 'escape':
          (this.$refs.frame as HTMLIFrameElement).blur();
          break;

        case 'height':
          if (Number.isFinite(message.height)) {
            this.height = Math.min(
              Math.max(message.height, NOTE_FIELD_HEIGHT),
              NOTE_MAX_HEIGHT
            );
          }
          break;
      }
    },

    send(message: ToNoteFrame): void {
      this.port?.postMessage(message);
    },

    sendField(): void {
      this.send({
        type: 'field',
        label: this.label,
        placeholder: this.placeholder,
      });
    },

    /**
     * Puts the keyboard in the field, once the frame has connected.
     */
    focus(): void {
      (this.$refs.frame as HTMLIFrameElement | undefined)?.focus();

      if (this.ready) {
        this.send({ type: 'focus' });
      } else {
        this.focusWhenReady = true;
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.note-frame {
  flex: 1;
  display: block;
  min-width: 0;
  border: 0;
  background: none;
  color-scheme: dark;
}
</style>
