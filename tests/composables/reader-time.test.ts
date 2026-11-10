import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useReaderSession } from '@/composables/useReaderSession.js';
import { listSessions } from '@/storage/activity.js';
import { closeAll } from '@/storage/connection.js';

/**
 * 阅读时长的累计口径。
 *
 * 缺陷背景：`totalReadingMs()` 曾经同时读「已落盘的 `progress.total_reading_ms`」
 * 和「本会话的 accumulated + live」，而 `saveProgress` 又把两者之和写回进度。
 * 于是第二段阅读会把第一段再算一遍：读 10 分钟显示成 25 分钟，
 * 且膨胀是二次的（每翻一次页就多叠一层）。
 *
 * 这里不 mock 存储层——要测的正是「读进度」和「写会话」两条路径之间的相互作用。
 */

let clock = 1_700_000_000_000;
let nowSpy: ReturnType<typeof vi.spyOn>;

const MIN = 60_000;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
  await closeAll();
});

afterEach(() => {
  nowSpy.mockRestore();
});

describe('阅读时长累计', () => {
  it('同一次阅读里多次落盘，不会把前一段时长重复相加', async () => {
    const s = useReaderSession(ref('user:time-a'));
    s.resumeClock();

    clock += 5 * MIN;
    await s.saveProgress(0, 0, 0, 1);
    expect(s.progress.value?.total_reading_ms).toBeGreaterThanOrEqual(5 * MIN - 50);
    expect(s.progress.value?.total_reading_ms).toBeLessThanOrEqual(5 * MIN + 50);

    clock += 3 * MIN;
    await s.saveProgress(0, 0, 0, 1);
    // 旧实现这里是 13 分钟（5 + 8），正确值是 8 分钟
    expect(s.progress.value?.total_reading_ms).toBeGreaterThanOrEqual(8 * MIN - 50);
    expect(s.progress.value?.total_reading_ms).toBeLessThanOrEqual(8 * MIN + 50);
  });

  it('切后台挂一小时不算阅读，回来只累计真实读的那两段', async () => {
    const s = useReaderSession(ref('user:time-b'));
    s.resumeClock();

    clock += 4 * MIN;
    s.pauseClock();
    clock += 60 * MIN; // 后台挂着，不计时
    s.resumeClock();
    clock += 2 * MIN;

    await s.saveProgress(0, 0, 0, 1);
    expect(s.progress.value?.total_reading_ms).toBeGreaterThanOrEqual(6 * MIN - 50);
    expect(s.progress.value?.total_reading_ms).toBeLessThanOrEqual(6 * MIN + 50);
  });

  it('flushSession 按增量写会话，多次 flush 的总和等于真实阅读时长', async () => {
    const s = useReaderSession(ref('user:time-c'));
    s.resumeClock();

    clock += 5 * MIN;
    await s.flushSession();
    clock += 3 * MIN;
    await s.flushSession();

    const sessions = (await listSessions()).filter((x) => x.book_id === 'user:time-c');
    expect(sessions).toHaveLength(2);
    const sum = sessions.reduce((n, x) => n + x.duration_ms, 0);
    expect(sum).toBeGreaterThanOrEqual(8 * MIN - 100);
    expect(sum).toBeLessThanOrEqual(8 * MIN + 100);
  });

  it('不足 20 秒不落会话：翻一下目录就退出不该算「今天读了」', async () => {
    const s = useReaderSession(ref('user:time-d'));
    s.resumeClock();
    clock += 5_000;
    await s.flushSession();

    const sessions = (await listSessions()).filter((x) => x.book_id === 'user:time-d');
    expect(sessions).toHaveLength(0);
  });
});
