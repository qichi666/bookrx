<script setup lang="ts">
/**
 * 首页通用搜索栏（M1a-S + 书目层）。
 *
 * 一个框、自动分流、不做模式切换：
 * ① 核心库命中 → 就地列书结果（打过分的，但不显示档位）+ 「按你的问题推荐」切换；
 * ② 外围书库命中 → 单独一段「未入库」，只有书名/作者，点开去豆瓣（不参与打分）；
 * ③ 0 书命中且问题命中标签 → 直接跳结果页（与问卷路径同一套引擎）；
 * ④ 全 0 → 路径 C 外链（豆瓣 / 微信读书 / OpenLibrary）+ 问卷兜底。
 *
 * 搜索是只读浏览：合成诊断带 `dxs:` 前缀，本地计数跳过。
 * 外围书库只从本站加载，加载失败静默降级（只搜核心库）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { CandidateBook } from '@/data/candidates.js';
import { loadCandidateBooks, loadCandidateIndex } from '@/data/candidates.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { saveDiagnosis } from '@/engine/session.js';
import { searchBooks, searchCandidates, searchQuestion, type BookHit } from '@/engine/search.js';
import OuterResults from '@/components/OuterResults.vue';

const router = useRouter();

const query = ref('');
const bookHits = ref<BookHit[]>([]);
const candidateHits = ref<CandidateBook[]>([]);
const questionDiagnosis = ref<Diagnosis | null>(null);
const searched = ref(false);
const lastQuery = ref('');
const hasOuter = ref(false);
const outerLoading = ref(false);

const noResult = computed(
  () =>
    searched.value &&
    bookHits.value.length === 0 &&
    candidateHits.value.length === 0 &&
    questionDiagnosis.value === null &&
    !outerLoading.value,
);

const doubanHref = computed(
  () => `https://www.douban.com/search?cat=1001&q=${encodeURIComponent(lastQuery.value)}`,
);
const wereadHref = computed(
  () => `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(lastQuery.value)}`,
);
const openlibraryHref = computed(
  () => `https://openlibrary.org/search?q=${encodeURIComponent(lastQuery.value)}`,
);

function bookWeread(title: string): string {
  return `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(title)}`;
}

function bookDouban(title: string): string {
  return `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(title)}`;
}

onMounted(async () => {
  hasOuter.value = (await loadCandidateIndex()) !== null;
});

async function outerSearch(q: string): Promise<void> {
  candidateHits.value = [];
  // 不依赖 onMounted 的预取：索引 promise 有缓存，这里等一次即可（避免"手快过预取"）
  hasOuter.value = (await loadCandidateIndex()) !== null;
  if (!hasOuter.value) return;
  outerLoading.value = true;
  try {
    const books = await loadCandidateBooks();
    if (!books) return;
    const inCore = new Set(bookHits.value.map((h) => h.book.title.replace(/\s+/g, '')));
    candidateHits.value = searchCandidates(q, books).filter(
      (c) => !inCore.has(c.title.replace(/\s+/g, '')),
    );
  } finally {
    outerLoading.value = false;
  }
}

async function submit(): Promise<void> {
  const q = query.value.trim();
  lastQuery.value = q;
  searched.value = q.length > 0;
  bookHits.value = searchBooks(q, SEED_BOOKS);
  questionDiagnosis.value = searchQuestion(q);
  await outerSearch(q);
  // 核心库与外围库都没有书，但问句命中困境 → 直接跳结果页
  if (
    bookHits.value.length === 0 &&
    candidateHits.value.length === 0 &&
    questionDiagnosis.value !== null
  ) {
    goQuestion();
  }
}

function goQuestion(): void {
  if (!questionDiagnosis.value) return;
  saveDiagnosis(questionDiagnosis.value);
  void router.push('/result');
}
</script>

<template>
  <section class="search">
    <form class="search-bar" @submit.prevent="submit">
      <input
        v-model="query"
        class="search-input"
        type="search"
        placeholder="搜书名 / 作者，或直接描述你的问题"
        aria-label="搜索书籍或描述你的问题"
      />
      <button type="submit" class="btn-primary">搜一下</button>
    </form>

    <template v-if="bookHits.length > 0">
      <h3 class="search-title">找到了这些书</h3>
      <article v-for="h in bookHits" :key="h.book.book_id" class="search-hit">
        <div class="hit-head">
          <h4 class="hit-name">{{ h.book.title }}</h4>
          <span class="hit-author">{{ h.book.author_display.join(' / ') }}</span>
        </div>
        <p class="hit-what">{{ h.book.one_line_what }}</p>
        <div class="hit-links">
          <a :href="bookWeread(h.book.title)" target="_blank" rel="noopener noreferrer">微信读书</a>
          <a :href="bookDouban(h.book.title)" target="_blank" rel="noopener noreferrer">豆瓣</a>
        </div>
      </article>
      <button v-if="questionDiagnosis" type="button" class="btn-ghost" @click="goQuestion">
        想按你的问题推荐？点这里
      </button>
    </template>

    <OuterResults :hits="candidateHits" :loading="outerLoading" />

    <div v-if="noResult" class="search-empty">
      <p class="empty-lead">库里没找到和「{{ lastQuery }}」相关的书。</p>
      <p class="empty-links">
        去外面找找：
        <a :href="doubanHref" target="_blank" rel="noopener noreferrer">豆瓣</a> ·
        <a :href="wereadHref" target="_blank" rel="noopener noreferrer">微信读书</a> ·
        <a :href="openlibraryHref" target="_blank" rel="noopener noreferrer">OpenLibrary</a>
      </p>
      <p class="empty-quiz">或者回答下面 4 个小问题，我们对你的处境来推荐。</p>
    </div>
  </section>
</template>

<style scoped>
.search {
  margin-bottom: 24px;
}

.search-bar {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
}

.search-title {
  font-size: 1rem;
  margin: 16px 0 8px;
}

.search-hit {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 8px;
}

.hit-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.hit-name {
  font-size: 0.9375rem;
  margin: 0;
}

.hit-author {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.hit-what {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 6px 0;
}

.hit-links {
  display: flex;
  gap: 16px;
}

.hit-links a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.hit-links a:hover {
  text-decoration: underline;
}

.search-empty {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-top: 12px;
}

.empty-lead {
  margin: 0 0 8px;
}

.empty-links,
.empty-quiz {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0 0 6px;
}

.empty-links a {
  color: var(--accent);
  text-decoration: none;
}

.btn-primary {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  cursor: pointer;
}

.btn-ghost {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
</style>
