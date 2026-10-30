<script setup lang="ts">
/**
 * 阅读页（P0-9 / P0-10 的呈现层，P0-12 的交互层）。
 *
 * 三件必须成立的事：
 *  ① 翻页是**真的翻页**（按段落分页、页码可数），不是无限滚动——滚动没法表达"读到哪"；
 *  ② 字号/行距/底色改变后，用户仍停在原段落（页码可以变，位置不能丢）；
 *  ③ 选区划线的落点是「章节 + 段落 + 段内偏移」，不依赖 DOM Range，所以换字号、
 *     换窗口、重新导入都不会把高亮画到别处。
 *
 * 本页**不显示全局导航**（全屏阅读），所以顶栏必须自带唯一的退出路径（见 ReaderBar）。
 * 正文、翻页栏、选区浮条各自成组件，这里只留"状态与顺序"。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ReaderBar from '@/components/reader/ReaderBar.vue';
import ReaderToc from '@/components/reader/ReaderToc.vue';
import ReaderMarks from '@/components/reader/ReaderMarks.vue';
import ReaderSearch from '@/components/reader/ReaderSearch.vue';
import ReaderStage from '@/components/reader/ReaderStage.vue';
import ReaderNav from '@/components/reader/ReaderNav.vue';
import ReaderMarkTip from '@/components/reader/ReaderMarkTip.vue';
import { useReaderSession } from '@/composables/useReaderSession.js';
import { useReaderPrefs } from '@/composables/useReaderPrefs.js';
import { chapterPercent, pageCapacity, pageOfParagraph, paginate } from '@/engine/paginate.js';
import { selectionSpan } from '@/lib/selection.js';

const route = useRoute();
const router = useRouter();
const bookId = computed(() => String(route.params.id ?? ''));
const { prefs } = useReaderPrefs();
const session = useReaderSession(bookId);
const { book, chapters, marks, loading, notFound } = session;

const chapterIndex = ref(0);
const pageIndex = ref(0);
const viewport = ref<HTMLElement | null>(null);
const capacity = ref(600);
const panel = ref<'none' | 'toc' | 'marks' | 'search'>('none');
const pending = ref<{ p: number; start: number; end: number; quote: string } | null>(null);
const tip = ref('');

const paragraphs = computed(() => chapters.value[chapterIndex.value]?.paragraphs ?? []);
const pages = computed(() => paginate(paragraphs.value, capacity.value));
const page = computed(() => pages.value[Math.min(pageIndex.value, pages.value.length - 1)] ?? { paragraphIndices: [] });
const chapter = computed(() => chapters.value[chapterIndex.value]);
const percent = computed(() => chapterPercent(paragraphs.value, page.value.paragraphIndices[0] ?? 0));
const atStart = computed(() => pageIndex.value === 0 && chapterIndex.value === 0);
const atEnd = computed(() => pageIndex.value === pages.value.length - 1 && chapterIndex.value === chapters.value.length - 1);

/** 本章划线 → 交给正文组件，由它按段落过滤（那里才知道哪几段在本页） */
const chapterMarks = computed(() =>
  marks.value
    .filter((m) => m.chapter === chapterIndex.value)
    .map((m) => ({ id: m.id, paragraph: m.paragraph, start: m.start, end: m.end })),
);

function measure(): void {
  const el = viewport.value;
  if (!el) return;
  capacity.value = pageCapacity(el.clientWidth - 24, el.clientHeight - 24, prefs.value.fontSize, prefs.value.lineHeight);
}

/** 换字号/行距后重新分页，并把当前段落找回到新页（页码变了，位置不丢） */
function remeasureKeepPlace(): void {
  const anchorParagraph = page.value.paragraphIndices[0] ?? 0;
  measure();
  void nextTick(() => {
    pageIndex.value = pageOfParagraph(pages.value, anchorParagraph);
  });
}

function goto(chapterTo: number, paragraph = 0): void {
  chapterIndex.value = Math.min(Math.max(chapterTo, 0), Math.max(0, chapters.value.length - 1));
  pageIndex.value = pageOfParagraph(pages.value, paragraph);
  panel.value = 'none';
  viewport.value?.scrollTo({ top: 0 });
}

function nextPage(): void {
  if (pageIndex.value < pages.value.length - 1) pageIndex.value += 1;
  else if (chapterIndex.value < chapters.value.length - 1) goto(chapterIndex.value + 1);
}

function prevPage(): void {
  if (pageIndex.value > 0) pageIndex.value -= 1;
  else if (chapterIndex.value > 0) {
    chapterIndex.value -= 1;
    void nextTick(() => {
      pageIndex.value = Math.max(0, pages.value.length - 1);
    });
  }
}

/** 选区落点：只接受"同一段内"的选择，跨段会被明确拒绝而不是悄悄截断 */
function onSelect(): void {
  const sel = window.getSelection();
  pending.value = null;
  tip.value = '';
  if (!sel || sel.isCollapsed) return;
  const anchor = sel.anchorNode;
  const el = (anchor?.nodeType === 3 ? anchor.parentElement : (anchor as HTMLElement | null))?.closest('[data-p]');
  if (!el) return;
  const p = Number(el.getAttribute('data-p'));
  const text = paragraphs.value[p];
  if (!text) return;
  // 用 Range 算真实偏移，不用 indexOf：同一段里重复出现的句子，
  // indexOf 永远给第一处，划第二处会静默落到第一处
  const span = selectionSpan(el, text);
  if (span === null) {
    tip.value = '一次只能划同一段里的文字。跨段请分两次划。';
    return;
  }
  pending.value = { p, ...span };
}

