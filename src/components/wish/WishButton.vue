<script setup lang="ts">
/**
 * 「加入想读」按钮（F5）。
 *
 * 存在的理由只有一个：66/68 本核心书是外链书，点开就跳去豆瓣，
 * **旅程在跳转那一刻结束**，用户手里什么都没留下。想读是把人留下来的唯一锚点。
 *
 * 三条边界：
 *  ① 已经在读 / 已读完的书不覆盖——用户对"我在读什么"的判断优先于按钮；
 *  ② 本机库打不开（隐私模式）时不假装成功，按钮禁用并说明；
 *  ③ 不写任何账号信息，只往 `shelf` 表写一行。
 */
import { onMounted, ref } from 'vue';
import { deleteShelf, getBook, getShelf, putShelf } from '@/storage/db.js';

const props = defineProps<{ bookId: string; compact?: boolean }>();

const state = ref<'loading' | 'none' | 'want' | 'other' | 'blocked'>('loading');
const busy = ref(false);

async function refresh(): Promise<void> {
  try {
    const [s, local] = await Promise.all([getShelf(props.bookId), getBook(props.bookId)]);
    if (!s) state.value = 'none';
    // 本机导入的书的 shelf 行就是"它在书架里"的唯一凭证，取消按钮不能删它：
    // 删掉之后书还在 IndexedDB 里，但书架上看不到、也找不回来（只能重新导入）。
    // 所以本机书一律显示"已在书架"，交给书架页去做移动 / 删除。
    else if (s.group === 'want' && !local) state.value = 'want';
    else state.value = 'other';
  } catch {
    state.value = 'blocked';
  }
}

async function toggle(): Promise<void> {
  if (busy.value || state.value === 'other' || state.value === 'blocked') return;
  busy.value = true;
  try {
    if (state.value === 'want') {
      await deleteShelf(props.bookId);
      state.value = 'none';
    } else {
      const now = Date.now();
      const prev = await getShelf(props.bookId);
      await putShelf({
        book_id: props.bookId,
        group: 'want',
        updated_at: now,
        // 排到队尾：sort_order 只排"想读"内部的次序，不参与推荐
        sort_order: typeof prev?.sort_order === 'number' ? prev.sort_order : Date.now(),
        from: props.bookId.startsWith('core:') ? 'recommend' : 'import',
      });
      state.value = 'want';
    }
  } catch {
    state.value = 'blocked';
  } finally {
    busy.value = false;
  }
}

onMounted(refresh);

const LABEL = {
  loading: '…',
  none: '加入想读',
  want: '已加入想读',
  other: '已在书架',
  blocked: '本机库打不开',
} as const;
</script>

<template>
  <button
    type="button"
    class="wish"
    :class="[`wish-${state}`, { compact }]"
    :disabled="busy || state === 'other' || state === 'blocked'"
    :aria-pressed="state === 'want'"
    @click="toggle"
  >
    {{ LABEL[state] }}
  </button>
</template>

<style scoped>
.wish {
  /* 375px 下这是书库卡片的主要动作，热区不能比拇指小 */
  min-height: 44px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
}

.compact {
  min-height: 44px;
  padding: 2px 10px;
  font-size: 0.75rem;
}

.wish:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.wish-want {
  background: var(--surface-brand);
  border-color: var(--accent);
  color: var(--accent);
}

.wish-other,
.wish-blocked {
  color: var(--text-disabled);
  border-color: var(--border);
  cursor: default;
}
</style>
