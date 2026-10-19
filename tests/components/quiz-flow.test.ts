// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import QuizView from '@/views/QuizView.vue';

/**
 * 问卷流的关键行为（真实 DOM，不 grep 模板）：
 * ① 多选 ≥2 时追问主诉；② 未指定主诉时「下一步」禁用；
 * ③ 只选 1 项时不追问；④ 三选上限。
 */

function findBtn(w: ReturnType<typeof mount>, text: string) {
  const btn = w.findAll('button').find((b) => b.text().trim() === text);
  if (!btn) throw new Error(`找不到按钮「${text}」—— 扫描对象为空，属未验证`);
  return btn;
}

async function gotoStep2(w: ReturnType<typeof mount>): Promise<void> {
  await findBtn(w, '情绪与自我').trigger('click');
  await findBtn(w, '下一步').trigger('click');
}

describe('QuizView 四屏流', () => {
  it('首屏就有读书框架入口（用户反馈「找不到」的直接回归）', () => {
    // 本文件的 mount 不带 router，router-link 解析不了就会渲染成空——
    // 断言会拿到空列表，看起来像"入口不存在"。用一个渲染成 <a> 的 stub 兜住。
    const w = mount(QuizView, {
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="`#${to}`"><slot /></a>' },
        },
      },
    });
    const links = w.findAll('a').map((a) => a.attributes('href'));
    expect(links).toContain('#/framework');
    expect(w.text()).toContain('读书框架');
  });

  it('第 1 屏未选域时下一步禁用', () => {
    const w = mount(QuizView);
    expect(findBtn(w, '下一步').attributes('disabled')).toBeDefined();
  });

  it('多选 2 项后追问主诉；未指定前下一步禁用', async () => {
    const w = mount(QuizView);
    await gotoStep2(w);
    await findBtn(w, '情绪一直很低落').trigger('click');
    // 只选 1 项：不追问，可直接下一步
    expect(w.text()).not.toContain('哪个最急');
    await findBtn(w, '总是担心，停不下来').trigger('click');
    expect(w.text()).toContain('哪个最急');
    expect(findBtn(w, '下一步').attributes('disabled')).toBeDefined();
  });

  it('选定主诉后放行', async () => {
    const w = mount(QuizView);
    await gotoStep2(w);
    await findBtn(w, '情绪一直很低落').trigger('click');
    await findBtn(w, '总是担心，停不下来').trigger('click');
    await findBtn(w, '情绪一直很低落').trigger('click'); // 追问里选它为主诉
    expect(findBtn(w, '下一步').attributes('disabled')).toBeUndefined();
  });

  it('第 3 屏全部可跳（不选也能下一步）', async () => {
    const w = mount(QuizView);
    await gotoStep2(w);
    await findBtn(w, '情绪一直很低落').trigger('click');
    await findBtn(w, '下一步').trigger('click');
    expect(w.text()).toContain('读书偏好');
    await findBtn(w, '下一步').trigger('click');
    expect(w.text()).toContain('第 4 / 4 屏');
  });

  it('标签选择上限 3 项：第 4 项不可再点', async () => {
    const w = mount(QuizView);
    await gotoStep2(w);
    for (const label of ['情绪一直很低落', '总是担心，停不下来', '一件事翻来覆去地想']) {
      await findBtn(w, label).trigger('click');
    }
    const fourth = w.findAll('button').find((b) => b.text().trim() === '总觉得自己不行');
    expect(fourth?.attributes('disabled')).toBeDefined();
  });
});
