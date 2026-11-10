/**
 * 界面主题（N1）：跟随系统 / 浅色 / 深色。
 *
 * 三态而不是两态，理由和"阅读器夜间模式"一样：**跟着系统走是默认，也是最省事的**，
 * 但人会在两个方向上都和系统不一致——白天系统是浅色，他偏要深色看；夜里系统变深色，
 * 他要浅色做点事。只给一个开关，等于逼他每天去改系统设置。
 *
 * 为什么不在 JS 里算"现在到底该是深还是浅"：
 * CSS 已经用 `prefers-color-scheme` + `[data-theme]` 表达了同一件事（见 tokens.css）。
 * JS 再算一遍，就得再监听 media query 变化、再在系统切换时重算、再处理监听器泄漏，
 * 而收益只是"知道当前是深是浅"——没有一处需要这个答案。所以这里只做两件事：
 * **读出用户选了什么**、**把选择写成属性**。
 *
 * `auto` 的写法是**移除属性**而不是写 `data-theme="auto"`：
 * 后者要求 tokens.css 额外认识一个值，而 `:not([data-theme="light"])` 已经表达了
 * "没选浅色就走系统"。
 */

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** localStorage 键。带前缀是因为同一域名下可能还有别的东西，别用 `theme` 这种公共词 */
export const THEME_KEY = 'bookrx.theme';

/** 按钮点击的循环顺序：默认 → 浅 → 深 → 回到默认 */
export const THEME_CYCLE: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

/** 任何脏值都退回 `auto`：存储里可能是旧版本写的、手改的、或别的产品留下的 */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

export function nextTheme(current: ThemeChoice): ThemeChoice {
  const i = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length] ?? 'auto';
}

/**
 * 选择对应的 `data-theme` 属性值。`null` = 移除属性，交给 `prefers-color-scheme`。
 * 这个值直接影响 tokens.css 里哪段深色令牌生效，所以它必须只有一个来源。
 */
export function themeAttr(choice: ThemeChoice): 'light' | 'dark' | null {
  return choice === 'auto' ? null : choice;
}

/** 读用户的选择。存储被禁（隐私模式）时当作没选过，不抛 */
export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'auto';
  }
}

/** 把选择落到 `<html data-theme>`。属性由这里唯一写一次，别处不要再碰 */
export function applyTheme(choice: ThemeChoice): void {
  const attr = themeAttr(choice);
  const root = document.documentElement;
  if (attr === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', attr);
}

/**
 * 记住选择。写失败不提示：这只影响"下次打开还是不是这个主题"，
 * 而当前这一屏已经按他的选择变了——为一句"保存失败"打断阅读不值得。
 */
export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* 隐私模式 / 配额满：本次有效，下次退回跟随系统 */
  }
}
