import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserBook } from '@/contracts/book.js';

/**
 * 导入落库的失败回滚（storage/library.ts）。
 *
 * 缺陷背景：`putBook` 成功、写正文失败时没有任何回滚，
 * 库里留下「元数据在、章节不在」的半本书——书架上多一条打不开的记录，还占着配额。
 */

const calls: string[] = [];
let failOn: 'chapters' | 'file' | 'shelf' | null = null;

vi.mock('@/storage/db.js', () => ({
  putBook: async (b: UserBook) => {
    calls.push('putBook');
    if (failOn === 'file') return; // 元数据先成功，模拟后面的步骤失败
    return b;
  },
  putChapters: async () => {
    calls.push('putChapters');
    if (failOn === 'chapters') throw new Error('QuotaExceededError 模拟');
  },
  putFile: async () => {
    calls.push('putFile');
    if (failOn === 'file') throw new Error('写文件失败');
  },
  putShelf: async () => {
    calls.push('putShelf');
    if (failOn === 'shelf') throw new Error('写书架失败');
  },
  deleteBookData: async () => {
    calls.push('deleteBookData');
  },
}));

const { importAndStore } = await import('@/storage/library.js');

/** 一份最小的合法 TXT（够解析出章节即可） */
function txtFile(): File {
  const text = ['第一章 起点', '这里是正文。'.repeat(50), '第二章 继续', '更多正文。'.repeat(50)].join('\n');
  return new File([text], '测试书.txt', { type: 'text/plain' });
}

beforeEach(() => {
  calls.length = 0;
  failOn = null;
});

describe('importAndStore', () => {
  it('正常导入：元数据 / 章节 / 原文件 / 书架四步都写，不触发回滚', async () => {
    const r = await importAndStore(txtFile(), '测试书.txt');
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['putBook', 'putChapters', 'putFile', 'putShelf']);
  });

  it('写正文失败 → 回滚已写的元数据，并报存储失败', async () => {
    failOn = 'chapters';
    const r = await importAndStore(txtFile(), '测试书.txt');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_STORAGE_FAILED');
    expect(calls).toContain('deleteBookData');
  });

  it('写原文件失败 → 同样回滚，不留半本书', async () => {
    failOn = 'file';
    const r = await importAndStore(txtFile(), '测试书.txt');
    expect(r.ok).toBe(false);
    expect(calls).toContain('deleteBookData');
  });
});
