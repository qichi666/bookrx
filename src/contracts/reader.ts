/**
 * 契约模块：reader
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId } from './enums.js';
export interface ChapterRef {
  href?: string;
  spine_index?: number;
  label?: string;
}

/**
 * 位置契约，判别联合三形态。
 *
 * 关键：EPUB CFI 只对"同一份文件"稳定。本产品大部分书由用户自行导入，
 * 换一份版式不同的文件后 CFI 必错，且是静默错位。因此标注必须额外携带
 * 引文锚点，由 resolveLocator 做多级降级。只存 CFI 视为缺陷。
 */

export type Locator =
  | { scheme: 'epub-cfi'; cfi: string }
  | { scheme: 'txt-offset'; chapter: number; offset: number }
  | {
      scheme: 'quote';
      chapter_ref: ChapterRef;
      quote: string;
      /** 该引文在书中第 n 次出现（1-based），解决重复句歧义 */
      occurrence: number;
    };

/** 标注的范围锚点：CFI 双写 + 引文锚点，两者都存，缺一不可。 */

export interface RangeLocator {
  start: Locator;
  end: Locator;
  /** 命中文本，≤500 字。删掉原文件后仍能回看笔记 */
  quote: string;
  /** 引文前 30 字，消歧与校验用 */
  prefix?: string;
  /** 引文后 30 字 */
  suffix?: string;
  chapter_ref: ChapterRef;
}

/** 定位解析结果。degraded=true 表示走了降级路径，UI 应给轻提示。 */

export interface ResolvedLocator {
  locator: Locator;
  degraded: boolean;
  /** 1=精确（CFI） 2=同章引文 3=全书引文 4=章节首 */
  level: 1 | 2 | 3 | 4;
}

/** 完全无法定位的标注，归入「失效标注」分组（绝不删除）。 */

export interface OrphanedAnnotation {
  annotation_id: string;
  book_id: BookId;
  reason: 'chapter-missing' | 'quote-not-found';
}

/**
 * 阅读入口决策结果（§6.1）。
 * UI 不允许自己判断 availability，只能消费此判别联合。
 */

export type ReaderEntry =
  | { kind: 'read-inline'; href: string }
  | { kind: 'read-local'; userBookId: BookId }
  | { kind: 'offer-import'; accept: '.epub,.txt' }
  | { kind: 'info-only'; externalUrl?: string };

/* ══════════════════════════════════════════════════════════════════════
 * 六、阅读进度（§2.6 四共享契约之四：progress_event）
 * ══════════════════════════════════════════════════════════════════════ */

export type ProgressEventKind = 'open' | 'relocate' | 'close' | 'finish';

/**
 * 进度事件。写入策略：relocate 节流 500ms + 尾沿 flush；close/finish 立即落库；
 * 只保留最近 200 条（环形），不无限增长。
 */

export interface ProgressEvent {
  book_id: BookId;
  kind: ProgressEventKind;
  locator: Locator | null;
  /** 0–1 */
  percent: number;
  at: number;
  /** 一次阅读会话一个 id，用于统计单次时长 */
  session_id: string;
}

export interface ReadingProgress {
  book_id: BookId;
  /** 从未打开为 null */
  locator: Locator | null;
  furthest_locator: Locator | null;
  /** 0–1，三位小数 */
  percent: number;
  /** 累计前台阅读毫秒（visibilitychange 隐藏即暂停计时） */
  total_reading_ms: number;
  last_opened_at: number;
  finished_at?: number;
  schema_version: number;
}

/* ══════════════════════════════════════════════════════════════════════
 * 七、标注 / 笔记 / 小测 / 复习卡（§2.7）
 * ══════════════════════════════════════════════════════════════════════ */

/*
 * 划线 v1 单色，**没有色令牌，也没有 `tone` 字段**。
 *
 * 四色方案已试算并否决：要让换色不改变正文对比度，四色必须做成等亮度
 * （彼此对比仅 1.001–1.046:1），而等亮度的代价是**只能靠色相区分** ——
 * 松绿与褐玫两色（取值见 `UIUX.md` §3.7 的令牌表）在红绿色盲下几乎重合。多色上线等于带一个
 * 无障碍缺陷上线。四色的验算与三条启用条件保留在 `UIUX.md` §3.7 附录。
 *
 * 将来要开：前提是先有**非颜色标记**（形状 / 符号 / 角标），再谈颜色；
 * 且必须同时做 Dexie 迁移。在那之前，Annotation 上不得出现任何色相字段。
 */

export interface Annotation {
  annotation_id: string;
  book_id: BookId;
  locator: RangeLocator;
  quote: string;
  created_at: number;
  note_id?: string;
}

export interface Note {
  note_id: string;
  book_id: BookId;
  annotation_id?: string;
  locator?: Locator;
  /** Markdown 子集：加粗 / 引用 / 换行 */
  body_markdown: string;
  created_at: number;
  updated_at: number;
}

/**
 * 章节小测题。第一版题库随核心库分发、人工编写（不引 LLM，ADR-004）。
 * 用户导入的非核心书没有小测 —— 这是明确的能力边界（ARCH.md §12）。
 */
