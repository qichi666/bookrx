// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { listAllNotes, listShelf, putNote, putShelf } from '@/storage/db.js';
import { putSession } from '@/storage/activity.js';
import { closeAll, DB_NAME } from '@/storage/connection.js';
import {
  DEFAULT_PROFILE_ID,
  activeProfileId,
  createProfile,
  dbNameFor,
  listProfiles,
  removeProfile,
  switchProfile,
} from '@/storage/profiles.js';

/**
 * F12 的验收核心：**切换档案后真的看不见上一个档案的数据**。
 *
 * 这里不用 mock 掉存储层——一旦 mock，测的就只是「我们的假实现自洽」，
 * 而 F12 最容易出的事故恰恰是「某个读写函数忘了过滤」。
 * 所以直接跑真的 IndexedDB（fake-indexeddb），走完整的分库读写。
 */

beforeEach(async () => {
  localStorage.clear();
  await closeAll();
});

describe('本地档案的库名映射', () => {
  it('默认档案沿用 v1 老库名，老用户升级后数据原地保留', () => {
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(dbNameFor(DEFAULT_PROFILE_ID)).toBe(DB_NAME);
    expect(dbNameFor(DEFAULT_PROFILE_ID)).toBe('bookrx');
  });

  it('不同档案落在不同库，同一 id 永远映射到同一个库', () => {
    const a = dbNameFor('pAAA');
    const b = dbNameFor('pBBB');
    expect(a).not.toBe(b);
    expect(a).not.toBe(DB_NAME);
    expect(dbNameFor('pAAA')).toBe(a);
  });

  it('切回默认档案时把 localStorage 里的键清掉', async () => {
    await switchProfile(DEFAULT_PROFILE_ID);
    expect(localStorage.getItem('bookrx.profile.active')).toBeNull();
  });
});

describe('切换档案的完整数据流', () => {
  it('书架 / 笔记 / 阅读会话在各档案之间互不可见，删档案会把整个库删掉', async () => {
    // ① 默认档案里放三样东西
    await putShelf({ book_id: 'core:a', group: 'want', updated_at: 1 });
    await putNote({
      note_id: 'n:a',
      book_id: 'core:a',
      body_markdown: '默认档案的笔记',
      created_at: 1,
      updated_at: 1,
    });
    await putSession({
      session_id: 's:a',
      book_id: 'core:a',
      day: '2026-11-09',
      started_at: 1,
      ended_at: 61_000,
      duration_ms: 60_000,
    });
    expect((await listShelf()).map((x) => x.book_id)).toEqual(['core:a']);

    // ② 新建并切到 B：三样都应该是空的
    const b = await createProfile('另一个人');
    expect((await listProfiles()).map((p) => p.profile_id)).toEqual([DEFAULT_PROFILE_ID, b.profile_id]);
    await switchProfile(b.profile_id);
    expect(activeProfileId()).toBe(b.profile_id);
    expect(await listShelf()).toEqual([]);
    expect(await listAllNotes()).toEqual([]);

    // ③ 档案清单不能跟着漂移：人在 B 里，仍能列出默认档案
    expect((await listProfiles()).map((p) => p.display_name)).toEqual(['我的书架', '另一个人']);
    await expect(removeProfile(b.profile_id)).rejects.toThrow('正在用');

    // ④ B 里写自己的数据，切回默认后互不串味
    await putShelf({ book_id: 'core:b', group: 'reading', updated_at: 2 });
    await putSession({
      session_id: 's:b',
      book_id: 'core:b',
      day: '2026-11-09',
      started_at: 2,
      ended_at: 62_000,
      duration_ms: 60_000,
    });
    await switchProfile(DEFAULT_PROFILE_ID);
    expect((await listShelf()).map((x) => x.book_id)).toEqual(['core:a']);
    expect((await listAllNotes()).map((n) => n.body_markdown)).toEqual(['默认档案的笔记']);

    // ⑤ 默认档案不许删
    await expect(removeProfile(DEFAULT_PROFILE_ID)).rejects.toThrow('默认档案');

    // ⑥ 删 B：清单里消失，对应的库也被真的删掉
    const bName = dbNameFor(b.profile_id);
    await removeProfile(b.profile_id);
    expect((await listProfiles()).map((p) => p.profile_id)).toEqual([DEFAULT_PROFILE_ID]);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).toContain(DB_NAME);
    expect(names).not.toContain(bName);
  });
});
