import { computed, ref, type Ref } from 'vue';
import type { UserBook } from '@/contracts/book.js';
import type { Annotation, Note, ReadingProgress } from '@/contracts/reader.js';
import type { ParsedChapter } from '@/engine/import/types.js';
import {
  chapterOffsetOf,
  furthestOf,
  paragraphOfChapterOffset,
  posFromSelection,
  rangeOf,
  resolveRange,
} from '@/domain/locator.js';
import {
  deleteAnnotation,
  getBook,
  getChapters,
  getProgress,
  getShelf,
  listAnnotations,
  listNotes,
  putAnnotation,
  putNote,
  putProgress,
  putShelf,
  type ShelfEntry,
} from '@/storage/db.js';

/**
 * 阅读会话：把「读一本书」需要的四份数据（元数据 / 章节 / 进度 / 标注）合成一份视图状态。
 *
 * 抽出来的理由不是行数，而是**初始化的顺序有硬要求**：标注必须先解析定位
 * （`resolveRange` 可能降级）才能渲染，而解析又需要章节已经读出来。
 * 这个顺序散在视图里，很容易在某次重构中被 Promise.all 打乱，然后高亮静默消失。
 */

export interface MarkView {
  id: string;
  quote: string;
  chapter: number;
  paragraph: number;
  start: number;
  end: number;
  chapterLabel: string;
  note: string;
  /** 定位降级说明（level ≥ 2），没有就是 undefined */
  warning?: string;
  level: 1 | 2 | 3 | 4;
}

function newId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
}

