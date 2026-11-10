// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

/**
 * 阅读器偏好（字号 / 行距 / 底色）。
 *
 * 这个模块是**单例 + 模块加载时读一次存储**，所以每条用例必须重置模块再导入，
 * 否则测的是上一条用例留下的内存状态——那种测试永远绿，也永远不说明任何事。
 *
 * 关键判据：存储里是脏值时**必须回落到默认值**。用户手改过 localStorage、
 * 或者装过一个旧版本，都不该让阅读器打开时字号变成 0 号或 99 号。
 */

const KEY = 'bookrx.reader.prefs.v1';

async function fresh() {
  vi.resetModules();
  return import('@/composables/useReaderPrefs.js');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('读取与回落', () => {
  it('没存过：18 号 / 1.8 倍 / 白底', async () => {
    const { useReaderPrefs } = await fresh();
    expect(useReaderPrefs().prefs.value).toEqual({ fontSize: 18, lineHeight: 1.8, theme: 'light' });
  });

  it('存过合法值：原样读回', async () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 22, lineHeight: 2, theme: 'dark' }));
    const { useReaderPrefs } = await fresh();
    expect(useReaderPrefs().prefs.value).toEqual({ fontSize: 22, lineHeight: 2, theme: 'dark' });
  });

  it('字号不在枚举里（17 / 999 / "20"）：回落到 18，不是夹取', async () => {
    for (const bad of [17, 999, '20', null]) {
      localStorage.setItem(KEY, JSON.stringify({ fontSize: bad, lineHeight: 1.6, theme: 'sepia' }));
      const { useReaderPrefs } = await fresh();
      expect(useReaderPrefs().prefs.value.fontSize).toBe(18);
      // 别的字段不受牵连：一处坏值不该把整份偏好重置
      expect(useReaderPrefs().prefs.value.theme).toBe('sepia');
    }
  });

  it('行距 / 底色不合法：各自回落，互不影响', async () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 16, lineHeight: 3, theme: 'neon' }));
    const { useReaderPrefs } = await fresh();
    expect(useReaderPrefs().prefs.value).toEqual({ fontSize: 16, lineHeight: 1.8, theme: 'light' });
  });

  it('存的是坏 JSON / 不是对象：整份回落且不抛', async () => {
    for (const raw of ['{', 'null', '"dark"', '[]']) {
      localStorage.setItem(KEY, raw);
      const { useReaderPrefs } = await fresh();
      expect(useReaderPrefs().prefs.value).toEqual({ fontSize: 18, lineHeight: 1.8, theme: 'light' });
    }
  });
});

describe('修改与持久化', () => {
  it('改字号 / 行距 / 底色都会写回存储', async () => {
    const { useReaderPrefs } = await fresh();
    const api = useReaderPrefs();

    api.setFontSize(20);
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').fontSize).toBe(20);

    api.setLineHeight(1.6);
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').lineHeight).toBe(1.6);

    api.setTheme('sepia');
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').theme).toBe('sepia');
  });

  it('改一项不会把另外两项冲掉', async () => {
    const { useReaderPrefs } = await fresh();
    const api = useReaderPrefs();
    api.setFontSize(22);
    api.setTheme('dark');
    api.setLineHeight(2);
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ fontSize: 22, lineHeight: 2, theme: 'dark' });
  });

  it('多次调用拿到的是同一个偏好（单例），不会两个组件各存一份', async () => {
    const { useReaderPrefs } = await fresh();
    const a = useReaderPrefs();
    const b = useReaderPrefs();
    a.setFontSize(16);
    expect(b.prefs.value.fontSize).toBe(16);
  });
});
