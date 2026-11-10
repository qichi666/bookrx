<script setup lang="ts">
/**
 * 读书计划（F11）。
 *
 * 从「读哪本」到「这几周读什么」。核心库预计时长跨 1.5–20 小时（13 倍），
 * 不排期的话"想读"很容易变成一个只增不减的堆积场。
 *
 * 三条边界：
 *  ① **不做提醒、不判逾期、不设惩罚**——无账号无服务端，任何"你没完成"
 *     的提示都只是在制造负罪感，而负罪感不会让人多读一页；
 *  ② 缺时长的书按中位 6 小时估，并且**在界面上标出来**，不假装精确；
 *  ③ 排期函数在 `domain/plan.ts`，纯函数、可单测，同输入同输出。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { listBooks, listProgress, listShelf } from '@/storage/db.js';
import { buildWishlist, totalHours, type WishItem } from '@/domain/wishlist.js';
import { planWeeks, FALLBACK_HOURS } from '@/domain/plan.js';

const HOURS_KEY = 'bookrx.plan.weeklyHours';

const loading = ref(true);
const failed = ref('');
const items = ref<WishItem[]>([]);
const localTitles = ref(new Map<string, string>());
const weekly = ref(6);
/** book_id → 实际累计时长（毫秒）。用来对照预估，**不改排期** */
const actualMs = ref(new Map<string, number>());

