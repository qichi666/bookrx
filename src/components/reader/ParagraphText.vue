<script setup lang="ts">
/**
 * 一段正文 + 落在它上面的划线。
 *
 * 高亮不存 DOM Range（换版式就失效），而是每次渲染时按「段内偏移」重新切分文本。
 * 所以这个组件是标注系统的**唯一渲染口径**：偏移对了就有高亮，错了就没有，
 * 不存在"DOM 里还留着一段死掉的高亮"这种状态。
 *
 * 重叠标注按起点排序后裁剪：先到的先着色，后来的从它结尾处接上。
 * 不做多色（契约明确禁止色相字段），重叠只是同一种底色接续。
 */
import { computed } from 'vue';

const props = defineProps<{
  text: string;
  marks: ReadonlyArray<{ id: string; start: number; end: number }>;
  activeId?: string;
}>();

const parts = computed(() => {
  const sorted = props.marks
    .filter((m) => m.end > m.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; id?: string }> = [];
  let at = 0;
  for (const m of sorted) {
    const s = Math.max(at, Math.min(m.start, props.text.length));
    const e = Math.max(s, Math.min(m.end, props.text.length));
    if (s > at) out.push({ text: props.text.slice(at, s) });
    if (e > s) out.push({ text: props.text.slice(s, e), id: m.id });
    at = Math.max(at, e);
  }
  if (at < props.text.length) out.push({ text: props.text.slice(at) });
  return out;
});
</script>

<template>
  <p class="para">
    <template v-for="(part, i) in parts" :key="i">
      <mark
        v-if="part.id"
        class="mark"
        :class="{ active: part.id === activeId }"
        :data-annotation="part.id"
      >{{ part.text }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </p>
</template>

<style scoped>
.para {
  margin: 0 0 1.1em;
  text-indent: 2em;
  line-height: inherit;
}

.mark {
  background: var(--inline-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
  cursor: pointer;
}

.mark.active {
  outline: 1px solid var(--accent);
}
</style>
