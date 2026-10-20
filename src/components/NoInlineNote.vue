<script setup lang="ts">
/**
 * 「结构性没有可直读正文」的域说明条（SPEC §2.1 P0-17）。
 *
 * 它要解释的是**一个永久缺口**，不是一次故障。所以：
 *  · 是「说明」不是「道歉」——禁止以道歉词开头（清单见 UIUX §9.2 硬规则四条）。
 *    道歉暗示我们在等一个永远不会来的修复版本，而这个缺口是版权结构决定的。
 *    **这里刻意不复述那份清单**：`copy-audit` 的 `copy/p017-empty` 扫的是全文，
 *    注释里列一遍就等于让门禁红一遍，而那是假警报。
 *  · 信息色（`--info`）不是警告色：这一步没有任何操作危险，用户只是需要知道
 *    "为什么每张卡上都是自备书源"。
 *  · 位置在推荐之前：等用户翻完 5 张卡再解释，他心里已经存了一个"这产品坏了"的判断。
 *
 * **与规格书的一处必要差异**：定稿文案里有「导入后就能读」，那需要有阅读器。
 * 当前没有（阅读器属 M2/M4，已冻结），照抄就等于承诺一件做不到的事，
 * 所以按能力门控换了一句等价但成立的话；定稿文案原样留在 `specCopy` 里，
 * 阅读器上线时把 `READER_AVAILABLE` 翻成 true 就会自动用它。
 */
import { computed } from 'vue';
import { READER_AVAILABLE } from '@/data/capabilities.js';

const props = defineProps<{ domainLabel: string }>();

/** SPEC §2.1 P0-17 定稿文案（逐字保留，不得改写）。 */
const SPEC_COPY =
  '这个方向的书基本都还在版权期内，正文需要你自己准备（EPUB 或 TXT），导入后就能读。下面的推荐和理由照常。';

const body = computed(() =>
  READER_AVAILABLE
    ? SPEC_COPY
    : // 当前能力下的同义说法：缺口相同，出路改成现在真实存在的那些
      `「${props.domainLabel}」这个方向的书基本都还在版权期内，本站不提供正文。下面每本书都给了找书的路径（微信读书 / 买一本 / 图书馆），推荐和理由照常。`,
);
</script>

<template>
  <details class="no-inline" data-no-inline-note open>
    <summary class="no-inline-summary">为什么这个方向的书都要你自己准备正文</summary>
    <p class="no-inline-body">{{ body }}</p>
  </details>
</template>

<style scoped>
.no-inline {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--info);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 20px;
}

.no-inline-summary {
  color: var(--info);
  font-size: 0.8125rem;
  cursor: pointer;
  list-style: none;
}

.no-inline-summary::-webkit-details-marker {
  display: none;
}

/* 折叠指示：小三角用边框画，不引图标库（图标只许 Lucide 单套，见 SPEC §4） */
.no-inline-summary::before {
  content: "";
  display: inline-block;
  width: 0;
  height: 0;
  margin-right: 8px;
  vertical-align: middle;
  border-left: 5px solid currentcolor;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform 0.15s ease;
}

.no-inline[open] .no-inline-summary::before {
  transform: rotate(90deg);
}

.no-inline-body {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1.75;
  margin: 8px 0 2px;
}
</style>
