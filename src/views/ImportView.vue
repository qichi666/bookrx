<script setup lang="ts">
/**
 * 导入页（P0-8 的界面侧）。
 *
 * 失败态按错误码分流，每类给**一个具体动作**——历史上这里最容易退化成
 * "导入失败，请重试"，而用户真正需要知道的是"是文件坏了，还是我们的问题"。
 * 文案表在 `engine/import/index.ts` 的 `IMPORT_ERROR_TEXT`，本页只查表不写分支。
 *
 * `E_IMPORT_ENCODING` 是唯一有"下一步"的错误：允许用户手动指定编码重试。
 * 其余错误重试同一个文件没有意义，所以直接引导换文件。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import ImportDrop from '@/components/import/ImportDrop.vue';
import { IMPORT_ERROR_TEXT, type ImportOptions } from '@/engine/import/index.js';
import type { ImportError, ImportErrorCode, ImportWarning } from '@/contracts/import.js';
import type { TextEncoding } from '@/engine/import/txt.js';
import { importAndStore } from '@/storage/library.js';
import { humanSize } from '@/lib/file-io.js';

const router = useRouter();

type Phase = 'idle' | 'working' | 'done' | 'error';

const phase = ref<Phase>('idle');
const error = ref<ImportError | null>(null);
const warnings = ref<ImportWarning[]>([]);
const doneTitle = ref('');
const doneChapters = ref(0);
const doneId = ref('');
const fileName = ref('');
const lastFile = ref<File | null>(null);
const message = ref('');

const ENCODINGS: Array<{ value: TextEncoding; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gb18030', label: 'GB18030（老中文）' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
];

/** 警告一律「说明 + 影响」，不给"知道了"这种什么都没说的按钮 */
const WARNING_TEXT: Record<ImportWarning['kind'], string> = {
  'font-obfuscated': '这本书的字体做了子集化保护，正文照常可读，只是字体不是你熟悉的那个。',
  'metadata-degraded': '书名或作者在文件里缺失，已用文件名代替，你可以在书架上认出来。',
  'fixed-layout-unsupported': '这是固定版式（像 PDF 一样排版）的书，正文能读，但图片位置和原版不同。',
  'chapterize-fallback': '没找到可靠的章节标题，已按长度平均切分。目录里的章名会是"第 N 节"。',
};

const errorText = (code: ImportErrorCode): { title: string; action: string } => IMPORT_ERROR_TEXT[code];

async function handleFile(file: File): Promise<void> {
  lastFile.value = file;
  fileName.value = file.name;
  phase.value = 'working';
  message.value = '';
  error.value = null;
  warnings.value = [];

  const r = await importAndStore(file, file.name);
  if (r.ok) {
    phase.value = 'done';
    doneTitle.value = r.book.title;
    doneChapters.value = r.chapters;
    doneId.value = r.book.book_id;
    warnings.value = r.warnings;
    return;
  }
  error.value = r.error;
  phase.value = 'error';
}

async function retryWithEncoding(enc: TextEncoding): Promise<void> {
  const f = lastFile.value;
  if (!f) return;
  phase.value = 'working';
  const options: ImportOptions = { forcedEncoding: enc };
  const r = await importAndStore(f, f.name, options);
  if (r.ok) {
    phase.value = 'done';
    doneTitle.value = r.book.title;
    doneChapters.value = r.chapters;
    doneId.value = r.book.book_id;
    warnings.value = r.warnings;
    return;
  }
  error.value = r.error;
  phase.value = 'error';
}

function reset(): void {
  phase.value = 'idle';
  error.value = null;
  warnings.value = [];
  message.value = '';
  lastFile.value = null;
}

function openReader(): void {
  void router.push(`/reader/${doneId.value}`);
}
</script>

<template>
  <section class="importer">
    <header class="imp-head">
      <h1 class="imp-title">导入一本书</h1>
      <p class="imp-sub">
        支持 EPUB 与 TXT。文件在你自己的浏览器里解析，正文、进度、划线和笔记都只存在本机。
        本站不提供任何书的下载，也不破解 DRM。
      </p>
    </header>

    <p v-if="message" class="line-warn">{{ message }}</p>

    <ImportDrop v-if="phase === 'idle'" @pick="handleFile" @error="(m) => (message = m)" />

    <p v-else-if="phase === 'working'" class="state">
      正在解析「{{ fileName }}」… 大一点的书要等几秒，别关页面。
    </p>

    <div v-else-if="phase === 'done'" class="state state-ok">
      <p class="state-title">「{{ doneTitle }}」已放进书架</p>
      <p class="state-body">
        {{ doneChapters > 0 ? `已切出 ${doneChapters} 章。` : '' }}
        默认归在「想读」组，第一次打开后会转到「在读」。
      </p>
      <ul v-if="warnings.length" class="warn-list">
        <li v-for="w in warnings" :key="w.kind">{{ WARNING_TEXT[w.kind] }}</li>
      </ul>
      <div class="actions">
        <button type="button" class="btn-primary" @click="openReader">现在就读</button>
        <router-link class="btn-ghost" to="/library">去书架</router-link>
        <button type="button" class="btn-ghost" @click="reset">再导入一本</button>
      </div>
    </div>

    <div v-else-if="error" class="state state-bad">
      <p class="state-title">{{ errorText(error.code).title }}</p>
      <p class="state-body">{{ errorText(error.code).action }}</p>
      <p class="state-detail">{{ error.detail }}</p>

      <div v-if="error.recovery === 'choose-encoding'" class="enc">
        <p class="enc-label">手动指定编码：</p>
        <button
          v-for="e in ENCODINGS"
          :key="e.value"
          type="button"
          class="btn-ghost enc-btn"
          @click="retryWithEncoding(e.value)"
        >{{ e.label }}</button>
      </div>

      <div class="actions">
        <button type="button" class="btn-primary" @click="reset">换一个文件</button>
      </div>
    </div>

    <p class="foot-note">
      文件名：{{ fileName || '尚未选择' }}
      <span v-if="lastFile">· {{ humanSize(lastFile.size) }}</span>
    </p>
  </section>
</template>

<style scoped>
.importer {
  max-width: 720px;
  margin: 0 auto;
}

.imp-title {
  margin: 0 0 6px;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.imp-sub {
  margin: 0 0 16px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.9;
}

.state {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.9;
}

.state-title {
  margin: 0 0 6px;
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.state-body {
  margin: 0 0 8px;
}

.state-detail {
  margin: 0 0 10px;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-muted);
  word-break: break-all;
}

.state-ok {
  border-left: 2px solid var(--accent);
  padding-left: 12px;
}

.state-bad {
  border-left: 2px solid var(--danger);
  padding-left: 12px;
}

.warn-list {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.8;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.enc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.enc-label {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.enc-btn {
  min-height: 32px;
  padding: 2px 10px;
  font-size: 0.75rem;
  text-decoration: none;
}

.line-warn {
  margin: 0 0 10px;
  font-size: 0.75rem;
  color: var(--warn);
}

.foot-note {
  margin-top: 12px;
  font-size: 0.6875rem;
  color: var(--text-muted);
}
</style>
