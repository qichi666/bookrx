import { describe, expect, it } from 'vitest';
import { hitFields, splitByKeyword } from '@/lib/highlight.js';

/**
 * 检索高亮最容易出的两个错：
 *  ① 把原文改掉（大写变小写、去掉空格）——用户会以为自己的笔记被系统改了；
 *  ② 用 `v-html` 拼标签——用户写进笔记的 `<img>` 会被当 HTML 执行。
 * 这里锁死第一条：切片拼回去必须逐字等于原文。
 */
describe('splitByKeyword', () => {
  it('切片拼回去逐字等于原文', () => {
    const text = '我以为我害怕的是发言本身，其实我害怕的是被看见。';
    const segs = splitByKeyword(text, '害怕');
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.filter((s) => s.hit)).toHaveLength(2);
  });

  it('大小写不敏感，但命中片段保留原始大小写', () => {
    const segs = splitByKeyword('Rumination 是反刍', 'rumination');
    expect(segs[0]).toEqual({ text: 'Rumination', hit: true });
    expect(segs.map((s) => s.text).join('')).toBe('Rumination 是反刍');
  });

  it('关键词为空时整段返回、不标记命中', () => {
    expect(splitByKeyword('一段话', '')).toEqual([{ text: '一段话', hit: false }]);
    expect(splitByKeyword('一段话', '   ')).toEqual([{ text: '一段话', hit: false }]);
  });

  it('未命中时整段返回，不会返回空数组', () => {
    expect(splitByKeyword('一段话', '不存在')).toEqual([{ text: '一段话', hit: false }]);
  });

  it('关键词覆盖整段时只有一个命中片段', () => {
    expect(splitByKeyword('害怕', '害怕')).toEqual([{ text: '害怕', hit: true }]);
  });

  it('空文本不会崩', () => {
    expect(splitByKeyword('', 'x')).toEqual([{ text: '', hit: false }]);
  });
});

describe('hitFields', () => {
  const row = { book_title: '被讨厌的勇气', quote: '一切烦恼都来自人际关系', note: '课题分离' };

  it('能分别指出命中在书名 / 引文 / 笔记', () => {
    expect(hitFields(row, '勇气')).toEqual(['书名']);
    expect(hitFields(row, '人际')).toEqual(['引文']);
    expect(hitFields(row, '分离')).toEqual(['笔记']);
    expect(hitFields(row, '的')).toEqual(['书名']);
  });

  it('空关键词不报命中', () => {
    expect(hitFields(row, ' ')).toEqual([]);
  });
});
