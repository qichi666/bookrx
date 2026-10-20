// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { reactive, readonly, ref, toRaw } from 'vue';
import { plainValue } from '@/lib/plain.js';

/**
 * `plainValue` 是"写库前把值摊平"的唯一入口。
 *
 * 它要解决的故障很具体：响应式 Proxy 不能被结构化克隆，
 * `IDBObjectStore.put` 会抛 `could not be cloned`，而调用处往往是
 * `void saveProgress(...)`——异常被吞掉，界面上只表现为"进度有时候不保存"。
 * 所以这里正面测 Proxy，不是测"普通对象能过"。
 */

function cloneable(v: unknown): boolean {
  try {
    structuredClone(v);
    return true;
  } catch {
    return false;
  }
}

describe('plainValue', () => {
  it('响应式对象：摊平后可以结构化克隆（原对象不行）', () => {
    const state = reactive({ book_id: 'b1', nested: { chapter: 2, offset: 140 }, tags: ['a', 'b'] });
    expect(cloneable(state)).toBe(false); // 先确认这个前提今天仍然成立
    const plain = plainValue(state);
    expect(cloneable(plain)).toBe(true);
    expect(toRaw(plain)).toBe(plain);
    expect(plain).toEqual({ book_id: 'b1', nested: { chapter: 2, offset: 140 }, tags: ['a', 'b'] });
  });

  it('ref 里的对象同样被摊平（阅读进度就是这种形状）', () => {
    const r = ref({ locator: { scheme: 'txt-offset', chapter: 0, offset: 12 } });
    expect(cloneable(r.value)).toBe(false);
    expect(cloneable(plainValue(r.value))).toBe(true);
  });

  it('readonly 包装也能过（它是更严的 Proxy）', () => {
    const ro = readonly({ a: 1 });
    expect(cloneable(plainValue(ro))).toBe(true);
  });

  it('二进制与日期原样保留（JSON 往返会把它们毁掉，所以不能用 JSON）', () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const blob = new Blob(['x']);
    const date = new Date(1_700_000_000_000);
    const out = plainValue({ bytes, blob, date });
    expect(out.bytes).toBe(bytes);
    expect(out.blob).toBe(blob);
    expect(out.date).toBe(date);
    expect(cloneable(out)).toBe(true);
  });

  it('数组里的对象逐项摊平', () => {
    const list = [reactive({ n: 1 }), reactive({ n: 2 })];
    const out = plainValue(list);
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
    expect(cloneable(out)).toBe(true);
  });

  it('undefined 的键被丢掉（省空间，也避免读回来时多一层判空）', () => {
    const out = plainValue({ a: 1, b: undefined });
    expect(Object.keys(out)).toEqual(['a']);
  });

  it('null 与原始值原样返回', () => {
    expect(plainValue(null)).toBeNull();
    expect(plainValue(7)).toBe(7);
    expect(plainValue('x')).toBe('x');
  });
});
