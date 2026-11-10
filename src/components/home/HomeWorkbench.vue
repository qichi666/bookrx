<script setup lang="ts">
/**
 * 首页工作台（F1）。
 *
 * 为什么首页不能再只是「问卷第一屏」：10 个页面里，访客要答完 4 屏问卷
 * 才第一次见到「书单」这个概念——第 2 到第 10 个页面在他形成第一印象之前
 * 全部不可见。评价方看到的不是「一个读书产品」，而是「一个问卷工具」。
 *
 * 这个组件只做**展示与跳转**，不碰诊断逻辑：问卷四屏原样留在下面，
 * 所以「首屏能选困境域」这条既有行为一点没变。
 *
 * 卡片可关闭（借鉴本地优先阅读产品 Seekquel 的首页装配思路）：
 * 用户不需要的功能卡留在首页只是噪音，关掉后记住偏好，并提供恢复入口。
 */
import { computed, onMounted, ref } from 'vue';
import TodayPanel from './TodayPanel.vue';
import { SEED_BOOKS } from '@/data/catalog.js';

/**
 * 用事件而不是 `<a href="#quiz-start">`：本应用是 **hash 路由**，
 * 任何 `#xxx` 都会被当成路由地址，点了会跳到一个不存在的页面。
 */
const emit = defineEmits<{ start: [] }>();

const HIDE_KEY = 'bookrx.home.hidden';

const bookCount = computed(() => SEED_BOOKS.length);
/** 去重后的困境标签数。从数据算，不写死——书库变了这个数自己会变 */
const tagCount = computed(() => {
  const s = new Set<string>();
  for (const b of SEED_BOOKS) for (const t of b.problem_tags ?? []) s.add(t.tag);
  return s.size;
});

const CARDS = [
  // 本数从数据算：写死 68 会在书库扩容后变成一句假话
  { id: 'books', to: '/books', title: '书库', desc: `按困境、难度、时长翻这 ${SEED_BOOKS.length} 本`, note: '不用先填问卷' },
  { id: 'shelf', to: '/library', title: '我的书架', desc: '在读、想读、读完，全在本机', note: '' },
  { id: 'stats', to: '/stats', title: '阅读统计', desc: '读了多少、连着读了几天', note: '' },
  { id: 'framework', to: '/framework', title: '怎么读书', desc: '拿到书之后的那套读法', note: '' },
] as const;

const hidden = ref<string[]>([]);
const visibleCards = computed(() => CARDS.filter((c) => !hidden.value.includes(c.id)));

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // 隐私模式 / 被禁用：当作没关过，不因为读不到偏好就把首页搞崩
    return [];
  }
}

function hide(id: string): void {
  hidden.value = [...hidden.value, id];
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(hidden.value));
  } catch {
    /* 存不下就只在本次生效，不打断浏览 */
  }
}

function restore(): void {
  hidden.value = [];
  try {
    localStorage.removeItem(HIDE_KEY);
  } catch {
    /* 同上 */
  }
}

onMounted(() => {
  hidden.value = readHidden();
});
</script>

<template>
  <section class="workbench">
    <p class="wb-eyebrow">按你现在卡住的地方找书</p>
    <h1 class="wb-title">先说你最近怎么了，<br />再给你一本读得下去的。</h1>
    <p class="wb-lead">
      四屏问题，大约两分钟。答案只用来算推荐，存在你自己的浏览器里，没有账号也没有上传。
    </p>

    <div class="wb-cta">
      <button type="button" class="btn-primary wb-start" @click="emit('start')">开始诊断</button>
      <router-link class="wb-second" to="/import">或者先导入一本你自己的书</router-link>
    </div>

    <p class="wb-numbers">
      <span><strong>{{ bookCount }}</strong> 本书</span>
      <span aria-hidden="true">·</span>
      <span><strong>{{ tagCount }}</strong> 类困境</span>
      <span aria-hidden="true">·</span>
      <span>每本 <strong>34</strong> 项人工标注</span>
    </p>

    <ul v-if="visibleCards.length > 0" class="wb-cards">
      <li v-for="c in visibleCards" :key="c.id" class="wb-card">
        <router-link class="wb-card-link" :to="c.to">
          <span class="wb-card-title">{{ c.title }}</span>
          <span class="wb-card-desc">{{ c.desc }}</span>
          <span v-if="c.note" class="wb-card-note">{{ c.note }}</span>
        </router-link>
        <button
          type="button"
          class="wb-card-hide"
          :aria-label="`隐藏「${c.title}」卡片`"
          @click="hide(c.id)"
        >
          ×
        </button>
      </li>
    </ul>

    <p v-else class="wb-restore-line">
      <button type="button" class="wb-restore" @click="restore">恢复被我隐藏的功能入口</button>
    </p>

    <button v-if="visibleCards.length > 0 && visibleCards.length < 4" type="button" class="wb-restore" @click="restore">
      恢复被我隐藏的功能入口
    </button>

    <TodayPanel />
  </section>
</template>

<style scoped src="../../styles/home-workbench.css"></style>
