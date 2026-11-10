/**
 * 困境标签之间的关系表（F15 书籍关系图谱的数据基础）。
 *
 * 为什么是**人工裁定**而不是从共现统计自动生成：
 * 共现只说明「两本书都标了这两个标签」，不说明这两个困境之间有任何阅读顺序。
 * 自动生成的"关系"十有八九是噪声，而一首处方上说「读完这本再读那本」是要负责任的。
 * 所以关系类型与方向由人定，**选哪本书**才交给下面这个纯函数去算。
 *
 * 三种关系：
 *  - `next`   递进：先把这一层处理完，下一层才读得进去；
 *  - `pair`   互补：两本各解决一半，合起来才完整；
 *  - `tension` 对照：同一件事的两条相反解法，读第二本是为了比较，不是照做。
 */

export type RelationKind = 'next' | 'pair' | 'tension';

export interface TagRelation {
  from: string;
  to: string;
  kind: RelationKind;
  /** 一句话说清这两层困境为什么接得上。写在卡片上，不写术语。 */
  why: string;
}

/** 关系类型在界面上的说法。放数据层，不放进 domain——那是文案，不是逻辑。 */
export const RELATION_LABEL: Record<RelationKind, string> = {
  next: '接着读',
  pair: '补另一半',
  tension: '换一种解法',
};

export const TAG_RELATIONS: readonly TagRelation[] = [
  { from: 'anxiety', to: 'rumination', kind: 'next', why: '先停住担心，再处理那件被反复回想的事' },
  { from: 'rumination', to: 'self-doubt', kind: 'next', why: '翻来覆去想到最后，通常落在"是不是我不行"' },
  { from: 'self-doubt', to: 'people-pleasing', kind: 'next', why: '觉得自己不够好的人，往往先在关系里让步' },
  { from: 'people-pleasing', to: 'intimacy-distance', kind: 'next', why: '一直不敢拒绝，亲近时就说不出口' },
  { from: 'speaking-block', to: 'evaluation-anxiety', kind: 'next', why: '开口前的那片空白，来自怕被挑错' },
  { from: 'evaluation-anxiety', to: 'self-doubt', kind: 'pair', why: '一个修"别人怎么看我"，一个修"我怎么看我"' },
  { from: 'low-mood', to: 'emptiness', kind: 'next', why: '情绪先沉下去，然后才是"什么都没意思"' },
  { from: 'emptiness', to: 'meaning-loss', kind: 'next', why: '提不起劲的下一个问题，是不知道为了什么' },
  { from: 'burnout', to: 'meaning-loss', kind: 'next', why: '耗竭之后才会追问：这么干到底图什么' },
  { from: 'meaning-loss', to: 'career-confusion', kind: 'next', why: '意义的问题最后会落到"那我要往哪走"' },
  { from: 'promotion-stuck', to: 'career-confusion', kind: 'pair', why: '一个问"为什么升不上去"，一个问"要不要换方向"' },
  { from: 'career-confusion', to: 'big-choice', kind: 'next', why: '方向想清楚之后，那个大决定才做得下去' },
  { from: 'big-choice', to: 'identity-rebuild', kind: 'next', why: '选完之后，旧的那个自己往往就装不下了' },
  { from: 'identity-rebuild', to: 'loss-and-farewell', kind: 'pair', why: '拆掉的自我，常常和一次失去同时发生' },
  { from: 'loneliness', to: 'intimacy-distance', kind: 'next', why: '没人懂的另一面，是没法让人真的靠近' },
  { from: 'communication-block', to: 'frequent-conflict', kind: 'pair', why: '一个是不说，一个是一说就吵，中间是同一道墙' },
  { from: 'frequent-conflict', to: 'emotional-outburst', kind: 'next', why: '吵起来之后，才轮到"发完火又后悔"' },
  { from: 'family-origin', to: 'intimacy-distance', kind: 'next', why: '家里那套相处方式，会被带进亲密关系' },
  { from: 'procrastination', to: 'action-paralysis', kind: 'pair', why: '一个是拖着不做，一个是想清楚了也不动' },
  { from: 'action-paralysis', to: 'cant-persist', kind: 'pair', why: '开不了头和坚持不下来，卡的是两处' },
  { from: 'cant-persist', to: 'time-losing', kind: 'pair', why: '坚持不下来的人，时间通常也不知道去哪了' },
  { from: 'attention-scatter', to: 'info-overload', kind: 'pair', why: '注意力散，和输入太多，会互相加重' },
  { from: 'info-overload', to: 'cant-see-whole', kind: 'next', why: '信息吃得越多，越看不见整体' },
  { from: 'cant-see-whole', to: 'judgment-distortion', kind: 'pair', why: '只看眼前一块，判断自然会被带偏' },
  { from: 'cognitive-bias', to: 'judgment-distortion', kind: 'pair', why: '一个讲偏差是怎么来的，一个讲它怎么骗过你' },
  { from: 'decision-difficulty', to: 'big-choice', kind: 'next', why: '小决定都纠结，大决定就更需要一套办法' },
  { from: 'management-delegation', to: 'cant-see-whole', kind: 'next', why: '什么都自己扛，是因为只看得见自己手上那块' },
  { from: 'self-doubt', to: 'cognitive-bias', kind: 'tension', why: '一本让你重建自我评价，一本让你怀疑自己的判断' },
  { from: 'low-mood', to: 'meaning-loss', kind: 'tension', why: '先修情绪还是先找意义，两本书给的顺序相反' },
  { from: 'cant-persist', to: 'action-paralysis', kind: 'tension', why: '一本讲怎么坚持，一本讲为什么不开始' },
  { from: 'age-anxiety', to: 'career-confusion', kind: 'tension', why: '一种解法是赶时间，一种是换赛道' },
];
