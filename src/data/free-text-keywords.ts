import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * 第 4 屏自由文本 → 困境标签的命中词典。
 *
 * 只做**已有标签的命中**，不造新标签（造新标签没有标注支撑，是凭空打分）。
 * 命中词也是 `user_phrase`（契约：自由文本里的命中片段，逐字保留）。
 * 键清单以合同层 `ProblemTagId` 为准——少一个键不会有报错，只会让那条标签
 * 永远无法被自由文本命中，所以这里用类型强制全键覆盖。
 */
export const FREE_TEXT_KEYWORDS: Readonly<Record<ProblemTagId, readonly string[]>> = {
  'low-mood': ['低落', '提不起劲', '难过', '高兴不起来'],
  anxiety: ['焦虑', '担心', '紧张', '害怕'],
  rumination: ['翻来覆去', '反刍', '想个不停', '钻牛角尖'],
  'self-doubt': ['自我怀疑', '觉得自己不行', '不自信', '否定自己'],
  emptiness: ['空虚', '没意思', '没意义', '空落落'],
  'emotional-outburst': ['发火', '暴躁', '易怒', '忍不住发脾气'],
  'communication-block': ['说不出口', '开不了口', '不敢说', '表达不出来'],
  'frequent-conflict': ['吵架', '冲突', '一说话就吵', '争执'],
  'intimacy-distance': ['亲近', '亲密', '距离感', '走不近'],
  'people-pleasing': ['讨好', '不敢拒绝', '怕别人不高兴', '委屈自己'],
  'family-origin': ['原生家庭', '家里', '父母', '爸妈'],
  loneliness: ['孤独', '没人懂', '孤单', '没朋友'],
  'speaking-block': ['发言', '当众说话', '开会说话', '脑子一片空白', '一片空白'],
  'evaluation-anxiety': ['被评价', '被挑错', '怕批评', '考核'],
  burnout: ['耗竭', 'burnout', '累垮', '身心俱疲'],
  'meaning-loss': ['没意义', '为什么工作', '迷茫', '没有价值'],
  'management-delegation': ['带团队', '管理', '授权', '放不下手'],
  'promotion-stuck': ['升职', '晋升', '涨薪', '职业停滞'],
  procrastination: ['拖延', '拖着', '拖到最后一刻'],
  'cant-persist': ['坚持不下来', '半途而废', '三天打鱼'],
  'attention-scatter': ['分心', '专注', '注意力', '静不下心'],
  'time-losing': ['浪费时间', '时间不够', '刷手机', '时间没了'],
  'action-paralysis': ['行动不起来', '迈不出', '光想不做', '启动困难'],
  'decision-difficulty': ['选择困难', '纠结', '做不了决定', '拿不定主意'],
  'cognitive-bias': ['偏见', '想错了', '直觉错', '被带偏'],
  'cant-see-whole': ['片面', '全局', '看不全', '只看到局部'],
  'info-overload': ['信息过载', '看不完', '信息太多', '无从下手'],
  'judgment-distortion': ['判断', '误判', '被忽悠', '轻信'],
  'career-confusion': ['职业', '换行', '转行', '不知道做什么工作'],
  'age-anxiety': ['年龄', '三十岁', '三十而立', '来不及了'],
  'loss-and-farewell': ['失去', '告别', '去世', '分手', '离别'],
  'identity-rebuild': ['重新开始', '身份', '我是谁', '从头再来'],
  'big-choice': ['大决定', '重大选择', '要不要', '两难'],
};
