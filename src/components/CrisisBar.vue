<script setup lang="ts">
/**
 * 「情绪与自我」域的危机资源条（SPEC §2.1 P0-16）。
 *
 * 与"命中危机信号就只给资源"是两件事，不要合并：
 *  - 这里是**域级**的常驻提示：选了这个域的人，本来就是最难的那批人，
 *    他们不需要先写出某个词才被看见；
 *  - 信号互斥是**个例**的接管：写出"不想活"的人，那一刻要的不是书单。
 *
 * 四条硬约束（SPEC 定稿，不得改）：
 *  ① 不可关闭、不 toast、不折叠、滚动不移除；
 *  ② 条内**不写任何热线号码**——号码写死必然过期，过期比不展示更伤信任；
 *  ③ 文案用「不太好过」不用「状态很差」：他此刻不需要被下判断，需要被允许；
 *  ④ 「读书可以先放一放」必须留——这是本产品「不推销自己」的唯一硬证据。
 *
 * 组件根节点承接 `data-crisis-entry`（由使用方挂上）：全项目该配额恒为 2 个，
 * 用组件替代页面里那行小链接，而不是在它旁边再加一个。
 */
defineProps<{ compact?: boolean }>();
</script>

<template>
  <section class="crisis-bar" :class="{ compact }">
    <p class="crisis-bar-lead">
      如果你现在不太好过，读书可以先放一放。这里有可以立刻联系的心理援助资源。
    </p>
    <a class="crisis-bar-action" href="#/crisis">查看心理援助资源</a>
  </section>
</template>

<style scoped>
.crisis-bar {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 20px;
}

/* 无诊断记录时也显示，但压薄一点：那一屏的主角是"去填问卷"，不是这条 */
.crisis-bar.compact {
  padding: 8px 12px;
  margin-bottom: 16px;
}

.crisis-bar-lead {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1.7;
  margin: 0 0 8px;
}

.crisis-bar-action {
  display: inline-block;
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
  border-bottom: 1px solid var(--accent);
  padding-bottom: 1px;
}

.crisis-bar-action:hover {
  color: var(--accent-hover);
  border-bottom-color: var(--accent-hover);
}
</style>
