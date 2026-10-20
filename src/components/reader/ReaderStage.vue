<script setup lang="ts">
/**
 * 正文舞台：当前这一页的段落 + 落在上面的划线。
 *
 * 单独成为组件的原因：选区落点（`onSelect` 里读 `[data-p]`）依赖**这里**的 DOM，
 * 而翻页/分页状态在页面层。放一起时，改分页逻辑很难看清"哪一层负责 DOM"。
 * 选区由本组件只负责**报告**「松手了」，怎么算区间仍归页面层——那里才知道段落原文。
 */
import { onMounted, ref } from 'vue';
import ParagraphText from './ParagraphText.vue';

const props = defineProps<{
  chapterTitle: string;
  paragraphs: readonly string[];
  /** 当前页的段落序号 */
  pageIndices: readonly number[];
  /** 本章全部划线（只取当前页用得到的） */
  marks: ReadonlyArray<{ id: string; paragraph: number; start: number; end: number }>;
}>();

const emit = defineEmits<{ select: []; ready: [el: HTMLElement] }>();

// 量文字容量需要真实元素尺寸，而尺寸只有挂载后才有；由本组件把元素交出去，
// 页面层不必隔着组件去猜 DOM 结构。
const root = ref<HTMLElement | null>(null);
onMounted(() => {
  if (root.value) emit('ready', root.value);
});

function marksFor(p: number): Array<{ id: string; start: number; end: number }> {
  return props.marks
    .filter((m) => m.paragraph === p)
    .map((m) => ({ id: m.id, start: m.start, end: m.end }));
}
</script>

<template>
  <main ref="root" class="page" @mouseup="emit('select')" @touchend="emit('select')">
    <h2 class="chapter-title">{{ chapterTitle }}</h2>
    <ParagraphText
      v-for="p in pageIndices"
      :key="p"
      :data-p="p"
      :text="paragraphs[p] ?? ''"
      :marks="marksFor(p)"
    />
    <p v-if="pageIndices.length === 0" class="empty-page">这一章没有正文。</p>
  </main>
</template>

<style scoped>
.page {
  flex: 1;
  overflow: auto;
  padding: 12px 16px 8px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.chapter-title {
  font-size: 1.125em;
  margin: 4px 0 14px;
  color: var(--text-primary);
}

.empty-page {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.9;
  padding: 24px 16px;
}
</style>
