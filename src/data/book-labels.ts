import type { Tier } from '@/contracts/recommendation.js';

/**
 * 界面用到的枚举 → 中文。**全项目一份**。
 *
 * 这些映射原本散在 BookCard 里，详情页再抄一遍的话，两边迟早有一边改了另一边没改——
 * 而"档位叫高度契合还是高度匹配"这种不一致，用户会读成"两个页面在说不同的东西"。
 */

export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  strong: '高度契合',
  worth: '较为契合',
  explore: '换个角度',
};

/**
 * 档位方块数。`explore` 是 0 格：一格方块等于反复告诉用户「这本不行」，
 * 而第三组的语义是「换个角度看你的问题」，不是「凑数」。
 */
export const TIER_SQUARES: Readonly<Record<Tier, number>> = { strong: 3, worth: 2, explore: 0 };

export const DIFFICULTY_LABEL: Readonly<Record<number, string>> = {
  1: '很轻松',
  2: '轻松',
  3: '适中',
  4: '有挑战',
  5: '硬核',
};

export const LENGTH_LABEL: Readonly<Record<number, string>> = {
  1: '8 万字内',
  2: '8–20 万字',
  3: '20–40 万字',
  4: '40 万字以上',
};

export const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  psychology: '心理',
  'social-science': '社科',
  philosophy: '哲学',
  literature: '文学',
  biography: '传记',
  thinking: '思维',
  other: '其他',
};

/** 元数据行（卡片与详情页共用，保证两处说法一致）。 */
export function metaLine(book: {
  est_reading_hours: number;
  length_class: number;
  difficulty: number;
}): string {
  const len = LENGTH_LABEL[book.length_class] ?? '篇幅未知';
  const diff = DIFFICULTY_LABEL[book.difficulty] ?? '难度未知';
  return `约 ${book.est_reading_hours} 小时 · ${len} · ${diff}`;
}
