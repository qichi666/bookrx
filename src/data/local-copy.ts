import type { Book, UserBook } from '@/contracts/book.js';

/**
 * 「这本书我本机上有吗」——把书目池的书与用户导入的书对上号。
 *
 * 为什么只按**书名**匹配：
 *  · 导入文件里的 ISBN 十有八九是空的（很多 EPUB 的 OPF 里根本没写），拿它当键等于永不命中；
 *  · 作者更不可靠——同一本书的中文译名能有三四种写法，还有合著、编选。
 * 所以匹配只做一件事：把书名规范化到只剩字，再要求**长度 ≥ 2** 才敢相等。
 * 短书名（如「活着」）本来就有歧义，宁可不给"打开"，也不要打开错的书。
 *
 * 匹配错了的代价不是多点一次：用户会以为这本就是他导入的那本，
 * 打开后发现版式/译本不同，还以为是我们的阅读器坏了。
 */

/** 去掉标点、空白、括号内容，全角转半角，只留下字与数字 */
export function normalizeTitle(raw: string): string {
  return raw
    .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '') // 副题、丛书名常在括号里
    .replace(/[\s\u3000]+/g, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export const MIN_TITLE_MATCH = 2;

export function findLocalCopy(book: Book, locals: readonly UserBook[]): UserBook | undefined {
  const want = normalizeTitle(book.title);
  if (want.length < MIN_TITLE_MATCH) return undefined;
  return locals.find((u) => normalizeTitle(u.title) === want);
}
