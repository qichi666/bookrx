import type { Book } from '@/contracts/book.js';
import seed01 from '../../catalog/shards/seed-core-01.json';
import seed02 from '../../catalog/shards/seed-core-02.json';
import seed03 from '../../catalog/shards/seed-core-03.json';

/**
 * 种子书目（60 本，分三片装载）。
 *
 * 为什么分片而不是一个大文件：`seed-core-01` 是经过人工逐条核对的 13 本，
 * 带金标评测结论，改动它等于改动评测基线；02/03 是后续按标签缺口补的书，
 * 可能整批回炉重标。分片让「回炉一批」不用碰已验证的那批，
 * 也让 `git log` 看得出哪一批是哪次补的。
 *
 * JSON 模块的类型推断是宽化的 `number` / `string`，与 `Scale5` 这类字面量联合
 * 对不上，所以这里做一次受控断言而不是让推断渗进业务层：
 * 数据的结构正确性由 `npm run catalog:audit` 在构建期兜底（必填从契约派生）。
 */
const SHARDS = [seed01, seed02, seed03] as unknown as readonly (readonly Book[])[];

export const SEED_BOOKS: readonly Book[] = SHARDS.flat();

/** 分片原始条数，供构建期自检与测试对账（避免「少装一片」静默通过）。 */
export const SEED_SHARD_SIZES: readonly number[] = SHARDS.map((s) => s.length);
