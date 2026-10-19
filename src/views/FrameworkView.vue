<script setup lang="ts">
/**
 * 读书框架页（/framework）。
 *
 * 三阶段 × 三类书 × 一张三列表。没有账号、没有打卡、没有通知：
 * 这一页只是「怎么把一本书读进生活里」的操作说明，看完就可以关掉去读。
 */
import { KIND_GUIDES, FRAMEWORK_STAGES, NOTEBOOK_TEMPLATE } from '@/data/reading-framework.js';
</script>

<template>
  <section class="framework">
    <h1>怎么读一本书</h1>
    <p class="lead">
      推荐只解决「读哪本」。这一页解决「读得进去、读得出来」。
      三步一共 90 分钟的准备与收尾，比多读十本更有用。
    </p>

    <ol class="stages">
      <li v-for="s in FRAMEWORK_STAGES" :key="s.key" class="stage">
        <div class="stage-head">
          <h2>{{ s.title }}</h2>
          <span class="minutes">约 {{ s.minutes }} 分钟</span>
        </div>
        <ul class="steps">
          <li v-for="(step, i) in s.steps" :key="i">{{ step }}</li>
        </ul>
      </li>
    </ol>

    <h2 class="section-title">三类书，三种读法</h2>
    <div v-for="g in KIND_GUIDES" :key="g.kind" class="kind">
      <h3>{{ g.label }}</h3>
      <p class="kind-applies">适用于：{{ g.applies }}</p>
      <ul class="steps">
        <li v-for="(p, i) in g.points" :key="i">{{ p }}</li>
      </ul>
      <p class="pitfall">常见的坑：{{ g.pitfall }}</p>
    </div>

    <h2 class="section-title">{{ NOTEBOOK_TEMPLATE.title }}</h2>
    <p class="lead">书单会换，问题会变，只有这张表会一直长。</p>
    <div class="table-wrap">
      <table class="notebook">
        <thead>
          <tr>
            <th v-for="c in NOTEBOOK_TEMPLATE.columns" :key="c">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ NOTEBOOK_TEMPLATE.example.problem }}</td>
            <td>{{ NOTEBOOK_TEMPLATE.example.book }}</td>
            <td>{{ NOTEBOOK_TEMPLATE.example.card }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="cadence">{{ NOTEBOOK_TEMPLATE.cadence }}</p>

    <footer class="framework-footer">
      <a href="#/">回去填问卷，拿一份书单</a>
      <a href="#/about">关于 BookRx</a>
    </footer>
  </section>
</template>

<style scoped>
.framework {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

h1 {
  font-size: 1.75rem;
  margin: 0 0 8px;
}

.lead {
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.stages {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
}

.stage {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.stage-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.stage-head h2 {
  font-size: 1.0625rem;
  margin: 0 0 8px;
}

.minutes {
  color: var(--text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.steps {
  color: var(--text-secondary);
  line-height: 1.8;
  margin: 0;
  padding-left: 20px;
}

.section-title {
  font-size: 1.25rem;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 6px;
  margin: 32px 0 16px;
}

.kind {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.kind h3 {
  font-size: 1rem;
  margin: 0 0 4px;
}

.kind-applies {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 0 0 8px;
}

.pitfall {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 8px 0 0;
}

.table-wrap {
  overflow-x: auto;
}

.notebook {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.notebook th,
.notebook td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.notebook th {
  background: var(--surface-brand);
  color: var(--text-secondary);
  font-weight: 590;
}

.cadence {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 12px 0 0;
}

.framework-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 32px;
}

.framework-footer a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}
</style>
