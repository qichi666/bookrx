import type { ExternalSuggestion } from '@/contracts/external.js';

/**
 * 库外候选种子（SPEC §7.3 路径 D）。
 *
 * **不落库、不打分**：这些条目没有 book_id / score_bp / tier——
 * 不是字段留空，是这些字段对它们根本不成立（见契约 external.ts）。
 * reason ≤120 字、禁引打分口径（`assertExternal` 运行时兜底）。
 * M0.5 换数据生产流程后由 `catalog/` 正式清单替换。
 */
export const EXTERNAL_SEEDS: readonly ExternalSuggestion[] = [
  {
    kind: 'external_suggestion',
    title: '伯恩斯新情绪疗法',
    author_display: ['大卫·伯恩斯'],
    domain: 'emotion',
    tags: ['emotion', 'anxiety-tag', 'self-awareness'],
    reason: '把情绪低落时脑子里那些自动冒出来的念头逐条写下来再核对，是它最出名的做法，正好对着情绪反复这件事。',
    where_to_find: '微信读书 / 京东、当当纸质版',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '不原谅也没关系',
    author_display: ['皮特·沃克'],
    domain: 'relationship',
    tags: ['family-origin-tag', 'emotion', 'repair'],
    reason: '专门写给童年家庭里受过伤的人：先承认伤是真的，再给一套自己在家就能做的落地练习。',
    where_to_find: '微信读书 / 有声书在喜马拉雅',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '沟通的艺术',
    author_display: ['罗纳德·B·阿德勒'],
    domain: 'relationship',
    tags: ['conflict', 'intimacy', 'feedback'],
    reason: '教科书式的沟通全景：知觉、情绪、倾听各一章，例子多，适合想把关系问题拆开看的人。',
    where_to_find: '微信读书 / 图书馆普遍有藏',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '搞定',
    author_display: ['戴维·艾伦'],
    domain: 'habits',
    tags: ['efficiency', 'habits'],
    reason: '把所有悬在脑子里的事清空到一张外部清单，再按场景执行——对时间整块流失的人特别对症。',
    where_to_find: '微信读书 / 京东、当当纸质版',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '事实',
    author_display: ['汉斯·罗斯林'],
    domain: 'thinking',
    tags: ['bias', 'critical-thinking'],
    reason: '用十个人类最容易搞错世界真相的本能，教你怎么用数据纠正直觉——判断总被带偏时读它很提神。',
    where_to_find: '微信读书 / 图书馆普遍有藏',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '内在动机',
    author_display: ['爱德华·德西'],
    domain: 'work',
    tags: ['motivation', 'meaning-of-life'],
    reason: '四十年自我决定论研究讲透一件事：靠奖惩撑着的状态走不远，自主感才是持续的燃料。',
    where_to_find: '微信读书 / 京东、当当纸质版',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '你的生命有什么可能',
    author_display: ['古典'],
    domain: 'transition',
    tags: ['career-change', 'meaning-of-life', 'freedom'],
    reason: '生涯规划视角，把"不知道往哪走"拆成兴趣、能力、价值三张牌，配大量真实转型案例。',
    where_to_find: '微信读书 / 京东、当当纸质版',
    badge: '未入库',
  },
  {
    kind: 'external_suggestion',
    title: '幸福的陷阱',
    author_display: ['路斯·哈里斯'],
    domain: 'emotion',
    tags: ['emotion', 'self-awareness', 'anxiety-tag'],
    reason: '接纳承诺疗法（ACT）的入门书：不跟念头搏斗，把力气腾出来做看重的事，方法可以当晚就试。',
    where_to_find: '微信读书 / 京东、当当纸质版',
    badge: '未入库',
  },
];
