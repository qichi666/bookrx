/**
 * 检索用的字符串工具（纯函数，无状态）。
 *
 * 单独拆出来是因为 `engine/search.ts` 已经贴着单文件 300 行的纪律线，
 * 而这些函数本身和书、标签、打分都无关，测试也能单独盯。
 */

/** 统一小写并去掉空白，中文不受影响。 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/** 两串是否只差一次编辑（增 / 删 / 改各算一次）。 */
export function withinOneEdit(a: string, b: string): boolean {
  const s = a.length <= b.length ? a : b;
  const l = a.length <= b.length ? b : a;
  if (l.length - s.length > 1) return false;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    if (s.length === l.length) {
      i += 1; // 等长：当成打错一个字（替换）
    }
    j += 1; // 不等长：当成少打 / 多打一个字
  }
  if (i < s.length) return false;
  const rest = l.length - j;
  return rest === 0 || (!skipped && rest === 1);
}

/**
 * 查询串是否约等于 haystack 的某一段（允许差一个字）。
 *
 * 只在严格命中为 0 时用，且查询至少 3 个字——两个字做近似匹配全是噪声。
 * 只比对「与查询等长 ±1」的窗口，不拿查询和整条长标题算距离：
 * 否则长标题永远距离远，短标题永远距离近，排序会变成按标题长度排。
 */
export const FUZZY_MIN_QUERY = 3;

export function fuzzyContains(haystack: string, q: string): boolean {
  if (q.length < FUZZY_MIN_QUERY) return false;
  for (const len of [q.length - 1, q.length, q.length + 1]) {
    if (len <= 1 || len > haystack.length) continue;
    for (let i = 0; i + len <= haystack.length; i += 1) {
      if (withinOneEdit(haystack.slice(i, i + len), q)) return true;
    }
  }
  return false;
}

/**
 * 截一段命中上下文。
 *
 * 不能拿「去空白小写」后的下标直接切原文——那样切出来是半截词
 * （副标题「笑声，激活孩子天性中的合作与勇气」会被切成「…性中的合作与勇气」）。
 * 所以先建一份原文字符下标映射，再按映射回到原文切窗。
 */
export function snippetAround(text: string, q: string, width = 24): string {
  const raw = text.trim();
  if (raw.length === 0) return '';
  // 短句（副标题多数如此）整句给出，不切窗——切了反而看不出上下文
  if (raw.length <= 40) return raw;
  const flat: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] as string;
    if (/\s/.test(ch)) continue;
    flat.push(ch.toLowerCase());
    map.push(i);
  }
  const idx = flat.join('').indexOf(q);
  if (idx < 0) return raw.length > width ? `${raw.slice(0, width)}…` : raw;
  const startChar = map[idx] ?? 0;
  const endChar = (map[idx + q.length - 1] ?? startChar) + 1;
  const from = Math.max(0, startChar - 6);
  const to = Math.min(raw.length, Math.max(endChar, from + 8) + 10);
  return `${from > 0 ? '…' : ''}${raw.slice(from, to)}${to < raw.length ? '…' : ''}`;
}

/**
 * 作者名归一化：只留文字与数字。
 *
 * 同一条书目里作者写法五花八门——「[美] 劳伦斯·科恩」/「劳伦斯·科恩」，
 * 「[日] 岸见一郎、[日] 古贺史健」可能是一个数组元素也可能拆成两个。
 * 版本归并要的是「是不是同一批人」，所以把标点、方括号、间隔号、顿号全去掉再比。
 */
export function authorKey(name: string): string {
  // 先去掉成对括号里的内容：[日] / [美] / （美）这类国籍标记，以及括号里的外文原名；
  // 再只留文字与数字。顺序不能反——先去标点的话，「[日]甲、[日]乙」会剩下「日甲日乙」，
  // 和「[日]甲、乙」的「日甲乙」对不上，同一本书就合并不了。
  return name
    .replace(/[\[【（(][^\]】）)]*[\]】）)]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}
