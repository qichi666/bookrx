/**
 * 读书框架内容（静态文案，构建期固定，运行时不做生成）。
 *
 * 设计原则：不做打卡、不做社交、不谈「一年 100 本」。
 * 目标只有一个——**让被推荐的那本书真的读完、真的用上**。
 * 内容依据：艾德勒《如何阅读一本书》的四层次（基础/检视/分析/主题）＋
 * 卡片笔记法的「一张卡片一个想法」＋ 费曼技巧的「讲不出来就是没懂」。
 */

export type BookKind = 'practical' | 'psychology' | 'classic';

export interface FrameworkStage {
  key: 'before' | 'during' | 'after';
  title: string;
  minutes: number;
  steps: string[];
}

export interface KindGuide {
  kind: BookKind;
  label: string;
  applies: string;
  points: string[];
  pitfall: string;
}

export const FRAMEWORK_STAGES: readonly FrameworkStage[] = [
  {
    key: 'before',
    title: '开读前：先想清楚要解决什么',
    minutes: 10,
    steps: [
      '用一句话写下你此刻的困境（就是你刚填问卷时说的那句）',
      '翻目录，只挑 3 章看起来最对症的，其余的先不读',
      '设定一个问题：读完我要能回答「____」',
    ],
  },
  {
    key: 'during',
    title: '读中：先看地图，再走路',
    minutes: 60,
    steps: [
      '先读序言、目录、最后一章，20 分钟建立整本书的地图',
      '每章一张卡片：一个观点 / 一条证据 / 我一个能用上的动作',
      '100 页法则：100 页还没抓到东西，允许弃读，不内疚',
    ],
  },
  {
    key: 'after',
    title: '读后：讲得出来才算读懂',
    minutes: 20,
    steps: [
      '用费曼法讲给一个没读过的人听，讲不清的地方就是没读懂的地方',
      '写 300 字：读完我会改变的一个具体动作',
      '14 天后回看：那个动作做了吗？没做，是书不对还是时机不对',
    ],
  },
];

export const KIND_GUIDES: readonly KindGuide[] = [
  {
    kind: 'practical',
    label: '实用类（沟通 / 习惯 / 效率）',
    applies: '有明确方法、能照着做的书',
    points: [
      '问题导向：只读能用的章节，不必从头读到尾',
      '每章必须产出一个动作，写下来才算读完',
      '读到方法就停下来试一次，比读完十本更有用',
    ],
    pitfall: '从头读到尾、划线很多、一个动作也没做。',
  },
  {
    kind: 'psychology',
    label: '心理类（情绪 / 关系 / 自我）',
    applies: '讲感受、讲关系、讲自我认识的书',
    points: [
      '慢读：每章读完，回想今天在哪个场景里看到了它',
      '允许对号入座，但别把自己钉在某个标签上',
      '读到难受的地方可以停，隔天再读',
    ],
    pitfall: '当小说快读，读完只剩一句结论，没留下自己的观察。',
  },
  {
    kind: 'classic',
    label: '经典（哲学 / 意义 / 古文）',
    applies: '需要背景知识、值得反复读的书',
    points: [
      '主题阅读：一次读 2–3 本相关的，互相对照',
      '先读导论与二手解读，再进原文，成本低一半',
      '一次只读一小段，读不懂就抄一遍',
    ],
    pitfall: '硬啃原文，三天放弃，然后认为自己不适合读书。',
  },
];

/**
 * 个人读书框架：三列表。
 * 这是整个功能的核心——书单会换，问题会变，只有这张表会一直长。
 */
export const NOTEBOOK_TEMPLATE = {
  title: '我的读书三列表',
  columns: ['我要解决的问题', '读的书', '一张卡片（观点 / 证据 / 我的动作）'] as const,
  example: {
    problem: '一开会轮到我说话就脑子空白',
    book: '关键对话',
    card: '观点：先讲事实再讲感受｜证据：作者把「事实」与「评判」分开举例｜动作：下次开会先说一句「我补充一个数据」',
  },
  cadence:
    '每周补一行，每季度回看一次：哪类问题反复出现，说明它没被解决，换本书或换个做法。',
};
