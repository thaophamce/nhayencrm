<template>
  <section class="executive-module" :class="[`tone-${module.tone}`, `health-${module.health}`]">
    <header class="executive-module__head">
      <div class="executive-module__identity">
        <span class="executive-module__icon" aria-hidden="true">
          <v-icon :icon="module.icon" size="21" />
        </span>
        <div>
          <h2>{{ module.title }}</h2>
          <p>{{ module.subtitle }}</p>
        </div>
      </div>
      <span class="executive-health">
        <i aria-hidden="true"></i>
        {{ module.healthLabel }}
      </span>
    </header>

    <div v-if="module.loading" class="executive-module__loading" aria-busy="true" :aria-label="`Đang tải ${module.title}`">
      <span></span><span></span><span></span>
    </div>

    <div v-else-if="module.error" class="executive-module__error" role="status">
      <v-icon icon="mdi-cloud-alert-outline" size="24" />
      <div>
        <strong>Chưa lấy được dữ liệu</strong>
        <span>{{ module.error }}</span>
      </div>
    </div>

    <template v-else>
      <div class="executive-module__primary">
        <div>
          <span>{{ module.primaryLabel }}</span>
          <strong>{{ module.primaryValue }}</strong>
          <small>{{ module.primaryNote }}</small>
        </div>
        <div v-if="module.progress !== undefined" class="executive-module__ring" :style="{ '--module-progress': `${module.progress}%` }">
          <span>{{ module.progress }}%</span>
        </div>
      </div>

      <div class="executive-module__metrics">
        <div v-for="metric in module.metrics" :key="metric.label">
          <span>{{ metric.label }}</span>
          <strong :class="metric.tone ? `text-${metric.tone}` : ''">{{ metric.value }}</strong>
        </div>
      </div>
    </template>

    <button class="executive-module__link" type="button" @click="$emit('open', module.route)">
      Mở {{ module.title.toLowerCase() }}
      <v-icon icon="mdi-arrow-right" size="17" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import type { ExecutiveModule } from './types';

defineProps<{ module: ExecutiveModule }>();
defineEmits<{ open: [route: string] }>();
</script>
