import { computed, onMounted, ref, type Ref } from 'vue';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemTagWeight } from '@/contracts/book.js';
import type { CandidateBook } from '@/data/candidates.js';
import { loadCandidateBooks } from '@/data/candidates.js';
import { loadDerivedTags } from '@/data/enriched.js';
import { userTagsOf } from '@/engine/diagnose.js';
import { pickWide } from '@/engine/wide-pool.js';

/**
 * 全库推荐池的状态与「换一批」。
 *
 * - 候选书按需加载（2MB 单文件，只在结果页加载一次并缓存）；
 * - epoch 存 localStorage：刷新后仍停在同一批，不会因为刷新又跳回开头；
 * - 加载失败 = 只有核心库，安静降级，不弹错误。
 */
const EPOCH_KEY = 'bookrx.wide_epoch.v1';

function readEpoch(): number {
  try {
    const raw = localStorage.getItem(EPOCH_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveEpoch(n: number): void {
  try {
    localStorage.setItem(EPOCH_KEY, String(n));
  } catch {
    /* 隐私模式下 localStorage 可能不可写；不影响本次会话 */
  }
}

export function useWidePool(diagnosis: Ref<Diagnosis | null>, excludeTitles: Ref<string[]>) {
  const books = ref<CandidateBook[] | null>(null);
  const derived = ref<Map<string, ProblemTagWeight[]> | null>(null);
  const loading = ref(false);
  const epoch = ref(readEpoch());

  onMounted(async () => {
    loading.value = true;
    try {
      const [b, d] = await Promise.all([loadCandidateBooks(), loadDerivedTags()]);
      books.value = b;
      derived.value = d;
    } finally {
      loading.value = false;
    }
  });

  const pool = computed(() => {
    if (!diagnosis.value || !books.value) return { size: 0, picks: [] as CandidateBook[] };
    return pickWide(books.value, diagnosis.value, {
      epoch: epoch.value,
      limit: 5,
      excludeTitles: excludeTitles.value,
      // 两条路都传：派生标签缺失时 pickWide 自动退回质量档轮转
      demand: userTagsOf(diagnosis.value),
      derived: derived.value ?? undefined,
    });
  });

  function next(): void {
    epoch.value += 1;
    saveEpoch(epoch.value);
  }

  return { loading, epoch, pool, next };
}
