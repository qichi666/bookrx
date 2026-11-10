<script setup lang="ts">
/**
 * 可信度面板（F8）。
 *
 * 项目最硬的资产是「确定性可解释打分」——七因子万分制、六级全序、两条封顶。
 * 但这些一直只存在于代码里，界面上只有「高度契合 / 较为契合」两个词，
 * 于是从外面看，这个推荐和「随便列个书单」无法区分。
 *
 * 两条呈现纪律：
 *  ① **不暴露字段名**（problem.fit / availability 这类），全部用人话；
 *  ② 每个因子除得分条外还**给一句解释**（借鉴 Hikara 每条关系都附说明）：
 *     分数条只证明"算过"，句子才证明"算对了"。
 *
 * 另外必须诚实：覆盖率不足会压档，这件事要当场说，不能只在文档里写。
 */
import { computed } from 'vue';
import type { FactorId } from '@/contracts/enums.js';
import type { FactorFit } from '@/contracts/recommendation.js';
import { BASE_WEIGHTS_BP, FACTOR_IDS } from '@/domain/scoring/weights.js';
import { TIER_STRONG_MIN_BP, TIER_WORTH_MIN_BP } from '@/domain/scoring/tier.js';

const props = defineProps<{
  factors: Record<FactorId, FactorFit>;
  scoreBp: number;
  coverageBp: number;
  primaryHit: number;
}>();

const LABEL: Record<FactorId, string> = {
  problem: '接不接得上你的处境',
  difficulty: '难度合不合适',
  depth: '讲得够不够深',
  form: '是不是你想读的体例',
  length: '篇幅合不合适',
  readability: '好不好读进去',
  availability: '能不能拿到书',
};

/** 一句话解释：把 fit 的高低翻成"这对用户意味着什么"，不重复字段名 */
const EXPLAIN: Record<FactorId, (fit: number) => string> = {
  problem: (f) => (f >= 7000 ? '这本书的标注里有你选的那几个具体处境，而且权重不低。' : '它和你说的处境只沾一点边，或者只靠同域的相近标签命中。'),
  difficulty: (f) => (f >= 7000 ? '难度落在你这一屏选的范围里，不会一上来就被术语挡住。' : '比你现在想啃的难度偏了一档，读起来可能要多花点力气。'),
  depth: (f) => (f >= 7000 ? '它讲到了方法背后的原因，不只是给步骤。' : '偏操作或偏故事，看你这回想不想要这层解释。'),
  form: (f) => (f >= 7000 ? '体例和你选的一致：故事、方法、还是框架，没走偏。' : '体例和你选的不完全一样，可以当换个角度读。'),
  length: (f) => (f >= 7000 ? '预计时长和你给的时间预算能对上。' : '比你能匀出来的时间长，可能需要分几次读完。'),
  readability: (f) => (f >= 7000 ? '句子短、术语少，通勤路上也读得下去。' : '表达偏密，适合坐下来整段读。'),
  availability: (f) => (f >= 7000 ? '公版或容易拿到，不需要先四处找。' : '这本书要自备，链接只是给你一个去找的起点。'),
};

const rows = computed(() =>
  FACTOR_IDS.map((id) => {
    const f = props.factors[id];
    const fit = f?.fit_bp ?? 0;
    return {
      id,
      label: LABEL[id],
      fit,
      pct: Math.round(fit / 100),
      weight: Math.round((f?.weight_bp ?? BASE_WEIGHTS_BP[id]) / 100),
      explain: EXPLAIN[id](fit),
    };
  }),
);

const cappedByCoverage = computed(() => props.coverageBp < 6000);
const cappedByPrimary = computed(() => props.primaryHit === 0);
</script>

<template>
  <section class="fit">
    <h2 class="block-title">为什么是这本</h2>
    <p class="fit-lead">
      下面是固定的评分规则算出来的，同一个回答永远得到同一个结果。
      没有任何一步用到随机、时间，或者猜你profile。
    </p>

    <ul class="fit-list">
      <li v-for="r in rows" :key="r.id" class="fit-row">
        <div class="fit-head">
          <span class="fit-label">{{ r.label }}</span>
          <span class="fit-weight">权重 {{ r.weight }}%</span>
        </div>
        <div class="fit-track" role="img" :aria-label="`${r.label} 匹配度 ${r.pct}%`">
          <span class="fit-bar" :style="{ width: `${r.pct}%` }"></span>
        </div>
        <p class="fit-explain">{{ r.explain }}</p>
      </li>
    </ul>

    <div class="fit-foot">
      <p>
        七项按各自权重加总，得到 {{ scoreBp }} 分（满分 10000）。
        分档只看绝对阈值：{{ TIER_STRONG_MIN_BP }} 分以上「高度契合」，
        {{ TIER_WORTH_MIN_BP }} 分以上「较为契合」，其余「换个角度」。
      </p>
      <p v-if="cappedByCoverage" class="fit-caveat">
        这本书的标注覆盖不全（{{ coverageBp }} / 10000），所以档位被压到「值得一试」——
        不是它不合你，是我们对它的了解还不够，不该替它说满话。
      </p>
      <p v-if="cappedByPrimary" class="fit-caveat">
        它没有正面命中你指定的主诉，所以最多只给「换个角度」。
        主诉是你在问卷里亲口指定的，规则不会替你改。
      </p>
    </div>
  </section>
</template>

<style scoped>
.fit {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.fit-lead {
  margin: 0 0 14px;
  font-size: 0.75rem;
  line-height: 1.85;
  color: var(--text-muted);
}

.fit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fit-row {
  margin-bottom: 14px;
}

.fit-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.fit-label {
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.fit-weight {
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.fit-track {
  height: 6px;
  margin: 5px 0 4px;
  border-radius: 3px;
  background: var(--tier-track);
  overflow: hidden;
}

.fit-bar {
  display: block;
  height: 100%;
  background: var(--accent);
}

.fit-explain {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.7;
  color: var(--text-muted);
}

.fit-foot {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
}

.fit-foot p {
  margin: 0 0 6px;
  font-size: 0.6875rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.fit-caveat {
  color: var(--warn);
}
</style>
