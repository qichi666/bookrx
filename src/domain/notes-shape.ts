import type { Locator, RangeLocator } from '@/contracts/reader.js';

/**
 * 外部输入的形状校验：只回答「这个值长得对不对」，不判断语义好坏。
 *
 * 单独一个文件的理由：整个项目里**唯一**接触不可信数据的地方就是这里
 * （用户从别人那儿拿来的 `.notes.json`）。把它挤在 `notes-file.ts` 中间，
 * 读的人容易跳过；放在这里，审查时只需要看一个文件。
 *
 * 这些断言都是「结构够用就行」而非「严格符合 schema」：
 * 缺字段给默认值比直接拒收更友好，但一旦某字段**存在**且类型不对，就一律拒收——
 * 半懂不懂地读进去，比明确报错更容易把用户的笔记写坏。
 */

export function isChapterRef(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  // 三个字段都可选，但至少得是一个对象——`chapter_ref: "第3章"` 这种字符串会在解析期炸掉
  for (const k of ['href', 'spine_index', 'label']) {
    const val = r[k];
    if (val !== undefined && typeof val !== 'string' && typeof val !== 'number') return false;
  }
  return true;
}

/** 单个位置（Locator 判别联合三形态） */
export function isLocator(v: unknown): v is Locator {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  if (l['scheme'] === 'txt-offset') {
    return Number.isInteger(l['chapter']) && Number.isInteger(l['offset']);
  }
  if (l['scheme'] === 'quote') {
    return (
      typeof l['quote'] === 'string' &&
      Number.isInteger(l['occurrence']) &&
      isChapterRef(l['chapter_ref'])
    );
  }
  if (l['scheme'] === 'epub-cfi') return typeof l['cfi'] === 'string';
  return false;
}

/** 范围锚点：双端点 + 引文 + 章节引用，缺一个就不收 */
export function isRangeLocator(v: unknown): v is RangeLocator {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isLocator(r['start']) &&
    isLocator(r['end']) &&
    typeof r['quote'] === 'string' &&
    isChapterRef(r['chapter_ref'])
  );
}

/** 主版本号：`bookrx.notes/2` → 2。取不到数字返回 null（视为不认识） */
export function schemaVersionOf(schema: string): number | null {
  const m = /^bookrx\.notes\/(\d+)$/.exec(schema);
  return m === null ? null : Number.parseInt(m[1] as string, 10);
}
