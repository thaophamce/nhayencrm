<template>
  <aside v-if="visibleSuggestion" class="ai-composer-card" aria-label="AI gợi ý chăm sóc lại">
    <div class="card-copy">
      <div class="card-label"><v-icon size="15">mdi-creation-outline</v-icon> AI gợi ý chăm sóc lại</div>
      <p>{{ visibleSuggestion.content }}</p>
    </div>
    <div class="card-actions">
      <button type="button" class="use-button" @click="useContent">Dùng tin này</button>
      <button type="button" class="hide-button" @click="hide">Ẩn</button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isAiFollowUpVisibleInComposer, useAiFollowUp } from '@/composables/use-ai-follow-up';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ use: [content: string] }>();
const followUp = useAiFollowUp();
const suggestion = computed(() => followUp.suggestions[props.conversationId]);
const visibleSuggestion = computed(() => isAiFollowUpVisibleInComposer(suggestion.value) ? suggestion.value : undefined);

function useContent(): void {
  const content = followUp.useSuggestion(props.conversationId);
  if (content) emit('use', content);
}
function hide(): void { followUp.hideComposerSuggestion(props.conversationId); }
</script>

<style scoped>
.ai-composer-card { display: flex; align-items: center; gap: 12px; margin: 8px; padding: 10px 12px; border: 1px solid #acd4f7; border-radius: 8px; background: #f3f9ff; }
.card-copy { min-width: 0; flex: 1; }
.card-label { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; color: #0866c6; font-size: 11px; font-weight: 750; text-transform: uppercase; }
.card-copy p { margin: 0; color: #26364a; font-size: 12.5px; line-height: 1.4; white-space: pre-wrap; }
.card-actions { display: flex; flex-shrink: 0; gap: 6px; }
.card-actions button { min-height: 31px; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 650; }
.use-button { border: 1px solid #0878d1; background: #0878d1; color: #fff; }
.hide-button { border: 1px solid #cbd5e1; background: #fff; color: #475569; }
@media (max-width: 640px) { .ai-composer-card { align-items: stretch; flex-direction: column; } .card-actions { justify-content: flex-end; } }
</style>
