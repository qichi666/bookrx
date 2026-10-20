/**
 * 契约模块：import
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { Book } from './book.js';
export type ImportErrorCode =
  | 'E_IMPORT_TOO_LARGE'
  | 'E_IMPORT_EMPTY'
  | 'E_IMPORT_NOT_EPUB'
  | 'E_IMPORT_CORRUPT_ZIP'
  | 'E_DRM_PROTECTED'
  | 'E_IMPORT_BAD_OPF'
  | 'E_IMPORT_ENCODING'
  | 'E_IMPORT_EMPTY_CONTENT'
  | 'E_STORAGE_QUOTA'
  | 'E_STORAGE_FAILED';

export interface ImportError {
  code: ImportErrorCode;
  /** 面向开发者的诊断信息，不直接展示给用户 */
  detail: string;
  /** 是否可通过用户动作恢复 */
  recoverable: boolean;
  /** 'choose-encoding' → 弹编码选择；'degrade-metadata' → 允许仅阅读 */
  recovery?: 'choose-encoding' | 'degrade-metadata';
}

export type ImportWarning =
  | { kind: 'font-obfuscated' }
  | { kind: 'metadata-degraded' }
  | { kind: 'fixed-layout-unsupported' }
  | { kind: 'chapterize-fallback' };

/**
 * 导入流水线的成功产物。
 * pipeline 是纯函数：输入 File/ArrayBuffer，输出此结构，**不碰 IndexedDB**；
 * 落库由调用方执行（§6.2）。这样导入链路可在 Node 里用真实样本单测。
 */

export interface ImportedBook {
  book: Book;
  /** 原始字节，由调用方写入独立的 book_files 表 */
  bytes: ArrayBuffer;
  /** 嗅探出的真实格式（不依赖扩展名） */
  format: 'epub' | 'txt';
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';
  warnings: ImportWarning[];
}

/** 结果类型，不用异常做流程控制。 */

export type ImportResult =
  | { ok: true; value: ImportedBook }
  | { ok: false; error: ImportError };

/* ══════════════════════════════════════════════════════════════════════
 * 九、catalog 运行时形状（构建期产物的解码结果，§5.2）
 * ══════════════════════════════════════════════════════════════════════ */

/** boot-columns 解码后的行内形状：只含打分所需字段。 */
