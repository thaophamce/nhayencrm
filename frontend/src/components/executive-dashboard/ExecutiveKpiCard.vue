<template>
  <button class="executive-kpi" :class="`tone-${item.tone}`" type="button" @click="$emit('open', item.route)">
    <span class="executive-kpi__icon" aria-hidden="true">
      <v-icon :icon="item.icon" size="20" />
    </span>
    <span class="executive-kpi__copy">
      <span class="executive-kpi__label">{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <span class="executive-kpi__note">{{ item.note }}</span>
    </span>
    <v-icon class="executive-kpi__arrow" icon="mdi-arrow-top-right" size="17" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import type { ExecutiveKpi } from './types';

defineProps<{ item: ExecutiveKpi }>();
defineEmits<{ open: [route: string] }>();
</script>
