import type { Book } from '@/contracts/book.js';

/**
 * "到哪读"的外链（P2-4 裁决后的替代方案）。
 *
 * 顺序不是随便排的，每一格对应一种**不同性质的下一步**：
 *   1. 有正文 → 直接给正文（公版书的原文站）
 *   2. 想立刻开始读 → 微信读书（有会员就能开，不用等物流）
 *   3. 想要纸书 → 电商
 *   4. 想先看评价 → 豆瓣
 *   5. 不想花钱 → 国家图书馆（法定送存，多数城市可线上办证）
 *
 * 全部 `target="_blank" rel="noopener noreferrer"`：这是一份纯静态站点，
 * 不能给外链任何 `window.opener` 的机会。
 */
export interface BookLink {
  label: string;
  href: string;
  /** 是否离开本站（决定要不要提示） */
  external: boolean;
}

function q(s: string): string {
  return encodeURIComponent(s);
}

export function linksOf(book: Book): BookLink[] {
  const links: BookLink[] = [];
  const title = book.title;

  // 公版书：source_url 就是正文来源（维基文库 / Gutenberg 等），排第一
  if (book.availability === 'inline' && book.source_url) {
    links.push({ label: '公版全文', href: book.source_url, external: true });
  }

  links.push(
    { label: '微信读书', href: `https://weread.qq.com/web/search/books?keyword=${q(title)}`, external: true },
    { label: '买一本', href: `http://search.dangdang.com/?key=${q(title)}`, external: true },
    { label: '图书馆', href: 'https://www.nlc.cn/', external: true },
    {
      label: '豆瓣',
      href: `https://search.douban.com/book/subject_search?search_text=${q(title)}`,
      external: true,
    },
  );

  return links;
}

/**
 * 卡片上只放 4 个，详情页放全部 —— 卡面空间是稀缺资源。
 * 顺序保证被砍掉的永远是"先看评价"（豆瓣），而不是"不花钱"（图书馆）。
 */
export function cardLinksOf(book: Book): BookLink[] {
  return linksOf(book).slice(0, 4);
}
