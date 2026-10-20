<script setup lang="ts">
/**
 * 本地轻反馈条（P2-3）。
 *
 * 三个边界写在界面上，而不是只写在文档里：
 *  ① 只记在设备上（localStorage），不上传；
 *  ② 不带用户说过的话（只存档位计数）；
 *  ③ 想带走可以主动导出一次 JSON。
 *
 * 文案刻意不用"帮助我们改进"——那是站在我们立场说话。用户没有义务帮产品改进，
 * 他只需要知道点了会发生什么。
 */
import { ref } from 'vue';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import { downloadFeedback, recordFeedback, type Verdict } from '@/engine/feedback.js';

const props = defineProps<{
  diagnosis: Diagnosis;
  tiers: { strong: number; worth: number; explore: number };
}>();

const said = ref<Verdict | null>(null);

function say(v: Verdict): void {
  recordFeedback(props.diagnosis, props.tiers, v);
  said.value = v;
}
</script>

<template>
  <section class="feedback">
    <p class="feedback-q">
      {{ said === null ? '这一页对你有用吗？' : said === 'useful' ? '记下了。' : '记下了，谢谢你说实话。' }}
    </p>
    <div v-if="said === null" class="feedback-actions">
      <button type="button" class="btn-ghost" @click="say('useful')">有用</button>
      <button type="button" class="btn-ghost" @click="say('not-useful')">没什么用</button>
    </div>
    <p class="feedback-note">
      只记在这台设备上，不上传、不带你说过的话。想带走这份记录可以
      <a href="#" @click.prevent="downloadFeedback()">导出一份 JSON</a>。
    </p>
  </section>
</template>

<style scoped>
.feedback {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}

.feedback-q {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0 0 8px;
}

.feedback-actions {
  display: flex;
  gap: 8px;
}

.feedback-note {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 8px 0 0;
}

.feedback-note a {
  color: var(--accent);
}
</style>
