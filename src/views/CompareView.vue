<script setup lang="ts">
/**
 * 书籍对比（F9）。
 *
 * 为什么值得单独一屏：核心库难度分布 1:10 / 2:31 / 3:17 / 4:9 / 5:1、时长 1.5–20 小时，
 * **差异度本来就很大**，但界面上一直是单本视图，用户感知不到这些差异，
 * 于是"两本都想读"只能靠猜。竞品里也没有产品做「按我的处境对比两本书」——
 * StoryGraph 能对比的是"我的两段时间"，不是"哪本更适合我"。
 *
 * 对比维度全部来自已有的 34 项人工标注，不需要新数据：
 * 难度 / 篇幅 / 时长 / 品类 / 能不能拿到 / 能接住哪些处境（含交集）。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { Book } from '@/contracts/book.js';
import type { ProblemDomain } from '@/contracts/enums.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, LENGTH_LABEL } from '@/data/book-labels.js';
import { availabilityOf } from '@/data/availability.js';
import { DOMAIN_OPTIONS, TAG_OPTIONS } from '@/data/quiz.js';

const route = useRoute();

/** 标签 id → 人话。与问卷同一份措辞，不在这一页另造一套说法 */
const TAG_LABEL = new Map<string, string>();
for (const d of DOMAIN_OPTIONS) {
  for (const o of TAG_OPTIONS[d.domain as ProblemDomain]) TAG_LABEL.set(o.tag, o.label);
}
const tagText = (t: string): string => TAG_LABEL.get(t) ?? t;

const ids = computed(() =>
  ['a', 'b', 'c']
    .map((k) => route.query[k])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, 3),
);

const books = computed<Book[]>(() =>
  ids.value
    .map((id) => SEED_BOOKS.find((b) => b.book_id === id))
    .filter((b): b is Book => b !== undefined),
);

const tagSets = computed(() => books.value.map((b) => new Set((b.problem_tags ?? []).map((t) => t.tag))));

/** 几本都能接住的处境 = 交集。这是对比里唯一"算出来"的信息，其余都是并列事实。 */
const sharedTags = computed(() => {
  if (tagSets.value.length < 2) return [];
  return [...tagSets.value[0]!].filter((t) => tagSets.value.every((s) => s.has(t)));
});

/** 只在其中一本出现、别的没有的标签：用来回答"那我该选哪个" */
function uniqueTags(i: number): string[] {
  return [...tagSets.value[i]!].filter((t) => tagSets.value.every((s, j) => j === i || !s.has(t)));
}

const rows = computed(() => [
  { label: '作者', pick: (b: Book) => b.author_display.join(' / ') },
  { label: '难度', pick: (b: Book) => `${b.difficulty} · ${DIFFICULTY_LABEL[b.difficulty] ?? ''}` },
  { label: '篇幅', pick: (b: Book) => LENGTH_LABEL[b.length_class] ?? '未标注' },
  { label: '预计时长', pick: (b: Book) => `约 ${b.est_reading_hours} 小时` },
  { label: '品类', pick: (b: Book) => CATEGORY_LABEL[b.category_l1] ?? b.category_l1 },
  { label: '能不能拿到', pick: (b: Book) => availabilityOf(b).label },
  { label: '它怎么讲', pick: (b: Book) => b.structure_note },
]);
</script>

<template>
  <section class="cmp">
    <header class="cmp-head">
      <h1 class="cmp-title">并排看这几本</h1>
      <p class="cmp-sub">
        同一行是同一件事。差异大的那几行，就是你要做选择的地方。
      </p>
    </header>

    <p v-if="books.length < 2" class="cmp-empty">
      至少要选两本才能比。回到
      <router-link to="/books">书库</router-link>
      勾选，或者在下面重新挑一本。
    </p>

    <template v-else>
      <div class="cmp-scroll">
        <table class="cmp-table">
          <thead>
            <tr>
              <th scope="col" class="cmp-corner">比什么</th>
              <th v-for="b in books" :key="b.book_id" scope="col">
                <router-link class="cmp-book" :to="`/book/${b.book_id}`">{{ b.title }}</router-link>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.label">
              <th scope="row">{{ r.label }}</th>
              <td v-for="b in books" :key="b.book_id">{{ r.pick(b) }}</td>
            </tr>
            <tr>
              <th scope="row">共同能接住</th>
              <td v-for="(b, i) in books" :key="b.book_id">
                <template v-if="i === 0">
                  <span v-if="sharedTags.length === 0" class="cmp-none">没有共同标签</span>
                  <span v-else class="cmp-tags">
                    <span v-for="t in sharedTags" :key="t" class="cmp-tag">{{ tagText(t) }}</span>
                  </span>
                </template>
                <span v-else class="cmp-ditto">同上</span>
              </td>
            </tr>
            <tr>
              <th scope="row">只有它有</th>
              <td v-for="(b, i) in books" :key="b.book_id">
                <span v-if="uniqueTags(i).length === 0" class="cmp-none">—</span>
                <span v-else class="cmp-tags">
                  <span v-for="t in uniqueTags(i)" :key="t" class="cmp-tag">{{ tagText(t) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="cmp-note">
        标签是书的标注原文，不是对你的判断。共同标签越多，说明这几本在"接住哪件事"上越接近，
        差别就落在难度和时长上。
      </p>

      <footer class="cmp-foot">
        <router-link to="/books">回书库再挑</router-link>
        <router-link to="/result">看我现在的推荐</router-link>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.cmp {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 0 40px;
}

.cmp-title {
  font-family: var(--font-book);
  font-size: 1.5rem;
  margin: 4px 0 8px;
}

.cmp-sub {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.cmp-empty {
  margin-top: 20px;
  font-size: 0.875rem;
  line-height: 1.9;
  color: var(--text-secondary);
}

.cmp-empty a {
  color: var(--accent);
}

/* 三列并排在 375px 必然放不下：容器内横向滚动，页面本身不横向溢出 */
.cmp-scroll {
  margin-top: 18px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.cmp-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 420px;
  font-size: 0.8125rem;
}

.cmp-table th,
.cmp-table td {
  text-align: left;
  vertical-align: top;
  padding: 10px 12px 10px 0;
  border-bottom: 1px solid var(--border-soft);
}

.cmp-table thead th {
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

.cmp-table tbody th {
  width: 88px;
  color: var(--text-muted);
  font-weight: 400;
  white-space: nowrap;
}

.cmp-table td {
  color: var(--text-primary);
  line-height: 1.65;
}

.cmp-corner {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.6875rem;
}

.cmp-book {
  font-family: var(--font-book);
  font-size: 0.9375rem;
  color: var(--text-primary);
  text-decoration: none;
}

.cmp-book:hover {
  color: var(--accent);
}

.cmp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cmp-tag {
  font-size: 0.6875rem;
  padding: 1px 6px;
  border: 1px solid var(--border-control);
  border-radius: 4px;
  color: var(--text-secondary);
}

.cmp-none,
.cmp-ditto {
  color: var(--text-disabled);
  font-size: 0.75rem;
}

.cmp-note {
  margin: 14px 0 0;
  font-size: 0.6875rem;
  line-height: 1.8;
  color: var(--text-muted);
}

.cmp-foot {
  display: flex;
  gap: 16px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 0.8125rem;
}

.cmp-foot a {
  color: var(--accent);
  text-decoration: none;
}
</style>
