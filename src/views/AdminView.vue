<script setup lang="ts">
/**
 * 本地治理面板（F13）。
 *
 * **这不是管理员后台**：没有用户列表、没有权限分级、不查看任何别人的数据。
 * 它服务唯一维护者发布前的工作流——「哪些标签太薄」「危机资源是不是该重新核实了」。
 * 所以：只读、不入导航、只从 About 页底部一个小字链接进来。
 *
 * 面板不写任何用户数据：书架、笔记、统计一条都不碰。
 */
import { computed, onMounted, ref } from 'vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { CRISIS_RESOURCES, latestVerifiedAt } from '@/data/crisis.js';
import { DOMAIN_OPTIONS, TAG_OPTIONS } from '@/data/quiz.js';
import type { ProblemDomain } from '@/contracts/enums.js';
import { listReceipts } from '@/storage/activity.js';
import type { Receipt } from '@/storage/activity.js';
import { todayIso } from '@/lib/local-date.js';
import { dayNumber } from '@/domain/stats.js';

const TAG_LABEL = new Map<string, string>();
for (const d of DOMAIN_OPTIONS) {
  for (const o of TAG_OPTIONS[d.domain as ProblemDomain]) TAG_LABEL.set(o.tag, o.label);
}

const label = (t: string): string => TAG_LABEL.get(t) ?? t;

const tagCounts = computed(() => {
  const m = new Map<string, number>();
  for (const b of SEED_BOOKS) for (const t of b.problem_tags ?? []) m.set(t.tag, (m.get(t.tag) ?? 0) + 1);
  return [...m.entries()]
    .map(([tag, n]) => ({ tag, label: label(tag), n }))
    .sort((a, b) => a.n - b.n || a.label.localeCompare(b.label, 'zh-Hans-CN'));
});

const medianTag = computed(() => {
  const nums = tagCounts.value.map((x) => x.n).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  return nums[Math.floor(nums.length / 2)] ?? 0;
});

const thinTags = computed(() => tagCounts.value.filter((x) => x.n <= 3));

const difficulty = computed(() => {
  const m = new Map<number, number>();
  for (const b of SEED_BOOKS) m.set(b.difficulty, (m.get(b.difficulty) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, n }));
});

const hoursStat = computed(() => {
  const hs = SEED_BOOKS.map((b) => b.est_reading_hours).sort((a, b) => a - b);
  if (hs.length === 0) return { min: 0, median: 0, max: 0, total: 0 };
  return {
    min: hs[0] ?? 0,
    median: hs[Math.floor(hs.length / 2)] ?? 0,
    max: hs[hs.length - 1] ?? 0,
    total: Math.round(hs.reduce((a, b) => a + b, 0) * 10) / 10,
  };
});

