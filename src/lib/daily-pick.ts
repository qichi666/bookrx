/**
 * 「今天」区块的确定性选取（F1 增强）。
 *
 * 需求：每天从用户自己的划线里挑一条回到首页，让人有机会重新遇到自己的判断。
 *
 * **不能用 `Math.random`**，因为：
 *  ① `src/domain` 禁随机已被测试拦；这里虽然在 `lib/`，但同一份输入在不同刷新下
 *    给出不同结果，会让「今天这条」变成「每次刷新都变」，反而失去"今天的"这层含义；
 *  ② 同一设备同一天必须稳定——关掉再打开还是这一条，用户才可能真的读完它。
 *
 * 做法：把 `book_id + 日期` 拼成一个字符串做 FNV-1a 散列，直接对长度取模。
 * 不追求统计意义上的均匀，只要求**同输入同输出**且分布不退化。
 */

/** FNV-1a 32 位散列。不用自带实现是因为 `crypto.subtle` 是异步的，会把渲染变成两拍。 */
export function hashKey(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    // 乘 16777619 的位移写法，避免超出 32 位整数精度
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * 从 n 个条目里选一个下标。`key` 传日期（`YYYY-MM-DD`）即可；
 * 不同条目的 `id` 由调用方拼进 `salt`，避免所有用户同一天选中同一条。
 */
export function pickDailyIndex(length: number, key: string, salt = ''): number {
  if (length <= 0) return -1;
  if (length === 1) return 0;
  return hashKey(`${salt}|${key}`) % length;
}

/**
 * 选一条。传进来的顺序由调用方决定（建议按 `created_at` 升序），
 * 这里**不排序**——排序会让「同一批数据在不同时间进来」得到不同结果。
 *
 * `salt` 由调用方给（一般传条目总数或第一条 id），作用是让不同设备/不同批数据
 * 在同一天不会都挑到「第 0 条」。
 */
export function pickDaily<T>(items: readonly T[], key: string, salt = ''): T | null {
  const i = pickDailyIndex(items.length, key, salt);
  return i < 0 ? null : (items[i] ?? null);
}
