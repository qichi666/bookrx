import type { ProblemTagId } from '@/contracts/enums.js';
import { FREE_TEXT_KEYWORDS } from '@/data/free-text-keywords.js';

/**
 * 自由文本 → 困境标签的匹配。
 *
 * 原来这里是 `text.includes(kw)`：**要求用户逐字命中预设短语**。
 * 实测 28 句真实口语里只有 8 句命中（29%），18 句完全零命中（64%）——
 * 对那 64% 的人，第 4 屏等于白填。而金标 10/10 照样全绿，
 * 因为金标直接把结构化标签喂给引擎，**绕过了这条链路**。
 *
 * 现在的匹配分三级，全部是确定性的、不需要模型进运行时：
 *  ① **整串命中**：归一化后子串相等（最可信）；
 *  ② **允许插入成分**：关键词的字按顺序出现、中间插进来的字符不超过 `maxGap`。
 *     「开会……轮到我……说话」能命中 `开会说话`，这正是"开会不敢发言"那个旗舰场景；
 *  ③ **区间重叠消歧**：泛化标签（焦虑/低落/空虚这类）的命中如果被更具体的标签
 *     套住了，就丢掉泛化的那个——「领导批评我」不该只回一句"你焦虑"。
 *
 * 返回的 `phrase` 必须是**原文切片**（契约要求逐字保留），所以归一化时带一张位置映射表。
 */

/** 会被丢掉、不参与匹配的字符：空白与中英文标点。 */
const IGNORED = /[\s，。、！？；：""''《》〈〉【】（）()\[\]…—－\-·,.!?;:'"~`@#$%^&*_+=|\\/]/;

/** 归一到"可比对"的文本，同时记住每个字符在原文里的下标。 */
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] as string;
    if (IGNORED.test(ch)) continue;
    chars.push(ch.toLowerCase());
    map.push(i);
  }
  return { text: chars.join(''), map };
}

interface Span {
  start: number;
  end: number;
  /** 1 = 整串命中，2 = 允许插入成分 */
  kind: 1 | 2;
}

/**
 * 允许中间插入成分的匹配：关键词首字定位后逐字推进，被跳过的不匹配字符计入 `gap`。
 * 插入上限取 `min(maxGap, kw.length)`——关键词越长，允许插的越多，
 * 但不超过关键词自身的长度，否则短词会匹配到天边去。
 */
export function gapMatch(text: string, kw: string, maxGap = 5): Span | null {
  if (kw.length < 3) return null;
  const budget = Math.min(maxGap, kw.length);
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== kw[0]) continue;
    let ti = start + 1;
    let ki = 1;
    let gap = 0;
    while (ki < kw.length && ti < text.length && gap <= budget) {
      if (text[ti] === kw[ki]) {
        ki += 1;
        ti += 1;
      } else {
        gap += 1;
        ti += 1;
      }
    }
    if (ki === kw.length) return { start, end: ti, kind: 2 };
  }
  return null;
}

/** 泛化标签：容易被具体标签覆盖，只在没有更具体的命中时保留。 */
const GENERIC_TAGS = new Set<ProblemTagId>(['anxiety', 'low-mood', 'emptiness', 'rumination', 'self-doubt']);

export interface FreeTextHit {
  tag: ProblemTagId;
  /** 原文切片，逐字保留（契约：user_phrase） */
  phrase: string;
  /** 在原文里的区间（用于消歧与调试） */
  start: number;
  end: number;
  /** 1 = 整串命中，2 = 允许插入成分 */
  kind: 1 | 2;
}

/** 单个标签的最佳命中：整串优先，其次区间更长的插入匹配。 */
function bestInTag(text: string, keywords: readonly string[]): Span & { kw: string } | null {
  let best: (Span & { kw: string }) | null = null;
  for (const raw of keywords) {
    const kw = normalizeWithMap(raw).text;
    if (kw.length === 0) continue;
    const at = text.indexOf(kw);
    if (at >= 0) {
      const span: Span & { kw: string } = { start: at, end: at + kw.length, kind: 1, kw };
      // 整串命中直接返回：它一定优于任何插入匹配
      return span;
    }
    const g = gapMatch(text, kw);
    if (g === null) continue;
    if (best === null || g.end - g.start > best.end - best.start) best = { ...g, kw };
  }
  return best;
}

/**
 * 匹配入口。返回按「具体程度」排好序的命中列表。
 *
 * 顺序有意义：先具体的、后泛化的。`diagnose` 截断到 6 个 need_tags 时按权重排，
 * 但同一权重下先出现的先留下——泛化标签排前面会把具体的挤掉。
 */
export function matchFreeText(text: string): FreeTextHit[] {
  const { text: flat, map } = normalizeWithMap(text);
  if (flat.length === 0) return [];

  const raw: FreeTextHit[] = [];
  for (const [tag, keywords] of Object.entries(FREE_TEXT_KEYWORDS) as Array<
    [ProblemTagId, readonly string[]]
  >) {
    const hit = bestInTag(flat, keywords);
    if (hit === null) continue;
    const from = map[hit.start] as number;
    const to = (map[hit.end - 1] as number) + 1;
    raw.push({ tag, phrase: text.slice(from, to), start: hit.start, end: hit.end, kind: hit.kind });
  }

  // 具体命中的区间更长 → 先留下它们；泛化命中的区间若被套住，就丢掉
  const bySpan = [...raw].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: FreeTextHit[] = [];
  for (const h of bySpan) {
    const covered = kept.some(
      (k) => k.tag !== h.tag && h.start >= k.start && h.end <= k.end && k.end - k.start > h.end - h.start,
    );
    if (covered && GENERIC_TAGS.has(h.tag)) continue;
    kept.push(h);
  }

  // 输出顺序：具体的在前，同样长度按原文位置
  return kept.sort(
    (a, b) =>
      Number(GENERIC_TAGS.has(a.tag)) - Number(GENERIC_TAGS.has(b.tag)) ||
      a.start - b.start ||
      b.end - b.start - (a.end - a.start),
  );
}
