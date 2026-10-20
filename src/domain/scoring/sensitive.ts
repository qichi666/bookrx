import type { ContentWarning, ProblemDomain } from '@/contracts/enums.js';

/**
 * 敏感内容的过滤规则表（数据驱动）。
 *
 * 为什么要有这张表：原来这段逻辑是写死的两个 `if`，而且只在「情绪与自我」一个域生效。
 * 后果很具体——一个刚失去亲人、在「关系」域里选了「越轻松越好」的用户，
 * 会拿到一本通篇讲丧亲的书，而他刚刚明确说了想轻松一点。
 *
 * 现在的约定：**代码只执行数据**，新增一个域只加一行，不改判断逻辑。
 * 判断逻辑里唯一保留的分支是「能不能被用户的开关豁免」——这是语义，不是配置。
 *
 * 三条纪律：
 *  ① `EX-trauma`（自杀 / 性暴力）**永不可豁免**。开关文案只写了「沉重」，
 *     没写「血腥」，承诺范围必须等于放行范围。
 *  ② `EX-terminal`（临终 / 丧亲）可被「我能接受沉重内容」豁免，**仅限声明可豁免的域**。
 *  ③ 不在这里加「排除轻喜剧 / 幽默」这类规则：那是靠 `content_warning` 判断不出来的，
 *     硬塞只能靠标题关键词猜，猜错的代价是用户拿到一本更不对的书。要做得先有字段。
 */
export interface SensitiveRule {
  domain: ProblemDomain;
  /** 命中的内容警告 */
  warnings: readonly ContentWarning[];
  /** 命中后返回的过滤码（必须是 `FILTER_RULES` 里的一个） */
  code: 'EX-trauma' | 'EX-terminal';
  /** 用户勾了「我能接受沉重内容」时是否放行 */
  waivable: boolean;
  /** 写清楚为什么，不然下一个人只会看到一行"规则 2" */
  rationale: string;
}

export const SENSITIVE_RULES: readonly SensitiveRule[] = [
  {
    domain: 'emotion',
    warnings: ['suicide', 'sexual_abuse'],
    code: 'EX-trauma',
    waivable: false,
    rationale: '情绪低谷 + 明确要「越轻松」时，创伤题材可能加重负担；这个开关不能豁免它。',
  },
  {
    domain: 'emotion',
    warnings: ['grief', 'terminal_illness'],
    code: 'EX-terminal',
    waivable: true,
    rationale: '情绪低谷时先避开临终丧亲；用户明确说自己能接受沉重内容就放行。',
  },
  {
    domain: 'relationship',
    warnings: ['suicide', 'sexual_abuse'],
    code: 'EX-trauma',
    waivable: false,
    rationale: '关系困境里同样可能出现刚经历丧失的人，创伤题材不做豁免。',
  },
  {
    domain: 'relationship',
    warnings: ['grief', 'terminal_illness'],
    code: 'EX-terminal',
    waivable: true,
    rationale: '关系域里选「越轻松」的人，可能刚失去亲近的人；这条此前漏掉了。',
  },
];

/**
 * 「人生转折」刻意不在表里。那一域的书本身大量围绕丧失、告别、身份重建展开，
 * 按警告剔除会把池子清空——用户会得到"一本都没有"，比拿到一本沉重的书更糟。
 * 这不是遗漏，是权衡；要改它，先有新字段能区分「讲丧失」与「以丧失为背景」。
 */

export function rulesFor(domain: ProblemDomain): readonly SensitiveRule[] {
  return SENSITIVE_RULES.filter((r) => r.domain === domain);
}
