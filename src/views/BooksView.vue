<script setup lang="ts">
/**
 * 书库（F3）：把 68 本核心书变成**可以逛的东西**。
 *
 * 之前这一屏不存在：`/booklist` 其实是「导入别人的书单」，推荐书单只在结果页里出现，
 * 所以没答过问卷的人在结构上根本无法"先看看你有什么书"。
 * 而所有做「处方/书单」的成熟产品（英国 Reading Well、StoryGraph 的主题书单）
 * 都把书单目录当一级入口——用户是先选书单，再挑书。
 *
 * 三条实现约束：
 *  ① **无诊断也要能渲染全量**：默认按 `book_id` 升序，且**不显示档位**
 *     ——"强匹配"是相对某个诊断的结论，没有诊断时说不出口；
 *  ② 筛选状态写进 URL query，可刷新保持、可分享；用 `replace` 写回，不往浏览器
 *    历史里塞一串"每改一次筛选多一条"的记录（否则后退键要按十几次才离得开）；
 *  ③ 筛选只影响浏览，**绝不回写推荐排序**。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { DOMAIN_OPTIONS, TAG_OPTIONS } from '@/data/quiz.js';
import { availabilityOf } from '@/data/availability.js';
import CatalogCard from '@/components/catalog/CatalogCard.vue';

const route = useRoute();
const router = useRouter();

/** 标签 id → 人话。问卷与书库共用同一份措辞，不另写一张表 */
const TAG_LABEL = new Map<string, string>();
for (const d of DOMAIN_OPTIONS) {
  for (const o of TAG_OPTIONS[d.domain as ProblemDomain]) TAG_LABEL.set(o.tag, o.label);
}

