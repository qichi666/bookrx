import type { Book } from '@/contracts/book.js';
import seed from '../../catalog/shards/seed-core-01.json';

/**
 * 种子书目（13 本）。
 *
 * JSON 模块的类型推断是宽化的 `number` / `string`，与 `Scale5` 这类字面量联合
 * 对不上，所以这里做一次受控断言而不是让推断渗进业务层：
 * 数据的结构正确性由 `npm run catalog:audit` 在构建期兜底（必填从契约派生）。
 * 60 本全量生产属 M0.5；在此之前这批数据同时是演示数据。
 */
export const SEED_BOOKS = seed as unknown as readonly Book[];
