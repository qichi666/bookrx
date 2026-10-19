/**
 * 契约模块：review
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId } from './enums.js';
import type { Locator } from './reader.js';
export interface QuizItem {
  quiz_id: string;
  book_id: BookId;
  /** 用引文锚点而非 CFI：题库与用户文件版本无关（§7.3） */
  anchor: Locator & { scheme: 'quote' };
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

/**
 * FSRS 卡片状态。日期一律存 number（epoch ms）。
 * 坑：ts-fsrs 的 Card 用 Date 对象，经 JSON 往返会变字符串，
 * 再喂回调度器会静默算出错误的 elapsed_days（典型的沉默逻辑错误）。
 */

export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  /** 0=New 1=Learning 2=Review 3=Relearning */
  state: 0 | 1 | 2 | 3;
  last_review?: number;
}

/** 卡片来源：小测题，或用户从笔记一键建卡（保证没小测的书也能进复习流）。 */

export type ReviewCardSource =
  | { kind: 'quiz'; quiz_id: string }
  | { kind: 'note'; note_id: string };

export interface ReviewCard {
  review_id: string;
  book_id: BookId;
  source: ReviewCardSource;
  front: string;
  back: string;
  fsrs: FsrsState;
  suspended: boolean;
  created_at: number;
}

/* ══════════════════════════════════════════════════════════════════════
 * 八、导入（§6.2 / §6.4）
 * ══════════════════════════════════════════════════════════════════════ */
