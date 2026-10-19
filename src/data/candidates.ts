import { ref } from 'vue';

/**
 * 书目层（外围书库）运行时加载器。
 *
 * 数据由 `tools/fetch-douban.mjs` + `tools/build-candidates.mjs` 生成，
 * 随站点一起发布在 `public/catalog/candidates/`。**只从本站加载**，
 * 不向任何第三方发起请求；加载失败就静默降级（搜索只用内置核心库）。
 *
 * 这些书没有经过 34 字段人工核对，因此：只出现在搜索结果里，
 * 标注「未入库」，永不进入打分推荐。
 */

export interface CandidateBook {
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  year: number | null;
  q: number | null;
  bucket: 'high' | 'mid' | 'low' | 'unknown';
  votes: number | null;
  tags: string[];
  domains: string[];
  url: string;
}

export interface CandidateIndex {
  generated_at: string;
  all_file: string;
  total: number;
  by_domain: Record<string, number>;
  source_sha256: string;
}

const indexRef = ref<CandidateIndex | null>(null);
const booksRef = ref<CandidateBook[] | null>(null);

let indexPromise: Promise<CandidateIndex | null> | null = null;
let booksPromise: Promise<CandidateBook[] | null> | null = null;

async function getJson<T>(rel: string): Promise<T | null> {
  try {
    // 相对路径：由浏览器按当前文档地址解析（hash 路由不影响），
    // 站点部署在子路径时同样正确；测试环境里也不会因 baseURI 异常而失败。
    const res = await fetch(rel);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // 离线/文件缺失：降级，不报错
  }
}

/** 索引（很小）。失败返回 null，调用方据此决定是否展示外围结果区。 */
export function loadCandidateIndex(): Promise<CandidateIndex | null> {
  if (!indexPromise) {
    indexPromise = getJson<CandidateIndex>('catalog/candidates/index.json').then((r) => {
      indexRef.value = r;
      return r;
    });
  }
  return indexPromise;
}

/** 全量书目层（单文件，首次搜索时加载一次并缓存）。 */
export function loadCandidateBooks(): Promise<CandidateBook[] | null> {
  if (!booksPromise) {
    booksPromise = getJson<CandidateBook[]>('catalog/candidates/all.json').then((r) => {
      booksRef.value = r;
      return r;
    });
  }
  return booksPromise;
}

/** 供测试与调试：已加载的缓存。 */
export function candidateCache() {
  return { index: indexRef, books: booksRef };
}

/** 仅测试用：清空模块级缓存，让每个用例从零开始。 */
export function resetCandidateCacheForTests(): void {
  indexPromise = null;
  booksPromise = null;
  indexRef.value = null;
  booksRef.value = null;
}
