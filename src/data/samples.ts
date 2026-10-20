import type { ImportError } from '@/contracts/import.js';
import { importAndStore, type StoreResult } from '@/storage/library.js';

/**
 * 内置示例书（P0-13 的落地形态）。
 *
 * 这里**没有放任何第三方公版全文**，理由有两条，都不是懒：
 *  ① 保真：公版文本的版本差异很大（断句、错字、注释），随手贴一份进去，
 *     用户看到的可能是个劣质底本，而本站又无法逐字校勘；
 *  ② 边界：一旦分发别人的全文，就得同时回答"底本来源 / 校勘责任 / 有没有侵犯
 *     整理者权利"三个问题。示例书由本站自己写，这三个问题都不存在。
 *
 * 示例书的用途是**让人在导入之前先试**：翻页、字号、划线和笔记都能试一遍。
 * 它走的是与导入书完全相同的链路（同一套解析、切章、落库、阅读器），
 * 所以试出来的手感就是真手感——不会出现"示例很顺、导入就崩"。
 */

export interface SampleBook {
  id: string;
  title: string;
  author: string;
  /** `public/samples/` 下的文件名 */
  file: string;
  /** 一句话说明它是什么，别让人以为这是本真书 */
  note: string;
}

export const SAMPLE_BOOKS: readonly SampleBook[] = [
  {
    id: 'sample:reader-guide',
    title: '先读一段：这个阅读器怎么用',
    author: '本站自带示例',
    file: 'reading-sample.txt',
    note: '一千多字、四章，由本站编写并随代码分发，不涉及第三方版权。',
  },
];

/** 记住已经装过哪本示例（内容指纹是确定的，但只有取到文本才算得出来） */
const INSTALLED_KEY = 'bookrx.sample.installed';

export function installedSampleIds(): string[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberInstalled(bookId: string): void {
  try {
    const next = new Set(installedSampleIds());
    next.add(bookId);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify([...next]));
  } catch {
    // 存不了标记不影响使用：书已经在 IndexedDB 里了
  }
}

export type SampleResult = StoreResult | { ok: false; error: ImportError };

/** 取文本 → 当成一个普通文件导入（与拖进来的文件走同一条链路） */
export async function installSample(sample: SampleBook): Promise<SampleResult> {
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base.replace(/\/$/, '')}/samples/${sample.file}`;
  let text: string;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: 'E_IMPORT_EMPTY_CONTENT',
          detail: `示例文件取不到（HTTP ${res.status}）`,
          recoverable: true,
        },
      };
    }
    text = await res.text();
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'E_IMPORT_EMPTY_CONTENT',
        detail: `示例文件取不到：${e instanceof Error ? e.message : String(e)}`,
        recoverable: true,
      },
    };
  }

  const file = new File([text], sample.file, { type: 'text/plain;charset=utf-8' });
  const r = await importAndStore(file, sample.file);
  if (r.ok) rememberInstalled(r.book.book_id);
  return r;
}
