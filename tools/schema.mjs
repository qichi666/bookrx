/**
 * 从 `src/contracts/book.ts` **派生**书目字段表，而不是在这里再抄一份清单。
 *
 * 为什么不用手写清单：手写清单和契约是两份，改契约时忘了改清单不会报错，
 * 只会让 `catalog:audit` 用一套过期字段去校验 300 本书——**它照样全绿**。
 * 这与 `check-enums` 那一侧是同一个病，同一个解法：能派生就不比对。
 *
 * 解析范围刻意收窄：`export interface Book {` 到行首 `}` 之间、两空格缩进的字段行。
 * 契约文件里 `Book` 是唯一的书目结构，`UserBook extends Book` 不会被误收。
 */

import { readFileSync } from 'node:fs';

export const CONTRACT_PATH = 'src/contracts/book.ts';

export function loadBookFields(contractPath = CONTRACT_PATH) {
  const src = readFileSync(contractPath, 'utf8');
  const start = src.indexOf('export interface Book {');
  if (start < 0) throw new Error(`${contractPath} 里找不到 \`export interface Book\``);
  const end = src.indexOf('\n}', start);
  if (end < 0) throw new Error(`${contractPath} 里 \`Book\` 接口没有闭合`);

  const body = src.slice(start, end);
  const fields = [];
  const re = /^ {2}([A-Za-z_][A-Za-z0-9_]*)(\??)\s*:/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    fields.push({ name: m[1], optional: m[2] === '?' });
  }
  if (fields.length === 0) throw new Error(`${contractPath} 里没解析出任何字段 —— 扫描失败`);

  return {
    fields,
    required: fields.filter((f) => !f.optional).map((f) => f.name),
    optional: fields.filter((f) => f.optional).map((f) => f.name),
  };
}

/**
 * 条件必填：`?` 只是"类型上可选"，实际由取值决定。
 * 这几条由 `copyright-audit` 单独管，不进无条件必填集合。
 */
export const CONDITIONALLY_REQUIRED = [
  { field: 'translator', when: (b) => b.translation_copyright !== 'none', why: '中译本必填，版权闸门依赖' },
  { field: 'isbn13', when: () => false, why: '可选，但填了必须 13 位且校验位合法' },
  { field: 'public_domain_reason', when: (b) => String(b.copyright_basis ?? '').includes('public_domain'), why: 'copyright_basis 含 public_domain 时必填' },
  { field: 'source_url', when: (b) => b.availability !== 'external', why: 'availability ≠ external 时必填（出处必须可核验）' },
];

/** 文案字段的长度约束（SPEC §5.2）。`structure_note` 的句号要求单独校验。 */
export const TEXT_LIMITS = [
  { field: 'structure_note', max: 38, min: 1, mustEndWithSentence: true },
  { field: 'match_brief', max: 28, min: 1 },
  { field: 'one_line_gain', max: 35, min: 1 },
  { field: 'first_action', max: 30, min: 1 },
  { field: 'one_line_what', max: 90, min: 60 },
];

/** 中文字符按 1 字计；`match_brief` 的 28 字上限是汉字数，不是码点数。 */
export function charCount(s) {
  return Array.from(String(s ?? '')).length;
}
