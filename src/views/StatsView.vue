<script setup lang="ts">
/**
 * 阅读统计（F7）。
 *
 * 这一页存在的唯一理由：**阅读是长期行为，没有积累感就没有回访理由**。
 * 之前 `telemetry.ts` 只记三个聚合计数（域、档位、总数），既没有时长也没有天数，
 * 用户读了两小时，产品一无所知。
 *
 * 三条硬规则：
 *  ① 统计**不反向影响推荐**——这一页只读不写，一个字都不进打分；
 *  ② 空状态必须诚实：没有记录就说没有记录，**不画一堆 0 的柱子**；
 *  ③ 连续天数带冻结额度（断一天不清零），断一天全归零是负反馈，
 *     用户的第一反应不是重新开始，而是不再看这个数字。
 */
import { computed, onMounted, ref } from 'vue';
import GoalCard from '@/components/stats/GoalCard.vue';
import { listBooks, listProgress, listShelf } from '@/storage/db.js';
import { listReceipts, listSessions } from '@/storage/activity.js';
import type { Receipt } from '@/storage/activity.js';
import { countShelfStatus } from '@/domain/shelf.js';
import { bucketSessions, computeStreak, humanDuration, lastDays } from '@/domain/stats.js';
import { localDayIso, todayIso, shortDay } from '@/lib/local-date.js';

const loading = ref(true);
const failed = ref('');
const durations = ref<{ book_id: string; duration_ms: number }[]>([]);
/** 原始的「哪天 + 多久」，连续天数与柱状图都从它来，不另外维护冗余字段 */
const sessionDays = ref<{ day: string; duration_ms: number }[]>([]);
const receipts = ref<Receipt[]>([]);
const titles = ref(new Map<string, string>());
const finishedCount = ref(0);
const startedCount = ref(0);
/** 放下的书：单列一个数字，**不进**读完率的分子分母 */
const abandonedCount = ref(0);
/** 「标为读完」的那天，按本机时区折算成日期——目标的周期边界用的是同一套本地日期 */
const finishedDays = ref<string[]>([]);
const totalMs = ref(0);