async function createMark(): Promise<void> {
  const pd = pending.value;
  if (!pd) return;
  const created = await session.addMark(chapterIndex.value, pd.p, paragraphs.value[pd.p] ?? '', pd.start, pd.end);
  pending.value = null;
  window.getSelection()?.removeAllRanges();
  tip.value = created ? '已划线。可以在「划线」里加笔记。' : '没能记下这段，再试一次。';
}

function dismissTip(): void {
  pending.value = null;
  window.getSelection()?.removeAllRanges();
}

function onKey(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault();
    nextPage();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    prevPage();
  } else if (e.key === 'Escape') {
    panel.value = 'none';
    pending.value = null;
  }
}

function onVisibility(): void {
  if (document.hidden) {
    // 契约里的 close 事件要求「立即落库」。只 pauseClock 是不够的：
    // 关标签页时 unmount 里的异步写常常还没提交就被页面卸载掐断，
    // 症状就是「最后读的那几页没记住」。切走时就写，不赌卸载时机。
    flushProgress();
    session.pauseClock();
  } else session.resumeClock();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function flushProgress(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (loading.value || chapters.value.length === 0) return;
  const first = page.value.paragraphIndices[0] ?? 0;
  void session.saveProgress(chapterIndex.value, first, percent.value, chapters.value.length);
}

watch([chapterIndex, pageIndex], () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushProgress, 500);
});

watch(
  () => [prefs.value.fontSize, prefs.value.lineHeight] as const,
  () => remeasureKeepPlace(),
);

onMounted(async () => {
  await session.load();
  if (!notFound.value) {
    chapterIndex.value = session.startChapter.value;
    await nextTick();
    measure();
    // 续读：进度记的是"章节 + 字符偏移"，换算成段落才找得到页
    pageIndex.value = pageOfParagraph(pages.value, session.startParagraph.value);
  }
  session.resumeClock();
  window.addEventListener('resize', remeasureKeepPlace);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pagehide', flushProgress);
  document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', remeasureKeepPlace);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('pagehide', flushProgress);
  document.removeEventListener('visibilitychange', onVisibility);
  session.pauseClock();
  flushProgress();
});

const themeClass = computed(() => `theme-${prefs.value.theme}`);
</script>

<template>
  <div class="reader" :class="themeClass" :style="{ fontSize: `${prefs.fontSize}px`, lineHeight: String(prefs.lineHeight) }">
    <ReaderBar
      :title="book?.title ?? '打开中'"
      :chapter-label="chapter?.title ?? ''"
      :busy="loading"
      @back="router.push('/library')"
      @toc="panel = panel === 'toc' ? 'none' : 'toc'"
      @marks="panel = panel === 'marks' ? 'none' : 'marks'"
      @search="panel = panel === 'search' ? 'none' : 'search'"
    />

    <ReaderToc
      v-if="panel === 'toc'"
      :items="chapters.map((c) => ({ title: c.title, paragraphs: c.paragraphs.length }))"
      :current="chapterIndex"
      @select="goto"
      @close="panel = 'none'"
    />

    <ReaderMarks
      v-if="panel === 'marks'"
      :entries="marks.map((m) => ({ id: m.id, quote: m.quote, chapterLabel: m.chapterLabel, note: m.note, warning: m.warning }))"
      @close="panel = 'none'"
      @goto="(id) => { const m = marks.find((x) => x.id === id); if (m) goto(m.chapter, m.paragraph); }"
      @remove="(id) => void session.removeMark(id)"
      @save-note="(p) => void session.saveNote(p.id, p.body)"
    />

    <ReaderSearch v-if="panel === 'search'" :chapters="chapters" @close="panel = 'none'" @goto="(h) => goto(h.chapter, h.paragraph)" />

    <p v-if="notFound" class="missing">
      这本书不在本机。可能已经删掉，或者是在另一个浏览器里导入的（本站没有云端同步）。
      <a href="#/library">回到书架</a>
    </p>

    <ReaderStage
      v-else
      :chapter-title="chapter?.title ?? ''"
      :paragraphs="paragraphs"
      :page-indices="page.paragraphIndices"
      :marks="chapterMarks"
      @ready="(el) => (viewport = el)"
      @select="onSelect"
    />

    <ReaderMarkTip v-if="pending" :quote="pending.quote" @apply="createMark" @dismiss="dismissTip" />
    <p v-else-if="tip" class="tip-line">{{ tip }}</p>

    <ReaderNav
      :page-no="pageIndex + 1"
      :page-count="pages.length"
      :percent="percent"
      :at-start="atStart"
      :at-end="atEnd"
      @prev="prevPage"
      @next="nextPage"
    />
  </div>
</template>

<style scoped>
.reader {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-raised);
  color: var(--text-primary);
}

.theme-sepia {
  background: var(--surface-sunken);
}

.theme-dark {
  background: var(--reader-dark-bg);
  color: var(--reader-dark-fg);
}

.missing {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.9;
  padding: 24px 16px;
}

.tip-line {
  margin: 0;
  padding: 6px 16px;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
}
</style>
