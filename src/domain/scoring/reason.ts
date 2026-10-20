import type { Book } from '@/contracts/book.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import type { ReasonBlock, ReasonLine, ReasonSource } from '@/contracts/recommendation.js';
import { TAG_OPTIONS } from '@/data/quiz.js';

/**
 * 推荐理由：**每一句都必须能说出它是从哪来的**。
 *
 * 为什么要做这件事：理由原来只有 `match_brief` 一句人工写死的文案，
 * 用户看到的"为什么推这本"和引擎实际算的东西没有任何关系——
 * 方案评审里把这种情况叫「可审计性只活在代码里」：内部能追溯，用户看不见，
 * 于是所有工程投入在产品上也看不见，还顺带让人怀疑推荐是不是随便给的。
 *
 * 三档来源（顺序即可信度）：
 *   · `prewritten`      —— 编辑为这本书写的，最具体，但和"你"无关
 *   · `from_answer`     —— 直接回引你在问卷里选的原词
 *   · `from_tag_weight` —— 书的困境标注 × 权重，可追溯到具体标签和数值
 *
 * 三档都必须显式标注。**没有来源的理由不许出现在界面上**——
 * 一条说不出出处的理由，比没有理由更糟：它看起来像结论。
 */

/** 标签 → 用户看到的中文（取自问卷选项文案，与 user_phrase 同一套词）。 */
const TAG_LABEL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of Object.values(TAG_OPTIONS)) {
    for (const o of group) map[o.tag] = o.label;
  }
  return map;
})();

export function tagLabel(tag: ProblemTagId): string {
  return TAG_LABEL[tag] ?? tag;
}

/** 理由来源的中文标签（UI 徽章用）。 */
export const SOURCE_LABEL: Readonly<Record<ReasonSource, string>> = {
  prewritten: '书里写的',
  from_answer: '你的回答',
  from_tag_weight: '书的标注',
};

export interface ReasonInput {
  book: Book;
  userTags: ReadonlyMap<ProblemTagId, number>;
  primaryTag: ProblemTagId;
  /** 主诉的用户原词（逐字回引）。缺省时退回标签文案。 */
  primaryPhrase?: string;
}

/**
 * 组装理由。**不新增任何事实**：只说"书里标了什么""你选了什么"，
 * 不解释为什么这个标签意味着什么——那是诊断建议，不是推荐理由。
 */
export function buildReason(input: ReasonInput): ReasonBlock {
  const { book, userTags, primaryTag, primaryPhrase } = input;

  const lines: ReasonLine[] = [];

  // ① 你的回答：只回引主诉，且原文优先（逐字，不改写）
  lines.push({
    text: `你说的是「${primaryPhrase ?? tagLabel(primaryTag)}」`,
    source: 'from_answer',
    basis: primaryTag,
  });

  // ② 书的标注：只列这本书真的带了、且用户也选了的标签，按书的权重降序
  const carried = (book.problem_tags ?? [])
    .filter((p) => (userTags.get(p.tag) ?? 0) > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2);
  for (const p of carried) {
    const isPrimary = p.tag === primaryTag;
    lines.push({
      text: `这本在「${tagLabel(p.tag)}」上有标注${isPrimary ? '（正是你的主诉）' : ''}，权重 ${p.weight}`,
      source: 'from_tag_weight',
      basis: p.tag,
    });
  }

  // ③ 编辑写的一句：放最后，因为它最具体但不针对"你"
  lines.push({ text: book.match_brief, source: 'prewritten' });

  return { brief: { text: book.match_brief, source: 'prewritten' }, lines };
}

/** 契约硬校验：每条理由必须有非空文本与合法来源。测试与调试构建都调用。 */
export function assertReason(block: ReasonBlock): void {
  const all = [block.brief, ...block.lines];
  for (const line of all) {
    if (typeof line.text !== 'string' || line.text.trim().length === 0) {
      throw new Error('理由缺少文本');
    }
    if (!(line.source in SOURCE_LABEL)) {
      throw new Error(`理由来源非法：${String(line.source)}`);
    }
  }
  if (block.lines.length === 0) throw new Error('理由展开区为空');
}