async function refresh(): Promise<void> {
  loading.value = true;
  failed.value = '';
  try {
    const [sessions, rs, books, shelf, progress] = await Promise.all([
      listSessions(),
      listReceipts(),
      listBooks(),
      listShelf(),
      listProgress(),
    ]);
    const byBook = new Map<string, number>();
    for (const s of sessions) byBook.set(s.book_id, (byBook.get(s.book_id) ?? 0) + s.duration_ms);
    durations.value = [...byBook.entries()]
      .map(([book_id, duration_ms]) => ({ book_id, duration_ms }))
      .sort((a, b) => b.duration_ms - a.duration_ms);

    sessionDays.value = sessions.map((s) => ({ day: s.day, duration_ms: s.duration_ms }));
    receipts.value = rs;
    const t = new Map<string, string>();
    for (const b of books) t.set(b.book_id, b.title);
    titles.value = t;
    // 四个状态的计数与「开始过」的口径都在 domain 里定死，
    // 不在这里各写一遍 filter——写完就有人把弃读加进分母
    const counts = countShelfStatus(shelf);
    finishedCount.value = counts.finished;
    startedCount.value = counts.started;
    abandonedCount.value = counts.abandoned;
    finishedDays.value = shelf
      .filter((s) => s.group === 'finished')
      .map((s) => localDayIso(s.updated_at));

    const fromSessions = sessions.reduce((sum, s) => sum + s.duration_ms, 0);
    const fromProgress = progress.reduce((sum, p) => sum + (p.total_reading_ms ?? 0), 0);
    // 取两者较大值：老数据只有 progress 里的累计，新数据两条都有，不能相加（会翻倍）
    totalMs.value = Math.max(fromSessions, fromProgress);
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const today = todayIso();
const week = computed(() => lastDays(bucketSessions(sessionDays.value), today, 7));

const streak = computed(() => computeStreak(sessionDays.value.map((s) => s.day), today));
const weekMs = computed(() => week.value.reduce((sum, b) => sum + b.duration_ms, 0));
const maxDay = computed(() => Math.max(1, ...week.value.map((b) => b.duration_ms)));

const usefulRate = computed(() => {
  const total = receipts.value.length;
  if (total === 0) return null;
  const useful = receipts.value.filter((r) => r.verdict === 'useful').length;
  return { useful, total, pct: Math.round((useful / total) * 100) };
});

/**
 * 读完率：读完 / 开始过。
 *
 * 之前只有「读完 N 本」这个绝对数——它回答不了"我是不是读一本弃一本"。
 * 分母取「在读 + 读完」，**不取想读、也不取弃读**：收藏不叫开始；
 * 而放下的书放进去，这个数就不再描述阅读，只描述放弃了几次。
 */
const finishRate = computed(() => {
  if (startedCount.value === 0) return null;
  return { finished: finishedCount.value, started: startedCount.value, pct: Math.round((finishedCount.value / startedCount.value) * 100) };
});

const topBooks = computed(() => durations.value.slice(0, 5));

const VERDICT_LABEL = { useful: '有用', neutral: '一般', unfit: '不适合我' } as const;

onMounted(refresh);
</script>

<template>
  <section class="stats">
    <header class="st-head">
      <h1 class="st-title">阅读统计</h1>
      <p class="st-sub">
        这些数字只存在这台设备上，不上传、不同步。换浏览器或清站点数据后归零。
      </p>
    </header>

    <!-- 目标卡片放在整条 v-if 链**之前**：链的首项是"加载中"，把目标夹进链里
         就得为"有目标但还没记录"再加一个分支。它自己判断该不该出现更直接，
         而且没读过书的人最需要一个起点，这里也是他唯一能设目标的地方。 -->
    <GoalCard
      v-if="!loading && !failed"
      :sessions="sessionDays"
      :finished-days="finishedDays"
      :today="today"
    />

    <p v-if="loading" class="st-state">正在读本机记录…</p>

    <div v-else-if="failed" class="st-state st-bad">
      <p class="st-state-title">本机记录打不开</p>
      <p class="st-state-body">常见于无痕模式，或浏览器被设为"退出时清除站点数据"。</p>
      <p class="st-detail">{{ failed }}</p>
      <button type="button" class="btn-ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="totalMs === 0" class="st-state">
      <p class="st-state-title">还没有阅读记录</p>
      <p class="st-state-body">
        读满 20 秒才算一次记录——翻一下目录就退出，不算读过。
        从书架里打开一本，读完一章就会出现在这里。
      </p>
      <router-link class="btn-primary st-cta" to="/library">去书架</router-link>
    </div>

    <template v-else>
      <div class="st-cards">
        <div class="st-card">
          <span class="st-num">{{ humanDuration(totalMs) }}</span>
          <span class="st-label">累计阅读</span>
        </div>
        <div class="st-card">
          <span class="st-num">{{ streak.days }} 天</span>
          <span class="st-label">
            连续阅读
            <template v-if="streak.freezes_used > 0">（已用 {{ streak.freezes_used }} 次冻结）</template>
          </span>
        </div>
        <div class="st-card">
          <span class="st-num">{{ humanDuration(weekMs) }}</span>
          <span class="st-label">最近七天</span>
        </div>
        <div class="st-card">
          <span class="st-num">{{ finishedCount }} 本</span>
          <span class="st-label">书架里标为读完</span>
        </div>
        <div v-if="finishRate" class="st-card">
          <span class="st-num">{{ finishRate.pct }}%</span>
          <span class="st-label">
            读完率（{{ finishRate.finished }} / {{ finishRate.started }} 本开始的）
          </span>
        </div>
        <div v-if="abandonedCount > 0" class="st-card">
          <span class="st-num">{{ abandonedCount }} 本</span>
          <span class="st-label">放下的书（不算读完，也不算没读完）</span>
        </div>
      </div>

      <section class="st-block">
        <h2 class="block-title">最近七天</h2>
        <svg class="st-chart" viewBox="0 0 320 120" role="img" :aria-label="`最近七天共 ${humanDuration(weekMs)}`">
          <line x1="0" y1="96" x2="320" y2="96" class="st-axis" />
          <g v-for="(b, i) in week" :key="b.day">
            <rect
              :x="8 + i * 44"
              :y="96 - Math.max(2, (b.duration_ms / maxDay) * 76)"
              width="28"
              :height="Math.max(2, (b.duration_ms / maxDay) * 76)"
              rx="2"
              class="st-bar"
              :class="{ zero: b.duration_ms === 0, now: b.day === today }"
            />
            <text :x="22 + i * 44" y="112" class="st-tick" text-anchor="middle">
              {{ shortDay(b.day).replace(' 月 ', '/').replace(' 日', '') }}
            </text>
          </g>
        </svg>
        <p class="st-note">
          0 也是记录：那天确实没读。冻结额度最多用 2 次，只能补「漏掉的一天」——
          连着几天没读就从头算。它保住的是天数，不补时长。
        </p>
      </section>

      <p v-if="finishRate" class="st-note">
        读完率只算「开始过的书」，想读不算——收藏不叫开始。分母小的前期，这个数字会很难看，那是对的。
      </p>

      <p v-if="abandonedCount > 0" class="st-note">
        放下的书单独计，不进读完率：把它算进分母，这个百分比就会随着每次放弃往下掉，
        它也就不再说「我读完了几本」，只说「我放弃了几次」。
      </p>

      <section v-if="topBooks.length > 0" class="st-block">
        <h2 class="block-title">时间花在哪几本上</h2>
        <ul class="st-list">
          <li v-for="b in topBooks" :key="b.book_id" class="st-row">
            <span class="st-row-title">{{ titles.get(b.book_id) ?? '已删除的书' }}</span>
            <span class="st-row-val">{{ humanDuration(b.duration_ms) }}</span>
          </li>
        </ul>
      </section>

      <section v-if="usefulRate" class="st-block">
        <h2 class="block-title">读完之后</h2>
        <p class="st-rate">
          你给 {{ usefulRate.total }} 本做过回执，其中
          <strong>{{ usefulRate.useful }} 本</strong>觉得有用（{{ usefulRate.pct }}%）。
        </p>
        <ul class="st-list">
          <li v-for="r in receipts" :key="r.book_id" class="st-row">
            <span class="st-row-title">{{ titles.get(r.book_id) ?? r.book_id }}</span>
            <span class="st-row-val">{{ VERDICT_LABEL[r.verdict] }}</span>
          </li>
        </ul>
        <p class="st-note">
          这个比例只给你自己看。它不上传，也不参与推荐排序——推荐用的仍然是可复现的规则分。
        </p>
      </section>

      <footer class="st-foot">
        <router-link to="/library">书架</router-link>
        <router-link to="/books">书库</router-link>
      </footer>
    </template>
  </section>
</template>

<style scoped src="../styles/stats.css"></style>
