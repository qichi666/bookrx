import type { Book } from '@/contracts/book.js';
import type {
  Availability,
  BookId,
  CategoryL1,
  DepthLevel,
  FormType,
  LengthClass,
  ProblemTagId,
  Scale5,
} from '@/contracts/enums.js';

/** 一本「什么都不出格」的书：难度 2、易读 2、入门 2、篇幅 2、自备文件、无预警。 */
export function makeBook(over: Partial<Book> & { book_id: BookId }): Book {
  return {
    title: '测试书',
    author_ids: ['author:unknown'],
    author_display: ['佚名'],
    category_l1: 'psychology' as CategoryL1,
    problem_tags: [{ tag: 'low-mood', weight: 0.5 }],
    theme_tags: [{ tag: 'self-awareness', weight: 0.5 }],
    difficulty: 2 as Scale5,
    depth: 'howto' as DepthLevel,
    form: 'method' as FormType,
    entry_level: 2 as Scale5,
    prose_accessibility: 2 as Scale5,
    est_reading_hours: 4,
    length_class: 2 as LengthClass,
    content_warning: [],
    availability: 'bring_your_own' as Availability,
    copyright_basis: 'in_copyright',
    translation_copyright: 'none',
    one_line_what: '这是一本用于测试的书，讲的是一个可以被验证的方法。',
    structure_note: '它把问题拆成三步，每步都配一个可当场做的练习。',
    match_brief: '适合想把问题拆开看的人',
    content_ready: 'full',
    data_version: '2026.10.18',
    ...over,
  };
}

export function tag(tagId: ProblemTagId, weight: number): { tag: ProblemTagId; weight: number } {
  return { tag: tagId, weight };
}
