/**
 * 写库前把值变成「纯数据」（P0-11 的静默失效修复）。
 *
 * 起因是一个真实故障：阅读进度里 `furthest_locator` 取自 `ref` 里的对象，
 * 读出来是 **Vue 的响应式 Proxy**。Proxy 不能结构化克隆，于是
 * `IDBObjectStore.put` 抛 `#<Object> could not be cloned` —— 但这条异常被
 * `void session.saveProgress(...)` 吞掉了，表现为"进度有时不保存"，
 * 界面上一片正常，控制台才有一行红字。
 *
 * 这里不做 JSON 往返：正文里有 ArrayBuffer、Blob、Date，JSON 会把它们毁掉。
 * 所以只递归拆「普通对象 / 数组」，其余类型原样返回。
 */

const KEEP_AS_IS = [ArrayBuffer, Blob, Date, File, RegExp];

export function plainValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const ctor of KEEP_AS_IS) {
    if (value instanceof ctor) return value;
  }
  if (ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map((v) => plainValue(v)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Proxy 的 key 是可枚举的，所以这一步天然把响应式对象摊平成普通对象
    if (v !== undefined) out[k] = plainValue(v);
  }
  return out as T;
}
