<template>
  <div class="note-field">
    <span class="sigil" @mousedown.prevent="focus">›</span>
    <cli-note-frame
      ref="frame"
      :label="t('note_to_your_agent')"
      :placeholder="placeholder"
      @note="$emit('note', $event)"
    />
  </div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import Vue from 'vue';

import type { PageMark } from '../state';
import CliNoteFrame from './CliNoteFrame.vue';

/**
 * Where the user writes a note to the agent about the marks on the page,
 * as a terminal prompt. Enter sends, Shift+Enter starts a new line, Esc
 * hands the keyboard back to the page. The field is framed from the
 * extension (see CliNoteFrame), so the page never gets the keys typed in it.
 * Emits `note` with the text.
 */
export default Vue.extend({
  name: 'CliNoteField',

  components: { CliNoteFrame },

  props: {
    marks: {
      type: Array as PropType<Array<PageMark>>,
      required: true,
    },
  },

  computed: {
    placeholder(): string {
      if (!this.marks.length) {
        return this.t('tell_your_agent_what_to_change');
      }

      return this.t('what_should_change_about_marks', [
        this.marks.map(({ n }) => n).join(', '),
      ]);
    },
  },

  methods: {
    focus(): void {
      (this.$refs.frame as (Vue & { focus: () => void }) | undefined)?.focus();
    },
  },
});
</script>

<style lang="scss" scoped>
.note-field {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 14px;
  cursor: text;
}

.sigil {
  flex: none;
  width: var(--term-gutter);
  text-align: center;
  color: var(--term-accent);
  font-weight: 600;
}
</style>