const availability = computed(() => {
  const m = new Map<string, number>();
  for (const b of SEED_BOOKS) m.set(b.availability, (m.get(b.availability) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
});

const STALE_DAYS = 90;
const today = todayIso();
const nowDay = dayNumber(today);

const resources = computed(() =>
  [...CRISIS_RESOURCES.resources, CRISIS_RESOURCES.emergency].map((r) => ({
    name: r.name,
    verified_at: r.verified_at,
    age: Math.max(0, nowDay - dayNumber(r.verified_at)),
  })),
);
const staleCount = computed(() => resources.value.filter((r) => r.age > STALE_DAYS).length);

const receipts = ref<Receipt[]>([]);
const receiptRate = computed(() => {
  const n = receipts.value.length;
  if (n === 0) return null;
  const useful = receipts.value.filter((r) => r.verdict === 'useful').length;
  return { n, useful, pct: Math.round((useful / n) * 100) };
});

/** 每本书的"主困境"：权重最高的那个标签。回执按它归组，否则一本书会算进好几个标签。 */
const primaryTag = computed(() => {
  const m = new Map<string, string>();
  for (const b of SEED_BOOKS) {
    const top = [...(b.problem_tags ?? [])].sort(
      (x, y) => y.weight - x.weight || (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0),
    )[0];
    if (top) m.set(b.book_id, top.tag);
  }
  return m;
});

/**
 * 回执按困境聚合。
 *
 * 这张表存在的理由：整体有用率只能回答"准不准"，回答不了"**哪一类**不准"。
 * 阈值是 8000/6000，标注是否可信、哪个标签的书总被标"不适合"——
 * 这些是内容维护真正需要的信号，也是唯一能让回执从死数据变成动作的出口。
 *
 * 样本量如实标出来：n<3 的行会写明"样本太少"，不让人拿两条数据下结论。
 */
const receiptByTag = computed(() => {
  const map = new Map<string, { tag: string; label: string; n: number; unfit: number; useful: number }>();
  for (const r of receipts.value) {
    const tag = primaryTag.value.get(r.book_id);
    if (!tag) continue;
    const row = map.get(tag) ?? { tag, label: label(tag), n: 0, unfit: 0, useful: 0 };
    row.n += 1;
    if (r.verdict === 'unfit') row.unfit += 1;
    if (r.verdict === 'useful') row.useful += 1;
    map.set(tag, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, unfitPct: Math.round((r.unfit / r.n) * 100) }))
    .sort((a, b) => b.unfitPct - a.unfitPct || b.n - a.n || (a.tag < b.tag ? -1 : 1));
});

onMounted(async () => {
  // 回执是唯一"用户主动导出后才会汇总到这里"的数据；本机没有就为空
  try {
    receipts.value = await listReceipts();
  } catch {
    receipts.value = [];
  }
});
</script>

<template>
  <section class="admin">
    <header class="ad-head">
      <p class="ad-eyebrow">维护者面板 · 只读</p>
      <h1 class="ad-title">发布前看一眼</h1>
      <p class="ad-sub">
        这里只展示静态书库与本机回执的聚合结果，不修改书架、笔记或统计，也不上传任何数据。
        普通用户不需要这一页，所以它不进导航。
      </p>
    </header>

    <section class="ad-block">
      <h2 class="block-title">书库体检</h2>
      <div class="ad-kpis">
        <div class="ad-kpi"><strong>{{ SEED_BOOKS.length }}</strong><span>本书</span></div>
        <div class="ad-kpi"><strong>{{ tagCounts.length }}</strong><span>类困境标签</span></div>
        <div class="ad-kpi"><strong>{{ medianTag }}</strong><span>标签中位厚度</span></div>
        <div class="ad-kpi"><strong>{{ hoursStat.median }}</strong><span>时长中位（小时）</span></div>
      </div>
      <p class="ad-note">
        时长最小 {{ hoursStat.min }} 小时 / 最大 {{ hoursStat.max }} 小时，
        全库合计约 {{ hoursStat.total }} 小时。可获得性：
        <template v-for="(a, i) in availability" :key="a[0]">
          {{ a[0] }} {{ a[1] }} 本<template v-if="i < availability.length - 1">、</template>
        </template>。
      </p>
    </section>

    <section class="ad-block">
      <h2 class="block-title">最薄的标签（≤3 本）</h2>
      <p class="ad-note">
        这些标签下可选的书太少。数字是如实算出来的，不美化——补书之前，推荐再准也只有这几本可挑。
      </p>
      <ul v-if="thinTags.length > 0" class="ad-list">
        <li v-for="t in thinTags" :key="t.tag">
          <span>{{ t.label }}</span><span class="ad-val">{{ t.n }} 本</span>
        </li>
      </ul>
      <p v-else class="ad-note">没有低于 3 本的标签。</p>
    </section>

    <section class="ad-block">
      <h2 class="block-title">全部标签厚度</h2>
      <ul class="ad-list ad-list-dense">
        <li v-for="t in tagCounts" :key="t.tag">
          <span class="ad-bar-label">{{ t.label }}</span>
          <span class="ad-bar-track"><span class="ad-bar" :style="{ width: `${Math.min(100, t.n * 12)}%` }"></span></span>
          <span class="ad-val">{{ t.n }}</span>
        </li>
      </ul>
    </section>

    <section class="ad-block">
      <h2 class="block-title">难度分布</h2>
      <ul class="ad-list">
        <li v-for="d in difficulty" :key="d.level">
          <span>{{ d.level }} 级</span><span class="ad-val">{{ d.n }} 本</span>
        </li>
      </ul>
    </section>

    <section class="ad-block">
      <h2 class="block-title">危机资源核实状态</h2>
      <p class="ad-note">
        全清单最近核实于 {{ latestVerifiedAt() }}。超过 {{ STALE_DAYS }} 天未核实要重新查官方页面。
        当前<span :class="{ 'ad-alert': staleCount > 0 }">{{ staleCount > 0 ? `有 ${staleCount} 条超期` : '没有超期条目' }}</span>。
      </p>
      <ul class="ad-list">
        <li v-for="r in resources" :key="r.name">
          <span>{{ r.name }}</span>
          <span class="ad-val" :class="{ 'ad-alert': r.age > STALE_DAYS }">
            {{ r.verified_at }} · {{ r.age }} 天前
          </span>
        </li>
      </ul>
    </section>

    <section class="ad-block">
      <h2 class="block-title">本机回执聚合</h2>
      <p v-if="receiptRate" class="ad-note">
        本机共 {{ receiptRate.n }} 条回执，其中 {{ receiptRate.useful }} 条觉得有用（{{ receiptRate.pct }}%）。
        这是本机数据，不代表所有用户：别人需要主动导出文件发给你，才会被汇总。
      </p>
      <p v-else class="ad-note">
        本机还没有回执。回执由用户读完书后主动填写，这里不采集、不上报。
      </p>
    </section>

    <section class="ad-block">
      <h2 class="block-title">回执按困境聚合</h2>
      <p class="ad-note">
        按书的"主困境"归组，看哪一类被标「不适合我」的比例最高。
        它不改推荐、不改阈值——只是把判断依据先摆出来。
      </p>
      <ul v-if="receiptByTag.length > 0" class="ad-list">
        <li v-for="r in receiptByTag" :key="r.tag">
          <span>
            {{ r.label }}
            <template v-if="r.n < 3">（样本太少）</template>
          </span>
          <span class="ad-val" :class="{ 'ad-alert': r.n >= 3 && r.unfitPct >= 40 }">
            {{ r.n }} 条 · 不适合 {{ r.unfit }}（{{ r.unfitPct }}%）
          </span>
        </li>
      </ul>
      <p v-else class="ad-note">本机还没有回执，这一栏等读完之后才有的看。</p>
    </section>

    <footer class="ad-foot">
      <router-link to="/about">回到关于页</router-link>
      <router-link to="/books">看书库</router-link>
      <router-link to="/profile">本机档案</router-link>
    </footer>
  </section>
</template>

<style scoped src="../styles/admin.css"></style>