function readWeekly(): number {
  try {
    const raw = localStorage.getItem(HOURS_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 60 ? n : 6;
  } catch {
    return 6;
  }
}

watch(weekly, (v) => {
  try {
    localStorage.setItem(HOURS_KEY, String(v));
  } catch {
    /* 存不下只在本次生效 */
  }
});

async function refresh(): Promise<void> {
  loading.value = true;
  failed.value = '';
  try {
    const [shelf, books, progress] = await Promise.all([listShelf(), listBooks(), listProgress()]);
    const ms = new Map<string, number>();
    for (const pg of progress) {
      const total = pg.total_reading_ms ?? 0;
      if (total > 0) ms.set(pg.book_id, total);
    }
    actualMs.value = ms;
    const local = books.map((b) => b.book_id);
    const t = new Map<string, string>();
    for (const b of books) t.set(b.book_id, b.title);
    localTitles.value = t;
    items.value = buildWishlist(shelf, SEED_BOOKS, local);
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const plan = computed(() => planWeeks(items.value, weekly.value, 4));
const hours = computed(() => totalHours(items.value));

/** 实际读了多久（小时，一位小数）。没有记录返回 null——0 是"没读过"，不是"读了 0 小时"。 */
function actualHoursOf(bookId: string): number | null {
  const ms = actualMs.value.get(bookId);
  if (ms === undefined) return null;
  return Math.round((ms / 3600000) * 10) / 10;
}

/**
 * 实际速度 vs 预估速度。
 *
 * 只在**两本以上**有实测数据时才说：一本的偏差可能只是那天状态不好。
 * 这个数字**不参与排期计算**——改排期公式会让"同一份想读列表排出不同结果"，
 * 而计划页最需要的恰恰是"今天看到的下周，明天还是下周"。
 */
const speed = computed(() => {
  const pairs: { actual: number; est: number }[] = [];
  for (const it of items.value) {
    const a = actualHoursOf(it.book_id);
    if (a !== null && a >= 0.2 && it.hours > 0) pairs.push({ actual: a, est: it.hours });
  }
  if (pairs.length < 2) return null;
  const actualSum = pairs.reduce((n, p) => n + p.actual, 0);
  const estSum = pairs.reduce((n, p) => n + p.est, 0);
  if (estSum <= 0) return null;
  return { n: pairs.length, pct: Math.round((actualSum / estSum) * 100) };
});

function titleOf(it: WishItem): string {
  return it.title || localTitles.value.get(it.book_id) || '这本书已不在书库';
}

onMounted(async () => {
  weekly.value = readWeekly();
  await refresh();
});
</script>

<template>
  <section class="plan">
    <header class="pl-head">
      <h1 class="pl-title">接下来四周</h1>
      <p class="pl-sub">
        按「想读」里的先后顺序，把书排进四周。不提醒、不催、不算逾期——
        排期只是让你不用每次重新决定读哪本。
      </p>
    </header>

    <p v-if="loading" class="pl-state">正在读书架…</p>

    <div v-else-if="failed" class="pl-state pl-bad">
      <p class="pl-state-title">书架打不开</p>
      <p class="pl-detail">{{ failed }}</p>
      <button type="button" class="btn-ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="items.length === 0" class="pl-state">
      <p class="pl-state-title">想读里还是空的</p>
      <p class="pl-state-body">
        先去书库逛一圈，看到合适的点「加入想读」。有了几本之后，这一页会按它们各自的预计时长排进四周。
      </p>
      <router-link class="btn-primary pl-cta" to="/books">去书库</router-link>
    </div>

    <template v-else>
      <div class="pl-controls">
        <label class="pl-field">
          <span class="pl-label">每周大概能读（小时）</span>
          <input v-model.number="weekly" type="number" min="0.5" max="60" step="0.5" />
        </label>
        <p class="pl-summary">
          共 {{ items.length }} 本 · 约 {{ hours }} 小时
          <template v-if="plan.estimated_count > 0">
            · 其中 {{ plan.estimated_count }} 本缺预计时长，按 {{ FALLBACK_HOURS }} 小时估
          </template>
        </p>
      </div>

      <p v-if="speed" class="pl-speed">
        按你读过的 {{ speed.n }} 本算，实际用时是预估的 {{ speed.pct }}%。
        <template v-if="speed.pct >= 120">排期可能偏紧——这四周装不下的书都放在下面的「排不完」里。</template>
        <template v-else-if="speed.pct <= 80">你比预估快，可以考虑把周额度调高一点。</template>
        <template v-else>和预估算得差不多。</template>
        排期本身仍按预估时长算，不会因为这句话就变。
      </p>

      <ol class="pl-weeks">
        <li v-for="w in plan.weeks" :key="w.week" class="pl-week">
          <div class="pl-week-head">
            <h2 class="pl-week-title">第 {{ w.week }} 周</h2>
            <span class="pl-week-hours">{{ w.hours }} 小时</span>
          </div>
          <p v-if="w.items.length === 0" class="pl-week-empty">这周空着——上一本比周额度长，或者想读还不够排满四周。</p>
          <ul v-else class="pl-books">
            <li v-for="it in w.items" :key="it.book_id" class="pl-book">
              <router-link class="pl-book-title" :to="it.local ? `/reader/${it.book_id}` : `/book/${it.book_id}`">
                {{ titleOf(it) }}
              </router-link>
              <span class="pl-book-meta">
                {{ it.local ? '本机可读' : '需自备' }}
                <template v-if="it.hours > 0"> · 约 {{ it.hours }} 小时</template>
                <template v-if="actualHoursOf(it.book_id) !== null">
                  · 你已读 {{ actualHoursOf(it.book_id) }} 小时
                </template>
              </span>
            </li>
          </ul>
        </li>
      </ol>

      <section v-if="plan.overflow.length > 0" class="pl-over">
        <h2 class="pl-over-title">四周排不完，先放在这儿</h2>
        <p class="pl-over-body">
          还有 {{ plan.overflow.length }} 本、约 {{ plan.overflow_hours }} 小时排在第四周之后。
          想早点读到，把上面的周额度调大，或者先把手上的读完再往下排。
        </p>
        <ul class="pl-books">
          <li v-for="it in plan.overflow" :key="it.book_id" class="pl-book">
            <router-link class="pl-book-title" :to="it.local ? `/reader/${it.book_id}` : `/book/${it.book_id}`">
              {{ titleOf(it) }}
            </router-link>
            <span class="pl-book-meta">
              {{ it.local ? '本机可读' : '需自备' }}
              <template v-if="it.hours > 0"> · 约 {{ it.hours }} 小时</template>
            </span>
          </li>
        </ul>
      </section>

      <p class="pl-note">
        一本书比一周额度还长时，它会单独占一周，不拆成"半本跨周"——
        跨周之后"这周该读到哪"就变成一道算术题了。
      </p>

      <footer class="pl-foot">
        <router-link to="/library">回书架调想读顺序</router-link>
        <router-link to="/stats">看我实际读得多快</router-link>
      </footer>
    </template>
  </section>
</template>

<style scoped src="../styles/plan.css"></style>
