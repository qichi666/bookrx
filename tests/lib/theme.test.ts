/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, nextTheme, parseTheme, readTheme, saveTheme, themeAttr, THEME_KEY } from '@/lib/theme.js';

/**
 * 主题的判定全在这里。
 *
 * 为什么值得测：这一层出错**不会报错**——属性名写错、值写错、循环少一个状态，
 * 结果都是"点了按钮，页面没反应"或"下次打开又变回去了"，
 * 而这两种症状在深色屏幕上看起来都像"我点错了"。
 */

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('parseTheme', () => {
  it('只认 light / dark，其余一律当作没选过', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('auto')).toBe('auto');
    expect(parseTheme(null)).toBe('auto');
    expect(parseTheme(undefined)).toBe('auto');
    expect(parseTheme('')).toBe('auto');
    // 存储里可能是旧版本写的、手改的、或同域别的产品留下的
    expect(parseTheme('system')).toBe('auto');
    expect(parseTheme('DARK')).toBe('auto');
  });
});

describe('nextTheme', () => {
  it('跟随系统 → 浅色 → 深色 → 跟随系统', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });

  it('循环是闭合的：走三下必回到原处', () => {
    let c = 'auto' as const;
    for (let i = 0; i < 3; i += 1) c = nextTheme(c) as 'auto';
    expect(c).toBe('auto');
  });
});

describe('themeAttr', () => {
  it('auto 是"移除属性"，不是写一个 auto 值', () => {
    expect(themeAttr('auto')).toBeNull();
    expect(themeAttr('light')).toBe('light');
    expect(themeAttr('dark')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('显式浅色 / 深色写到 <html data-theme>，跟随系统时把属性摘掉', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('auto');
    // 摘掉而不是留一个空值：tokens.css 的 `:not([data-theme="light"])` 靠它决定走不走系统
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('存档与读取', () => {
  it('存了再读，读回来是同一个选择', () => {
    saveTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readTheme()).toBe('dark');
  });

  it('没存过时是"跟随系统"', () => {
    expect(readTheme()).toBe('auto');
  });

  it('存着脏数据也只当没选过，不抛异常', () => {
    localStorage.setItem(THEME_KEY, '{"theme":"dark"}');
    expect(readTheme()).toBe('auto');
  });
});
