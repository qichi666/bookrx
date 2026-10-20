import { ref, watch } from 'vue';

/**
 * 阅读偏好：字号 / 行距 / 主题。
 *
 * 存 localStorage 而不是 IndexedDB：它必须在**打开书之前**就生效，
 * 而 IndexedDB 是异步的——等读完再应用会让页面先闪一下默认字号。
 *
 * 只存三件事，且没有"每本书单独设置"：偏好是人的属性，不是书的属性。
 * 给每本书记一套字号会让用户每次换书都要重调。
 */

export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type FontSize = 16 | 18 | 20 | 22;
export type LineHeight = 1.6 | 1.8 | 2;

export interface ReaderPrefs {
  fontSize: FontSize;
  lineHeight: LineHeight;
  theme: ReaderTheme;
}

const KEY = 'bookrx.reader.prefs.v1';
const DEFAULT: ReaderPrefs = { fontSize: 18, lineHeight: 1.8, theme: 'light' };

export const FONT_SIZES: readonly FontSize[] = [16, 18, 20, 22];
export const LINE_HEIGHTS: readonly { value: LineHeight; label: string }[] = [
  { value: 1.6, label: '紧凑' },
  { value: 1.8, label: '标准' },
  { value: 2, label: '宽松' },
];
export const THEMES: readonly { value: ReaderTheme; label: string }[] = [
  { value: 'light', label: '白' },
  { value: 'sepia', label: '米' },
  { value: 'dark', label: '夜' },
];

function load(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      fontSize: FONT_SIZES.includes(v.fontSize as FontSize) ? (v.fontSize as FontSize) : DEFAULT.fontSize,
      lineHeight: (LINE_HEIGHTS.some((l) => l.value === v.lineHeight) ? v.lineHeight : DEFAULT.lineHeight) as LineHeight,
      theme: (THEMES.some((t) => t.value === v.theme) ? v.theme : DEFAULT.theme) as ReaderTheme,
    };
  } catch {
    return { ...DEFAULT };
  }
}

const prefs = ref<ReaderPrefs>(load());

watch(
  prefs,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* 隐私模式下写不进去不算错误：本次会话内偏好仍然生效 */
    }
  },
  { deep: true },
);

export function useReaderPrefs() {
  return {
    prefs,
    setFontSize(n: FontSize): void {
      prefs.value = { ...prefs.value, fontSize: n };
    },
    setLineHeight(n: LineHeight): void {
      prefs.value = { ...prefs.value, lineHeight: n };
    },
    setTheme(t: ReaderTheme): void {
      prefs.value = { ...prefs.value, theme: t };
    },
  };
}
