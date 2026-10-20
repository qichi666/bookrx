<script setup lang="ts">
/**
 * 书架页的「带走我的划线」区块。
 *
 * 为什么这件事必须有出口：划线与笔记只存在本机 IndexedDB。换台电脑、清一次站点数据，
 * 它们就永久消失，而且没有任何服务器副本可恢复。对这个产品里「读了很多但记不住」
 * 的那批用户，积累的划线正是最不该丢的东西。
 *
 * 不做云同步（ADR-002 的论证仍然成立：后端成本与「不上报」的承诺冲突）。
 * 导出是「80% 收益 / 5% 成本」的那个方案：一个 JSON 文件，用户自己保管。
 */
import { ref } from 'vue';
import { downloadText } from '@/lib/file-io.js';
import { parseNotesFile } from '@/domain/notes-file.js';
import { exportNotes, importNotes } from '@/storage/notes-transfer.js';

const busy = ref(false);
const message = ref('');
const failed = ref('');
const input = ref<HTMLInputElement | null>(null);

function stamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function onExport(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  failed.value = '';
  try {
    const { file, orphanBooks } = await exportNotes();
    const count = file.books.reduce((n, b) => n + b.highlights.length, 0);
    if (count === 0) {
      message.value = '本机还没有划线或笔记，暂时没有可导出的内容。';
      return;
    }
    downloadText(`bookrx-notes-${stamp()}.json`, JSON.stringify(file, null, 2));
    message.value =
      `已导出 ${file.books.length} 本书的 ${count} 条划线/笔记。` +
      (orphanBooks > 0 ? `其中 ${orphanBooks} 本已不在书架上，笔记照样带上了。` : '');
  } catch {
    failed.value = '导出失败：浏览器不让我们读取本机存储。试试关掉隐私模式再导出。';
  } finally {
    busy.value = false;
  }
}

async function onPick(e: Event): Promise<void> {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (file === undefined) return;
  busy.value = true;
  message.value = '';
  failed.value = '';
  try {
    const text = await file.text();
    const parsed = parseNotesFile(text);
    if (!parsed.ok) {
      failed.value = `这个文件读不了：${parsed.error.detail}。`;
      return;
    }
    const report = await importNotes(parsed.value);
    const parts = [`新增 ${report.added} 条`];
    if (report.skipped > 0) parts.push(`跳过 ${report.skipped} 条已存在的`);
    if (report.missing.length > 0) {
      // 不假装匹配：锚点是相对章节的偏移，书不同则偏移毫无意义
      parts.push(`有 ${report.missing.length} 本不在本机书架（${report.missing.slice(0, 3).join('、')}），已跳过`);
    }
    message.value = `导入完成：${parts.join('，')}。`;
  } catch {
    failed.value = '导入中断：写入本机存储时出错，已导入的部分保留。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="notes">
    <h2 class="notes-title">带走我的划线</h2>
    <p class="notes-note">
      划线和笔记只存在这台机器上。换电脑或清站点数据就没了，所以这里给一个出口：
      导出一份 JSON 自己保管，换设备时再导入回来。
    </p>
    <div class="notes-actions">
      <button type="button" class="notes-btn" :disabled="busy" @click="onExport">
        {{ busy ? '处理中…' : '导出笔记' }}
      </button>
      <button type="button" class="notes-btn" :disabled="busy" @click="input?.click()">
        从文件导入
      </button>
      <input
        ref="input"
        class="notes-input"
        type="file"
        accept="application/json,.json"
        @change="onPick"
      />
    </div>
    <p v-if="message" class="notes-msg">{{ message }}</p>
    <p v-if="failed" class="notes-fail">{{ failed }}</p>
  </section>
</template>

<style scoped>
.notes {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}

.notes-title {
  margin: 0 0 6px;
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.notes-note {
  margin: 0 0 10px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.notes-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.notes-btn {
  min-height: 36px;
  padding: 4px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.notes-btn:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.notes-input {
  display: none;
}

.notes-msg {
  margin: 10px 0 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.notes-fail {
  margin: 10px 0 0;
  font-size: 0.8125rem;
  color: var(--danger);
}
</style>
