/**
 * 契约模块：catalog
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId, AuthorId, CategoryL1, ContentWarning, FactorId, Availability, CopyrightBasis, TranslationCopyright, LengthClass, Scale5 } from './enums.js';
import type { ProblemTagWeight } from './book.js';
export interface ScoringRow {
  book_id: BookId;
  author_id: AuthorId;
  category_l1: CategoryL1;
  problem_tags: ProblemTagWeight[];
  difficulty: Scale5;
  prose_accessibility: Scale5;
  est_reading_hours: number;
  length_class: LengthClass;
  availability: Availability;
  content_warning: ContentWarning[];
}

/** 详情分片中的文案字段（渲染卡片时才需要）。 */

export interface DetailRow {
  book_id: BookId;
  one_line_what: string;
  structure_note: string;
  one_line_gain?: string;
  first_action?: string;
  boundary_hints?: Partial<Record<FactorId, string>>;
  publisher_summary?: string;
  /** ≤28 字单行，卡片首行。按书预写，与 phrases.judgment 分工见 Book.match_brief */
  match_brief: string;
  word_count?: number;
  series_id?: string;
  source_url?: string;
  translator?: string;
  copyright_basis: CopyrightBasis;
  translation_copyright: TranslationCopyright;
}

/** 检索命中。score 为优先级权重（§5.4），同分按 book_id 升序。 */

export interface SearchHit {
  book_id: BookId;
  score: number;
  /** 命中字段，供 UI 高亮 */
  field: 'title' | 'pinyin-initials' | 'pinyin-full' | 'author' | 'tag' | 'one_line_what';
}

/* ══════════════════════════════════════════════════════════════════════
 * 十、问卷定义（§2.3，对应 PRD §7.1 的四步）
 * ══════════════════════════════════════════════════════════════════════ */
