import type { ProblemDomain, ProblemTagId, ThemeTagId } from '@/contracts/enums.js';

/**
 * 问卷数据（SPEC §6.1 四屏）。
 *
 * **选项文字是产品资产**：它同时是 S1 回引与命中依据的素材，
 * `user_phrase` 逐字取自这里的 `label`，改措辞等于改用户看到的诊断回放。
 */

/** 第 1 屏：六大困境域。 */
export interface DomainOption {
  domain: ProblemDomain;
  label: string;
}

export const DOMAIN_OPTIONS: readonly DomainOption[] = [
  { domain: 'emotion', label: '情绪与自我' },
  { domain: 'relationship', label: '关系' },
  { domain: 'work', label: '工作与意义' },
  { domain: 'habits', label: '习惯与行动' },
  { domain: 'thinking', label: '认知与思考' },
  { domain: 'transition', label: '人生转折' },
];

/** 第 2 屏：按域给困境标签选项。label 就是用户的原词。 */
export interface TagOption {
  tag: ProblemTagId;
  label: string;
}

export const TAG_OPTIONS: Readonly<Record<ProblemDomain, readonly TagOption[]>> = {
  emotion: [
    { tag: 'low-mood', label: '情绪一直很低落' },
    { tag: 'anxiety', label: '总是担心，停不下来' },
    { tag: 'rumination', label: '一件事翻来覆去地想' },
    { tag: 'self-doubt', label: '总觉得自己不行' },
    { tag: 'emptiness', label: '干什么都没劲' },
    { tag: 'emotional-outburst', label: '容易发火，事后又后悔' },
  ],
  relationship: [
    { tag: 'communication-block', label: '话到嘴边说不出口' },
    { tag: 'frequent-conflict', label: '和人一开口就吵' },
    { tag: 'intimacy-distance', label: '越亲近越说不了心里话' },
    { tag: 'people-pleasing', label: '不敢拒绝，怕别人不高兴' },
    { tag: 'family-origin', label: '家里的事还在影响我' },
    { tag: 'loneliness', label: '觉得没人真的懂我' },
  ],
  work: [
    { tag: 'speaking-block', label: '开会发言就紧张空白' },
    { tag: 'evaluation-anxiety', label: '特别怕被评价、被挑错' },
    { tag: 'burnout', label: '上班耗竭，缓不过来' },
    { tag: 'meaning-loss', label: '不知道工作为了什么' },
    { tag: 'management-delegation', label: '带人太累，什么都自己扛' },
    { tag: 'promotion-stuck', label: '卡在原地升不上去' },
  ],
  habits: [
    { tag: 'procrastination', label: '重要的事一直拖着' },
    { tag: 'cant-persist', label: '什么事都坚持不下来' },
    { tag: 'attention-scatter', label: '注意力散，没法专注' },
    { tag: 'time-losing', label: '时间不知不觉就没了' },
    { tag: 'action-paralysis', label: '想了很多，就是不动' },
  ],
  thinking: [
    { tag: 'decision-difficulty', label: '小事也要纠结很久' },
    { tag: 'cognitive-bias', label: '事后才发现自己想错了' },
    { tag: 'cant-see-whole', label: '只看得见眼前这一块' },
    { tag: 'info-overload', label: '信息太多，越看越乱' },
    { tag: 'judgment-distortion', label: '判断总被带偏' },
  ],
  transition: [
    { tag: 'career-confusion', label: '不知道该往哪走' },
    { tag: 'age-anxiety', label: '对年龄越来越焦虑' },
    { tag: 'loss-and-farewell', label: '刚经历失去或告别' },
    { tag: 'identity-rebuild', label: '原来的自我拆掉了' },
    { tag: 'big-choice', label: '面前有个大决定' },
  ],
};

/** 第 3 屏：5 组 chip，全部可跳。取值即 Diagnosis.answers 的字段值。 */
export interface ChipGroup {
  id: 'time_budget' | 'difficulty_pref' | 'urgency' | 'form_pref' | 'depth_pref';
  prompt: string;
  options: readonly { value: string; label: string }[];
}

export const STEP3_GROUPS: readonly ChipGroup[] = [
  {
    id: 'time_budget',
    prompt: '这次读书的时间大概有',
    options: [
      { value: '10m', label: '10 分钟' },
      { value: '30m', label: '半小时' },
      { value: '1h+', label: '一小时以上' },
    ],
  },
  {
    id: 'difficulty_pref',
    prompt: '对难度的期待',
    options: [
      { value: 'easy', label: '越轻松越好' },
      { value: 'challenge', label: '有点挑战可以' },
      { value: 'hard', label: '不怕难啃' },
    ],
  },
  {
    id: 'urgency',
    prompt: '多快想见效',
    options: [
      { value: '3w', label: '这三周就要用' },
      { value: '1m', label: '一个月内' },
      { value: 'none', label: '不着急' },
    ],
  },
  {
    id: 'form_pref',
    prompt: '更想读哪种',
    options: [
      { value: 'story', label: '一个人的故事' },
      { value: 'method', label: '一套方法' },
      { value: 'framework', label: '完整框架' },
    ],
  },
  {
    id: 'depth_pref',
    prompt: '想懂到哪一层',
    options: [
      { value: 'howto', label: '具体怎么做就行' },
      { value: 'howto_why', label: '做法加为什么' },
      { value: 'why', label: '底层原理' },
    ],
  },
];

/** 第 2 屏同屏追问的话术（Diagnosis.include_heavy 只豁免 EX-terminal，见契约）。 */
export const INCLUDE_HEAVY_PROMPT = '这类内容里有涉及临终或丧亲的，要不要一起看？';

/** 各困境域对应的主题标签（库外路径 D 的检索词，与打分词表不是一套）。 */
export const DOMAIN_THEME_TAGS: Readonly<Record<ProblemDomain, readonly ThemeTagId[]>> = {
  emotion: ['self-awareness', 'emotion', 'anxiety-tag'],
  relationship: ['intimacy', 'boundaries', 'repair'],
  work: ['efficiency', 'feedback', 'managing-up'],
  habits: ['habits', 'motivation', 'reading-method'],
  thinking: ['decision', 'bias', 'critical-thinking'],
  transition: ['career-change', 'meaning-of-life', 'freedom'],
};
