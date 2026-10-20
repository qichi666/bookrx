import type { Book } from '@/contracts/book.js';
import { READER_AVAILABLE } from './capabilities.js';

/**
 * 可获得性三态的口径（PRD §9.1 / UIUX P3 可用性区块）。
 *
 * 三态的名字不是装饰：它们决定用户**下一步要做什么动作**，
 * 所以动词一律不复用（阅读 / 自备 / 查看），扫一眼就知道要不要动手。
 *
 * 与规格书的差异只有一处，但必须记下来：
 * 规格书给 `inline` 写的是「可直接阅读」，前提是有内置阅读器。当前没有，
 * 于是口径改成「公版·站外可读」——**这本书确实是公版，但我们不能替你打开它**。
 * 数据侧的 `availability: inline` 没有改：它描述的是版权事实，不是我们的能力。
 */
export type AvailabilityTone = 'inline' | 'byo' | 'external';

export interface AvailabilityCopy {
  /** 徽标文字（卡片上就这一行，必须能独立看懂） */
  label: string;
  /** 详情页说明段：讲清"你要做什么" */
  note: string;
  /** 说明段之后的补充（公版书标版本来源；版权书标获取途径） */
  extra?: string;
  tone: AvailabilityTone;
}

const INLINE_WITH_READER: AvailabilityCopy = {
  label: '可直接阅读',
  note: '本文本为公版作品（作者逝世已满 50 年）。',
  extra: '所用版本与来源见下方链接；不同底本注释差异较大，引用前请自行核对。',
  tone: 'inline',
};

const INLINE_NO_READER: AvailabilityCopy = {
  // 改口径的唯一理由：我们没有阅读器，说「可直接阅读」就是承诺一件做不到的事
  label: '公版·站外可读',
  note: '这本书是公版作品（作者逝世已满 50 年），正文可以合法免费读到——但不是在这里读：本站还没有内置阅读器。',
  extra: '下面的第一个链接直接指向公版全文。不同底本注释差异较大，引用前请自行核对。',
  tone: 'inline',
};

const BYO: AvailabilityCopy = {
  label: '需自备电子书',
  note: '这本书还在版权期内，本站不提供全文。你需要在别处准备好 EPUB 或 TXT 文件。',
  extra: '合法途径：公共图书馆（多数支持线上借阅）、购买电子版、出版社官网。',
  tone: 'byo',
};

const EXTERNAL: AvailabilityCopy = {
  label: '仅书目信息',
  note: '本站只有这本书的基本信息，不提供正文，也没有深入推荐。',
  extra: '外链会离开本站。',
  tone: 'external',
};

export function availabilityOf(book: Book): AvailabilityCopy {
  switch (book.availability) {
    case 'inline':
      return READER_AVAILABLE ? INLINE_WITH_READER : INLINE_NO_READER;
    case 'external':
      return EXTERNAL;
    default:
      return BYO;
  }
}

/** 徽标配色档：inline 与 byo 有底，external 走中性。 */
export function availabilityClass(book: Book): string {
  const tone = availabilityOf(book).tone;
  return tone === 'inline' ? 'avail-inline' : tone === 'byo' ? 'avail-byo' : 'avail-external';
}
