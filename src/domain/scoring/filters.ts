import type { Book } from '@/contracts/book.js';
import type { BookId, ContentWarning, ProblemDomain } from '@/contracts/enums.js';
import type { AxisTargets } from './targets.js';
import { rulesFor } from './sensitive.js';

/**
 * 过滤码表（SPEC §6.3 ①）。**规则一律用名字引用，不要用 F1/F2 编号** ——
 * 各文档的编号不是一套，跨文档引用编号必错。
 *
 * 码表在实现侧、不在 `contracts/`：契约文件的规矩是只放类型、编译后零字节，
 * 塞一张 `const` 进去它就从"契约"变成"运行时代码"。代价是失去"只有一个地方能改"，
 * 所以改用 `tools/check-enums.mjs` 双向比对（数量 == 7 且排序后逐项相等）。
 */
export const FILTER_RULES = [
  { code: 'EX-difficulty' },
  { code: 'EX-load' },
  { code: 'EX-trauma' },
  { code: 'EX-terminal' },
  { code: 'no-problem-tags' },
  { code: 'excluded-by-user' },
  { code: 'metadata-only' },
] as const;

export type FilterRuleCode = (typeof FILTER_RULES)[number]['code'];

export interface FilterContext {
  domain: ProblemDomain;
  targets: AxisTargets;
  /** 内容偏好，不是心理状态声明。只豁免 `EX-terminal` */
  include_heavy: boolean;
  excluded: ReadonlySet<BookId>;
}

const EASY_LOAD = 25;

function hits(book: Book, warnings: readonly ContentWarning[]): boolean {
  const own = book.content_warning ?? [];
  for (const w of own) {
    if (warnings.includes(w)) return true;
  }
  return false;
}

/**
 * 硬过滤（SPEC §6.3 ①，打分之前）。返回**命中的第一条规则码**，通过则返回 `null`。
 *
 * 求值顺序仅用于让输出确定（同一本书永远报同一个码），不代表优先级。
 * 池资格类（`excluded-by-user` / `metadata-only` / `no-problem-tags`）放在前面，
 * 是为了让"这本书根本不该进来"的原因先被看到。
 */
export function hardFilter(book: Book, ctx: FilterContext): FilterRuleCode | null {
  if (ctx.excluded.has(book.book_id)) return 'excluded-by-user';
  if (book.content_ready !== 'full') return 'metadata-only';
  // 类型上可选（导入书可能没有），但 `content_ready='full'` 的书必须非空，由构建期校验把关
  if ((book.problem_tags?.length ?? 0) === 0) return 'no-problem-tags';

  const { targets } = ctx;
  // 跳答（未选"越轻松"）时不剔除：只凭标签剔除会把所有丧亲题材书从所有域里清空
  const isEasy = targets.load === EASY_LOAD;

  if (book.difficulty > targets.difficulty_cap) return 'EX-difficulty';
  if (book.entry_level >= 4 && targets.load < 40) return 'EX-load';
  if (isEasy) {
    // 敏感内容规则**从数据读**：哪个域、哪种警告、能不能被开关豁免，都在 `sensitive.ts` 的
    // 表里。这里只负责执行，不负责判断该保护谁——那条判断属于产品，不属于这一行代码。
    for (const rule of rulesFor(ctx.domain)) {
      if (!hits(book, rule.warnings)) continue;
      if (rule.waivable && ctx.include_heavy) continue;
      return rule.code;
    }
  }
  return null;
}

export interface FilteredOut {
  book_id: BookId;
  code: FilterRuleCode;
}

export function partitionPool(
  books: readonly Book[],
  ctx: FilterContext,
): { kept: Book[]; filtered: FilteredOut[] } {
  const kept: Book[] = [];
  const filtered: FilteredOut[] = [];
  for (const b of books) {
    const code = hardFilter(b, ctx);
    if (code === null) kept.push(b);
    else filtered.push({ book_id: b.book_id, code });
  }
  return { kept, filtered };
}
