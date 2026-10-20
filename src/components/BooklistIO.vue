<script setup lang="ts">
/**
 * 结果页底部的「带走这份书单」。
 *
 * 为什么不只做一个下载按钮：书单的价值是**给别人看**——「我按这个描述被推荐了这些」。
 * 所以导出按钮旁边必须有一条通往导入页的路径，否则收到文件的人不知道拿它干什么。
 *
 * 导出的是 `diagnosis`（用户的选择），不是分数：分数换个书库版本就会变，
 * 存下来只会让收件人以为"对方看到的分数"是可比的（它不可比，也不该被比较）。
 */
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ComputedResult } from '@/engine/result.js';
import { booklistFilename, buildBooklist, serializeBooklist } from '@/engine/booklist.js';
import { downloadText } from '@/lib/file-io.js';

const props = defineProps<{ diagnosis: Diagnosis; result: ComputedResult }>();

function onExport(): void {
  const file = buildBooklist(props.diagnosis, props.result);
  downloadText(booklistFilename(file.exported_at), serializeBooklist(file));
}
</script>

<template>
  <section class="booklist-io">
    <h2 class="block-title">把这份书单带走</h2>
    <p class="io-note">
      导出一个 JSON 文件：里面是<strong>你刚才做的选择</strong>和这 5 本书，不含任何身份信息。
      别人可以在自己的浏览器里打开它，按他自己那份书库重算一遍。
    </p>
    <div class="io-actions">
      <button type="button" class="btn-ghost" @click="onExport">导出书单（.json）</button>
      <a class="io-link" href="#/booklist">导入别人的书单</a>
    </div>
  </section>
</template>

<style scoped>
.booklist-io {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border-soft);
}

.io-note {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin: 0 0 12px;
}

.io-note strong {
  font-weight: 600;
  color: var(--text-primary);
}

.io-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.io-link {
  font-size: 0.8125rem;
  color: var(--accent);
  text-decoration: none;
}

.io-link:hover {
  text-decoration: underline;
}
</style>
