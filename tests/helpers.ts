import type { Book } from '@/contracts/book.js';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { scoreBook, type ScoredBook } from '@/domain/scoring/score.js';

export const PRIMARY_WEIGHT = 0.6;
export const SECOND_WEIGHT = 0.25;
export const THIRD_WEIGHT = 0.15;

/** 用户侧权重：主诉 0.60 / 次 0.25 / 第三 0.15（SPEC §6.1） */
export function userTags(tags: readonly ProblemTagId[]): Map<ProblemTagId, number> {
  const ws = [PRIMARY_WEIGHT, SECOND_WEIGHT, THIRD_WEIGHT];
  const m = new Map<ProblemTagId, number>();
  tags.forEach((t, i) => m.set(t, ws[Math.min(i, ws.length - 1)] as number));
  return m;
}

export function primaryOf(d: Diagnosis): { tag: ProblemTagId; weight: number } {
  return { tag: d.answers.primary_tag, weight: PRIMARY_WEIGHT };
}

export function scoreOne(d: Diagnosis, book: Book, tags: readonly ProblemTagId[]): ScoredBook {
  return scoreBook(book, userTags(tags), primaryOf(d), deriveTargets(d));
}

/** 不依赖 `Math.random` 的确定性洗牌（可复现性断言自己不能引入随机源） */
export function shuffle<T>(list: readonly T[], seed: number): T[] {
  const out = list.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