export function useReaderSession(bookId: Ref<string>) {
  const book = ref<UserBook | null>(null);
  const chapters = ref<ParsedChapter[]>([]);
  const annotations = ref<Annotation[]>([]);
  const notes = ref<Note[]>([]);
  const progress = ref<ReadingProgress | null>(null);
  const loading = ref(true);
  const notFound = ref(false);
  /** 书架状态缓存：落盘时不再回读（见 saveProgress） */
  const shelf = ref<ShelfEntry | null>(null);
  /** 续读位置：进度里记的是「章节 + 章节内字符偏移」，落成段落序号才知道翻到第几页 */
  const resumeChapter = ref(0);
  const resumeParagraph = ref(0);

  /** 标注 → 可渲染形态。定位失败也保留（level 4），只是带 warning。 */
  const marks = computed<MarkView[]>(() => {
    // 笔记按划线 id 建一次索引：逐条 find 是 O(标注数 × 笔记数)，
    // 读了几百条划线之后每次翻页都会重复扫一遍全量笔记
    const noteOf = new Map<string, string>();
    for (const n of notes.value) {
      if (n.annotation_id !== undefined && n.annotation_id !== '') noteOf.set(n.annotation_id, n.body_markdown);
    }
    return annotations.value.map((a) => {
      const r = resolveRange(chapters.value, a.locator);
      const pos = r.pos ?? { chapter: 0, paragraph: 0, start: 0, end: 0 };
      return {
        id: a.annotation_id,
        quote: a.quote,
        chapter: pos.chapter,
        paragraph: pos.paragraph,
        start: pos.start,
        end: pos.end,
        chapterLabel: chapters.value[pos.chapter]?.title ?? '未知章节',
        note: noteOf.get(a.annotation_id) ?? '',
        ...(r.note ? { warning: r.note } : {}),
        level: r.level,
      };
    });
  });

  async function load(): Promise<void> {
    loading.value = true;
    notFound.value = false;
    shelf.value = null;
    try {
      const [b, ch, ann, nt, pg] = await Promise.all([
        getBook(bookId.value),
        getChapters(bookId.value),
        listAnnotations(bookId.value),
        listNotes(bookId.value),
        getProgress(bookId.value),
      ]);
      if (!b || !ch) {
        notFound.value = true;
        return;
      }
      book.value = b;
      chapters.value = ch.chapters;
      annotations.value = ann;
      notes.value = nt;
      progress.value = pg ?? null;
      if (pg && pg.locator?.scheme === 'txt-offset') {
        resumeChapter.value = Math.min(Math.max(pg.locator.chapter, 0), ch.chapters.length - 1);
        resumeParagraph.value = paragraphOfChapterOffset(ch.chapters, resumeChapter.value, pg.locator.offset);
      }
      // 首次打开：放进"在读"组；导入时是"想读"的，也在第一次打开时转成"在读"。
      // 已经手动标成"读完"的不动——用户对自己的判断优先于我们的推断。
      const s = await getShelf(bookId.value);
      if (!s || s.group === 'want') {
        shelf.value = { book_id: bookId.value, group: 'reading', updated_at: Date.now() };
        await putShelf(shelf.value);
      } else {
        shelf.value = s;
      }
    } finally {
      loading.value = false;
    }
  }

  /** 首次打开时的起始位置（进度可能指向很后面，但不超过现有章节数） */
  const startChapter = computed(() => Math.min(resumeChapter.value, Math.max(0, chapters.value.length - 1)));
  const startParagraph = computed(() => resumeParagraph.value);

  async function addMark(chapter: number, paragraph: number, text: string, start: number, end: number): Promise<MarkView | null> {
    const pos = posFromSelection(chapter, paragraph, text, start, end);
    const locator = rangeOf(chapters.value, pos);
    if (!locator.quote) return null;
    const a: Annotation = {
      annotation_id: newId('ann'),
      book_id: bookId.value as Annotation['book_id'],
      locator,
      quote: locator.quote,
      created_at: Date.now(),
    };
    await putAnnotation(a);
    annotations.value = [...annotations.value, a];
    return marks.value.find((m) => m.id === a.annotation_id) ?? null;
  }

  async function removeMark(id: string): Promise<void> {
    await deleteAnnotation(id);
    annotations.value = annotations.value.filter((a) => a.annotation_id !== id);
    // 笔记**不删**：库里留着，导出的笔记文件仍带得走（`buildNotesFile` 把没有划线的
    // 笔记当独立笔记导出）。内存里也不删——旧实现在这里过滤掉 notes，
    // 于是同一条笔记"本次会话看不见、刷新后又回来"，同一份数据两副面孔。
  }

  async function saveNote(annotationId: string, body: string): Promise<void> {
    const existing = notes.value.find((n) => n.annotation_id === annotationId);
    const now = Date.now();
    const note: Note = existing
      ? { ...existing, body_markdown: body, updated_at: now }
      : {
          note_id: newId('note'),
          book_id: bookId.value as Note['book_id'],
          annotation_id: annotationId,
          body_markdown: body,
          created_at: now,
          updated_at: now,
        };
    await putNote(note);
    notes.value = existing ? notes.value.map((n) => (n.note_id === note.note_id ? note : n)) : [...notes.value, note];
  }

  /**
   * 前台阅读时长。契约要求 `visibilitychange` 隐藏即暂停计时——不然把标签页挂在后台
   * 一整天，统计出来的"读了 8 小时"是假的，而这类假数据会直接污染用户的自我认知。
   */
  let activeSince: number | null = null;
  let accumulated = 0;

  function pauseClock(): void {
    if (activeSince !== null) {
      accumulated += Date.now() - activeSince;
      activeSince = null;
    }
  }

  function resumeClock(): void {
    if (activeSince === null) activeSince = Date.now();
  }

  function totalReadingMs(): number {
    const live = activeSince === null ? 0 : Date.now() - activeSince;
    return (progress.value?.total_reading_ms ?? 0) + accumulated + live;
  }

  async function saveProgress(chapter: number, paragraph: number, ratio: number, totalChapters: number): Promise<void> {
    const chapterRatio = totalChapters > 0 ? chapter / totalChapters : 0;
    const percent = Math.min(1, Math.max(0, chapterRatio + ratio / Math.max(1, totalChapters)));
    // 契约里 offset 是**章节内字符偏移**，不是段落序号
    const offset = chapterOffsetOf(chapters.value, chapter, paragraph);
    const next: ReadingProgress = {
      book_id: bookId.value as ReadingProgress['book_id'],
      locator: { scheme: 'txt-offset', chapter, offset },
      furthest_locator: furthestOf(progress.value?.furthest_locator ?? null, chapter, offset),
      percent: Math.round(percent * 1000) / 1000,
      total_reading_ms: totalReadingMs(),
      last_opened_at: Date.now(),
      schema_version: 1,
    };
    await putProgress(next);
    progress.value = next;
    // 书架状态在 load() 里已经读过：每次落盘再读一遍，等于每 500ms 多一次事务。
    // updated_at 只影响「最近在读」的排序，一分钟刷一次就够——不必跟着每次翻页写。
    const now = Date.now();
    if (shelf.value && shelf.value.group !== 'finished' && now - shelf.value.updated_at > 60_000) {
      shelf.value = { ...shelf.value, updated_at: now };
      await putShelf(shelf.value);
    }
  }

  return {
    book,
    chapters,
    marks,
    notes,
    progress,
    loading,
    notFound,
    startChapter,
    startParagraph,
    pauseClock,
    resumeClock,
    load,
    addMark,
    removeMark,
    saveNote,
    saveProgress,
  };
}