/** 只列出**库里真的有的**标签，避免下拉里一半是选了没结果的空选项 */
const tagsInLibrary = computed(() => {
  const seen = new Set<string>();
  for (const b of SEED_BOOKS) for (const t of b.problem_tags ?? []) seen.add(t.tag);
  return [...seen]
    .map((t) => ({ value: t, label: TAG_LABEL.get(t) ?? t }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
});

/** 时长分桶。必须定义在 applyQuery 之前：下面那个 watch 是 immediate，会立刻用到它 */
const HOUR_BUCKETS: Record<string, (h: number) => boolean> = {
  short: (h) => h <= 3,
  mid: (h) => h > 3 && h <= 8,
  long: (h) => h > 8,
};
const AVAIL_TONES = new Set(['inline', 'byo', 'external']);
const SORTS = new Set(['default', 'hours', 'difficulty']);

const tag = ref('');
const diff = ref('');
const hours = ref('');
const avail = ref('');
const sort = ref('default');

/**
 * 只接受**合法**的 query 值。
 *
 * 照单全收会有两种坏结果：`?diff=abc` 把每本书都过滤掉（看起来像"书库空了"），
 * `?hours=xxx` 因为查不到桶而静默不过滤（看起来像"筛选点了没反应"）。
 * 非法值一律退回"未筛选"，与手改网址之前的状态一致。
 */
function applyQuery(): void {
  const q = route.query;
  const one = (v: unknown): string => (typeof v === 'string' ? v : '');

  const t = one(q.tag);
  tag.value = tagsInLibrary.value.some((x) => x.value === t) ? t : '';

  const d = one(q.diff);
  diff.value = /^[1-5]$/.test(d) ? d : '';

  const h = one(q.hours);
  hours.value = Object.prototype.hasOwnProperty.call(HOUR_BUCKETS, h) ? h : '';

  const a = one(q.avail);
  avail.value = AVAIL_TONES.has(a) ? a : '';

  const s = one(q.sort);
  sort.value = SORTS.has(s) ? s : 'default';
}

function pushQuery(): void {
  const query: Record<string, string> = {};
  if (tag.value) query.tag = tag.value;
  if (diff.value) query.diff = diff.value;
  if (hours.value) query.hours = hours.value;
  if (avail.value) query.avail = avail.value;
  if (sort.value !== 'default') query.sort = sort.value;
  void router.replace({ query });
}

watch(() => route.query, applyQuery, { immediate: true });

/** 改一次筛选 → 同步 URL。不用 watch 反向写，避免和 applyQuery 打架 */
function setFilter(key: 'tag' | 'diff' | 'hours' | 'avail' | 'sort', value: string): void {
  if (key === 'tag') tag.value = value;
  else if (key === 'diff') diff.value = value;
  else if (key === 'hours') hours.value = value;
  else if (key === 'avail') avail.value = value;
  else sort.value = value;
  pushQuery();
}

function reset(): void {
  tag.value = '';
  diff.value = '';
  hours.value = '';
  avail.value = '';
  sort.value = 'default';
  void router.replace({ query: {} });
}

const filtered = computed(() => {
  const out = SEED_BOOKS.filter((b) => {
    if (tag.value && !(b.problem_tags ?? []).some((t) => t.tag === (tag.value as ProblemTagId))) return false;
    if (diff.value && String(b.difficulty) !== diff.value) return false;
    if (hours.value && !(HOUR_BUCKETS[hours.value]?.(b.est_reading_hours) ?? true)) return false;
    if (avail.value && availabilityOf(b).tone !== avail.value) return false;
    return true;
  });
  if (sort.value === 'hours') return [...out].sort((a, b) => a.est_reading_hours - b.est_reading_hours);
  if (sort.value === 'difficulty') {
    return [...out].sort((a, b) => a.difficulty - b.difficulty || a.est_reading_hours - b.est_reading_hours);
  }
  return [...out].sort((a, b) => (a.book_id < b.book_id ? -1 : a.book_id > b.book_id ? 1 : 0));
});

/* ── 对比选择（F9 的入口） ─────────────────────────────────────────── */

const picked = ref<string[]>([]);
const MAX_COMPARE = 3;

function togglePick(id: string): void {
  const i = picked.value.indexOf(id);
  if (i >= 0) {
    picked.value = picked.value.filter((x) => x !== id);
    return;
  }
  if (picked.value.length >= MAX_COMPARE) return;
  picked.value = [...picked.value, id];
}

const compareHref = computed(() => {
  const q = new URLSearchParams();
  picked.value.forEach((id, i) => q.set(['a', 'b', 'c'][i] ?? 'a', id));
  return `/compare?${q.toString()}`;
});

const hasFilter = computed(() => Boolean(tag.value || diff.value || hours.value || avail.value || sort.value !== 'default'));
</script>

<template>
  <section class="books">
    <header class="bk-head">
      <h1 class="bk-title">书库</h1>
      <p class="bk-sub">
        这 {{ SEED_BOOKS.length }} 本是逐本人工标注过的：每本都写了难度、篇幅、预计时长，
        以及它能接住哪些具体处境。不用先答题也能逛。
      </p>
    </header>

    <div class="bk-filters">
      <label class="bk-field">
        <span class="bk-label">处境</span>
        <select :value="tag" @change="setFilter('tag', ($event.target as HTMLSelectElement).value)">
          <option value="">全部</option>
          <option v-for="t in tagsInLibrary" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </label>

      <label class="bk-field">
        <span class="bk-label">难度</span>
        <select :value="diff" @change="setFilter('diff', ($event.target as HTMLSelectElement).value)">
          <option value="">不限</option>
          <option value="1">1 最易</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5 最难</option>
        </select>
      </label>

      <label class="bk-field">
        <span class="bk-label">时长</span>
        <select :value="hours" @change="setFilter('hours', ($event.target as HTMLSelectElement).value)">
          <option value="">不限</option>
          <option value="short">3 小时以内</option>
          <option value="mid">3–8 小时</option>
          <option value="long">8 小时以上</option>
        </select>
      </label>

      <label class="bk-field">
        <span class="bk-label">能不能拿到</span>
        <select :value="avail" @change="setFilter('avail', ($event.target as HTMLSelectElement).value)">
          <option value="">不限</option>
          <option value="inline">公版可读</option>
          <option value="byo">需自备</option>
          <option value="external">站外</option>
        </select>
      </label>

      <label class="bk-field">
        <span class="bk-label">排序</span>
        <select :value="sort" @change="setFilter('sort', ($event.target as HTMLSelectElement).value)">
          <option value="default">默认</option>
          <option value="hours">时长短的在前</option>
          <option value="difficulty">难度低的在前</option>
        </select>
      </label>
    </div>

    <div class="bk-tally">
      <span class="bk-count">{{ filtered.length }} / {{ SEED_BOOKS.length }} 本</span>
      <button v-if="hasFilter" type="button" class="bk-reset" @click="reset">清掉筛选</button>
    </div>

    <div v-if="filtered.length === 0" class="bk-empty">
      <p class="bk-empty-title">这个组合下没有书</p>
      <p class="bk-empty-body">
        不是坏掉了：这 {{ SEED_BOOKS.length }} 本里确实没有同时满足这些条件的。
        放宽一个条件通常就有了。
      </p>
      <button type="button" class="btn-ghost" @click="reset">清掉筛选</button>
    </div>

    <ul v-else class="bk-list">
      <li v-for="b in filtered" :key="b.book_id">
        <CatalogCard :book="b" :selected="picked.includes(b.book_id)" @toggle="togglePick(b.book_id)" />
      </li>
    </ul>

    <div v-if="picked.length > 0" class="bk-compare-bar">
      <span class="bk-picked">已选 {{ picked.length }} / {{ MAX_COMPARE }}</span>
      <router-link v-if="picked.length >= 2" class="btn-primary bk-go" :to="compareHref">并排对比</router-link>
      <span v-else class="bk-tip">再选一本就能对比</span>
      <button type="button" class="bk-clear" @click="picked = []">取消</button>
    </div>
  </section>
</template>

<style scoped src="../styles/books.css"></style>
