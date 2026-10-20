<script setup lang="ts">
/**
 * 阅读器顶栏 + 设置抽屉。
 *
 * 「退出」放在最左、且只有这一个出口：阅读页是唯一一个**不显示全局导航**的页面
 * （全屏阅读），所以它必须自带一条确定能出去的路——用户第二次实测被困就是这一类。
 */
import { ref } from 'vue';
import {
  FONT_SIZES,
  LINE_HEIGHTS,
  THEMES,
  useReaderPrefs,
  type FontSize,
  type LineHeight,
  type ReaderTheme,
} from '@/composables/useReaderPrefs.js';

defineProps<{ title: string; chapterLabel: string; busy?: boolean }>();

const emit = defineEmits<{
  back: [];
  toc: [];
  marks: [];
  search: [];
}>();

const { prefs, setFontSize, setTheme, setLineHeight } = useReaderPrefs();
const open = ref(false);

function pick<T>(fn: (v: T) => void, v: T): void {
  fn(v);
}
</script>

<template>
  <header class="reader-bar">
    <button type="button" class="bar-btn" @click="emit('back')">← 书架</button>
    <div class="bar-mid">
      <span class="bar-title">{{ title }}</span>
      <span class="bar-chapter">{{ busy ? '正在打开…' : chapterLabel }}</span>
    </div>
    <div class="bar-right">
      <button type="button" class="bar-btn" @click="emit('search')">搜</button>
      <button type="button" class="bar-btn" @click="emit('toc')">目录</button>
      <button type="button" class="bar-btn" @click="emit('marks')">划线</button>
      <button type="button" class="bar-btn" :aria-expanded="open" @click="open = !open">排版</button>
    </div>
  </header>

  <div v-if="open" class="sheet">
    <div class="row">
      <span class="row-label">字号</span>
      <button
        v-for="n in FONT_SIZES"
        :key="n"
        type="button"
        class="pill"
        :class="{ on: prefs.fontSize === n }"
        @click="pick<FontSize>(setFontSize, n)"
      >{{ n }}</button>
    </div>
    <div class="row">
      <span class="row-label">行距</span>
      <button
        v-for="l in LINE_HEIGHTS"
        :key="l.value"
        type="button"
        class="pill"
        :class="{ on: prefs.lineHeight === l.value }"
        @click="pick<LineHeight>(setLineHeight, l.value)"
      >{{ l.label }}</button>
    </div>
    <div class="row">
      <span class="row-label">底色</span>
      <button
        v-for="t in THEMES"
        :key="t.value"
        type="button"
        class="pill"
        :class="{ on: prefs.theme === t.value }"
        @click="pick<ReaderTheme>(setTheme, t.value)"
      >{{ t.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.reader-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: inherit;
}

.bar-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.3;
}

.bar-title {
  font-size: 0.8125rem;
  color: var(--text-primary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-chapter {
  font-size: 0.6875rem;
  color: var(--text-muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-right {
  display: flex;
  gap: 4px;
}

.bar-btn {
  min-height: 36px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.bar-btn:hover {
  border-color: var(--border-control);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-label {
  width: 40px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.pill {
  min-height: 32px;
  min-width: 40px;
  padding: 2px 10px;
  border: 1px solid var(--border-control);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.pill.on {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
