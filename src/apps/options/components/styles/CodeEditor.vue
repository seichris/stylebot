<template>
  <code-editor-iframe />
</template>

<script lang="ts">
import Vue from 'vue';

import type {
  IframeMessage,
  ParentUpdateCssMessage,
} from '@stylebot/monaco-editor';
import { isFromExtensionFrame } from '@stylebot/utils';

import CodeEditorIframe from './CodeEditorIframe.vue';

export default Vue.extend({
  name: 'CodeEditor',

  components: {
    CodeEditorIframe,
  },

  props: {
    css: {
      type: String,
      required: true,
    },

    // False for a brand-new style, so the URL field (which still needs
    // filling in) keeps focus instead of the editor stealing it on load.
    autofocus: {
      type: Boolean,
      default: true,
    },
  },

  created() {
    window.addEventListener('message', this.handleMessage);
  },

  beforeDestroy() {
    window.removeEventListener('message', this.handleMessage);
  },

  methods: {
    getIframeContentWindow(): Window | null | undefined {
      return this.$el.querySelector('iframe')?.contentWindow;
    },

    /**
     * Takes messages only from this editor's own Monaco frame, so no other
     * window can put css in the style being edited.
     */
    handleMessage(event: MessageEvent<IframeMessage>): void {
      if (!isFromExtensionFrame(event, this.getIframeContentWindow())) {
        return;
      }

      const message = event.data;

      switch (message.type) {
        case 'stylebotMonacoIframeLoaded':
          this.handleIframeLoaded();
          break;

        case 'stylebotMonacoIframeCssUpdated':
          if (typeof message.css === 'string') {
            this.handleIframeCssUpdate(message.css);
          }
          break;

        case 'stylebotSavePressed':
          this.$emit('save');
          break;
      }
    },

    handleIframeLoaded(): void {
      const message: ParentUpdateCssMessage = {
        css: this.css,
        type: 'stylebotCssUpdate',
        focus: this.autofocus,
      };

      const contentWindow = this.getIframeContentWindow();

      if (!contentWindow) {
        return;
      }

      contentWindow.postMessage(message, chrome.runtime.getURL('*'));
    },

    handleIframeCssUpdate(css: string): void {
      this.$emit('update', css);
    },
  },
});
</script>
