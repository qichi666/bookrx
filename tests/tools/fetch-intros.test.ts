import { describe, expect, it } from 'vitest';
// @ts-expect-error —— 纯 JS 工具，无类型声明；测的是它的运行时行为
import { parseDetail } from '../../tools/fetch-intros.mjs';

/**
 * 详情页解析。测它是因为踩过一次：目录的正则多要求了一个 `<div class="bd">`，
 * 而真实结构里没有这个子块——于是 `toc` **永远是空字符串，脚本照样报成功**。
 * 这类"静默恒空"的字段比报错危险得多：下游只会觉得"这些书恰好没有目录"。
 *
 * 所以这里断言的不是"能解析"，而是「**非空**」：
 * 结构变化时测试必须红，而不是安静地降级成空串。
 */
const PAGE = `
<html><body>
<span property="v:itemreviewed">被讨厌的勇气</span>
<div class="related_info">
  <h2>内容简介</h2>
  <div class="intro">
    <p>这是短版，只有几百字，末尾会带（展开全部）。</p>
  </div>
  <a href="javascript:void(0)">(展开全部)</a>
  <div class="intro" style="display:none">
    <p>这是完整版简介的第一段。<br/>第二段讲阿德勒的核心主张：一切烦恼皆来自人际关系。</p>
    <p>第三段补充作者的写作背景，篇幅明显长于短版。</p>
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
  it('取最长的那段简介，不是前面那段截断版', () => {
    const r = parseDetail(PAGE);
    expect(r.intro).toContain('完整版简介的第一段');
    expect(r.intro).toContain('一切烦恼皆来自人际关系');
    expect(r.intro).not.toContain('展开全部');
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

  it('没有简介的页面返回空串（下游据此记账，不会当成成功）', () => {
    const r = parseDetail('<html><body><span property="v:itemreviewed">X</span></body></html>');
    expect(r.intro).toBe('');
    expect(r.toc).toBe('');
  });

  it('换行结构被保留（目录要靠换行分章）', () => {
    const r = parseDetail(PAGE);
    expect(r.toc.split('\n').filter((s: string) => s.trim()).length).toBeGreaterThan(1);
  });
});
