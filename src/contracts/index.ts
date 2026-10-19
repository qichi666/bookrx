/**
 * 契约模块：index
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

export type * from './enums.js';
export type * from './book.js';
export type * from './diagnosis.js';
export type * from './recommendation.js';
export type * from './reader.js';
export type * from './review.js';
export type * from './import.js';
export type * from './catalog.js';
export type * from './question.js';
export type * from './external.js';
