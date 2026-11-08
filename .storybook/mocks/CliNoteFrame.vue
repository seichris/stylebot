<template>
  <textarea
    ref="field"
    v-model="draft"
    class="note-frame"
    rows="1"
    :aria-label="label"
    :placeholder="placeholder"
    @keydown.stop="onKeydown"
    @keyup.stop
    @keypress.stop
  ></textarea>
</template>

<script lang="ts">
import Vue from 'vue';

/**
 * Stands in for the note field's frame, whose extension page stories can't
 * load: the same field, in the story's own DOM.
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

  data() {
    return { draft: '' };
  },

  methods: {
    focus(): void {
      (this.$refs.field as HTMLTextAreaElement | undefined)?.focus();
    },

    onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        (event.target as HTMLElement).blur();
      } else if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();

        const text = this.draft.trim();

        if (text) {
          this.$emit('note', text);
          this.draft = '';
        }
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.note-frame {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: none;
  caret-color: var(--term-accent);
  color: var(--term-bright);
  font: inherit;
  resize: none;

  &::placeholder {
    color: var(--term-faint);
  }
}
</style>
