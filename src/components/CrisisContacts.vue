<script setup lang="ts">
/**
 * 可拨打的号码。
 *
 * 抽成组件是因为 `/crisis` 页与结果页的危机面板共用同一份数据，两处各写一遍
 * `v-for` 迟早会有一处忘了加 `tel:`——而漏掉的那一处，可能正是用户正在看的那页。
 *
 * 字号、字重全交给父级继承：这里只负责「能不能点」。
 * 下划线是**常驻**的，不像别处链接只在 hover 时出现——这一页不该要求人先发现
 * 它可以点，再决定去点。
 */
import { computed } from 'vue';
import { telNumbers } from '@/data/crisis.js';
import type { CrisisResource } from '@/data/crisis.js';

const props = defineProps<{ resource: CrisisResource }>();
const nums = computed(() => telNumbers(props.resource));
</script>

<template>
  <span v-if="nums.length === 0">{{ resource.contact }}</span>
  <span v-else>
    <template v-for="(t, i) in nums" :key="t">
      <span v-if="i > 0" class="sep"> / </span>
      <a class="tel" :href="`tel:${t}`">{{ t }}</a>
    </template>
  </span>
</template>

<style scoped>
.tel {
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

.sep {
  color: var(--text-muted);
}
</style>
