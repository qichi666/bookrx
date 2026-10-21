import { describe, expect, it } from 'vitest';
// @ts-expect-error —— 纯 JS 工具，无类型声明；测的是它的运行时行为
import { parseDetail } from '../../tools/fetch-intros.mjs';

/**
 * 详情页解析。测它是因为踩过两个坑，两个都不报错：
 *
 * ① 目录正则多要求了一个 `<div class="bd">` 子块，真实结构里没有——`toc` 永远空串；
 * ② `class="intro"` 不是内容简介专属，作者简介用同一个类。按"取最长"挑，
 *    作者生平常常更长，于是《被讨厌的勇气》拿到的"简介"是作者的学历与著作列表。
 *
 * 所以这里断言的不是"能解析"，而是「**取对了哪一段**」：
 * 结构变化时必须红，而不是安静地换成一段同样能读、但不是我们想要的话。
 */
const PAGE = `
<html><body>
<span property="v:itemreviewed">被讨厌的勇气</span>
<div class="related_info">
  <h2>内容简介</h2>
  <div class="indent" id="link-report">
    <span class="short">
      <div class="intro"><p>这是内容简介的短版，讲阿德勒的核心主张：一切烦恼皆来自人际关系。</p></div>
    </span>
    <span class="all hidden">
      <div class="intro"><p>这是内容简介的全文，比短版多出作者写作背景与成书过程，末尾还有一个章节导览。</p></div>
    </span>
  </div>
</div>
<div class="related_info">
  <h2>作者简介</h2>
  <div class="indent">
    <span class="short">
      <div class="intro"><p>岸见一郎，哲学家，1956 年生于京都，主要研究阿德勒心理学。</p></div>
    </span>
    <span class="all hidden">
      <div class="intro"><p>岸见一郎，哲学家，1956 年生于京都。高中时便以哲学为志向，进入大学后屡次到老师府上进行辩论，京都大学研究生院文学研究系博士课程满期退学。1989 年起致力于研究专业哲学和阿德勒心理学，主要活动领域是阿德勒心理学及古代哲学的执笔与演讲。</p></div>
    </span>
  </div>
</div>
<div class="related_info">
  <h2>目录</h2>
  <div class="indent" id="dir_26369699_short">短目录…（更多）</div>
  <div class="indent" id="dir_26369699_full" style="display:none">
    第一夜　否认　<p>我们的不幸是谁的错</p><br/>
    第二夜　关系　<p>一切烦恼都来自人际关系</p>
  </div>
</div>
</body></html>`;

describe('豆瓣详情页解析（parseDetail）', () => {
  it('拿到的是内容简介，不是作者简介（作者简介更长，取最长会挑错）', () => {
    const r = parseDetail(PAGE);
    expect(r.intro).toContain('内容简介的全文');
    expect(r.intro).not.toContain('岸见一郎');
    expect(r.intro_source).toBe('link-report');
  });

  it('内容简介自己也有 span.short 时，区块边界不能被它切掉（否则会静默走 fallback）', () => {
    // 这一条守的是一个真实踩过的坑：拿 `span.short` 当作者简介的起点，
    // 结果内容块当场被切空，然后 fallback 到全局取最长——常常取到作者生平。
    const r = parseDetail(PAGE);
    expect(r.intro_source).toBe('link-report');
    expect(r.intro.length).toBeGreaterThan(20);
  });

  it('目录必须解析出内容（非空），不能静默返回空串', () => {
    const r = parseDetail(PAGE);
    expect(r.toc.length).toBeGreaterThan(10);
    expect(r.toc).toContain('第一夜');
    expect(r.toc).not.toContain('短目录');
  });

  it('书名以详情页为准，用于发现抓错页', () => {
    expect(parseDetail(PAGE).page_title).toBe('被讨厌的勇气');
  });

  it('没有简介的页面返回空串并标 none（下游据此记账，不会当成成功）', () => {
    const r = parseDetail('<html><body><span property="v:itemreviewed">X</span></body></html>');
    expect(r.intro).toBe('');
    expect(r.toc).toBe('');
    expect(r.intro_source).toBe('none');
  });

  it('结构不认识时标 fallback 而不是假装正常（降级要可见）', () => {
    const r = parseDetail('<html><div class="intro">一段没有 link-report 包裹的内容简介，长度过二十字。</div></html>');
    expect(r.intro).toContain('没有 link-report');
    expect(r.intro_source).toBe('fallback');
  });

  it('换行结构被保留（目录要靠换行分章）', () => {
    const r = parseDetail(PAGE);
    expect(r.toc.split('\n').filter((s: string) => s.trim()).length).toBeGreaterThan(1);
  });
});
