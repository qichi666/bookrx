/**
 * 「一段原文 + 一句引文 + 一个期望位置」→ 段内区间。
 *
 * 抽成纯函数的原因是一个真实缺陷：划线落点原本用 `text.indexOf(quote)`，
 * 也就是**永远取第一次出现的位置**。同一段里同一句话出现两次时，划第二处
 * 会静默落到第一处——高亮跑到别的地方，不报错、不提示，用户只会以为自己记错了。
 * 这正是本产品最不能犯的那类错（定位错位必须可解释，不能静默）。
 *
 * 所以位置由一个「期望值」`hint` 决定（调用方从 DOM Range 算出来），
 * 引文只用来校验与兜底：
 *   1. `hint` 处原文确实就是这句引文 → 用它（唯一能区分重复句的路径）；
 *   2. 对不上（选区含首尾空白、段落被重新切分）→ 取离 `hint` 最近的一处出现；
 *   3. 一处都没有 → null，调用方据此明确拒绝，而不是猜一个位置。
 */
export interface QuoteSpan {
  start: number;
  end: number;
}

export function spanOfQuote(text: string, quote: string, hint = -1): QuoteSpan | null {
  if (quote.length === 0 || text.length === 0) return null;
  if (hint >= 0 && hint + quote.length <= text.length && text.startsWith(quote, hint)) {
    return { start: hint, end: hint + quote.length };
  }
  const first = text.indexOf(quote);
  if (first < 0) return null;
  if (hint < 0) return { start: first, end: first + quote.length };

  // 期望位置不精确时挑最近的一处：只走这一步才需要全段扫描，且只在有 hint 时做
  let best = first;
  let at = text.indexOf(quote, first + 1);
  while (at >= 0) {
    if (Math.abs(at - hint) < Math.abs(best - hint)) best = at;
    at = text.indexOf(quote, at + 1);
  }
  return { start: best, end: best + quote.length };
}
