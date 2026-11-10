<script setup lang="ts">
/**
 * 读后回执（F6）。
 *
 * 为什么必须有：项目有一套精密的七因子打分与三档阈值，却**没有任何
 * "这本书到底有没有用"的信号**——8000 / 6000 这两个阈值是拍出来的，
 * 没有校准数据。Reading Well 那组常被引用的 92% / 97% / 90% 效果数字，
 * 全部来自读后调查，不是来自推荐算法本身。
 *
 * 三条交互纪律：
 *  ① 三选一 + 一句可选理由，10 秒内做完，不打断阅读；
 *  ② **同一本只问一次**：已经回执过就静默关闭，不反复弹；
 *  ③ 可以一键关掉且不阻塞退出——回执是邀请，不是关卡。
 */
import { onMounted, ref } from 'vue';
import { getReceipt, putReceipt } from '@/storage/activity.js';
import type { ReceiptVerdict } from '@/storage/activity.js';

const props = defineProps<{ bookId: string; bookTitle: string }>();
const emit = defineEmits<{ close: [] }>();

const visible = ref(false);
const chosen = ref<ReceiptVerdict | 'none'>('none');
const reason = ref('');
const saved = ref(false);

const OPTIONS: { value: ReceiptVerdict; label: string; hint: string }[] = [
  { value: 'useful', label: '有用', hint: '确实接住了我当时的处境' },
  { value: 'neutral', label: '一般', hint: '读了，但没帮上太多' },
  { value: 'unfit', label: '不适合我', hint: '方向不太对，或读不下去' },
];

onMounted(async () => {
  try {
    const existing = await getReceipt(props.bookId);
    if (existing) return;
    visible.value = true;
  } catch {
    // 本机库打不开：不弹、不报错，更不能把阅读器卡住
  }
});

async function submit(): Promise<void> {
  if (chosen.value === 'none') return;
  try {
    await putReceipt({
      book_id: props.bookId,
      verdict: chosen.value,
      created_at: Date.now(),
      ...(reason.value.trim() ? { reason: reason.value.trim() } : {}),
    });
    saved.value = true;
  } catch {
    saved.value = true; // 存不下也别反复缠着用户
  }
  emit('close');
}

function later(): void {
  emit('close');
}
</script>

<template>
  <div v-if="visible && !saved" class="receipt" role="dialog" aria-label="读后回执">
    <div class="rc-sheet">
      <p class="rc-eyebrow">读完了</p>
      <h2 class="rc-title">《{{ bookTitle }}》对你有用吗？</h2>
      <p class="rc-lead">
        一句就够。这个回答只存在这台设备上，不上传，也不影响以后给你推荐别的书。
      </p>

      <div class="rc-options">
        <button
          v-for="o in OPTIONS"
          :key="o.value"
          type="button"
          class="rc-option"
          :class="{ on: chosen === o.value }"
          :aria-pressed="chosen === o.value"
          @click="chosen = o.value"
        >
          <span class="rc-option-label">{{ o.label }}</span>
          <span class="rc-option-hint">{{ o.hint }}</span>
        </button>
      </div>

      <label class="rc-reason">
        <span class="rc-reason-label">想多说一句（可跳过）</span>
        <input v-model="reason" type="text" maxlength="120" placeholder="比如：第三章那个练习真的用上了" />
      </label>

      <div class="rc-actions">
        <button type="button" class="btn-primary" :disabled="chosen === 'none'" @click="submit">记下</button>
        <button type="button" class="rc-later" @click="later">以后再说</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: var(--surface-sunken);
  background: color-mix(in srgb, var(--text-primary) 30%, transparent);
}

.rc-sheet {
  width: 100%;
  max-width: 480px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-pop);
}

.rc-eyebrow {
  margin: 0 0 4px;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.rc-title {
  font-family: var(--font-book);
  font-size: 1.125rem;
  margin: 0 0 6px;
  color: var(--text-primary);
}

.rc-lead {
  margin: 0 0 14px;
  font-size: 0.75rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.rc-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rc-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid var(--border-control);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rc-option.on {
  border-color: var(--accent);
  background: var(--surface-brand);
}

.rc-option-label {
  font-size: 0.875rem;
}

.rc-option-hint {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.rc-reason {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
}

.rc-reason-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.rc-reason input {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border-control);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
}

.rc-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.rc-later {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  text-decoration: underline;
}
</style>
