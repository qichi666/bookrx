<script setup lang="ts">
/**
 * 我的书架：在读 / 想读 / 读完 三组。
 *
 * 这个页面只做三件事，多一件都不做：**列出来、点进去读、删掉**。
 * 特意没有的：搜索、评分、标签云、算法推荐位——书架是用户自己的东西，
 * 加推荐位等于把「我想读什么」变成「系统想让我读什么」。
 *
 * 数据全在本机 IndexedDB，没有账号也没有同步：所以这里的每一行
 * 都必须是"这台机器上真的有一份文件"，否则点进去必然白屏。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ShelfCard from '@/components/shelf/ShelfCard.vue';
import NotesTransfer from '@/components/shelf/NotesTransfer.vue';
import { buildShelf, emptyGroups, SHELF_ORDER, shelfStats, type ShelfGroups } from '@/domain/shelf.js';
import { buildWishlist, type WishItem } from '@/domain/wishlist.js';
import { humanSize } from '@/lib/file-io.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { deleteShelf, listBooks, listProgress, listShelf, putShelf, quota } from '@/storage/db.js';
import { installSample, SAMPLE_BOOKS } from '@/data/samples.js';
import { moveToShelf, removeBook, SHELF_LABEL } from '@/storage/library.js';
import type { ShelfGroup } from '@/storage/db.js';

const router = useRouter();
const groups = ref<ShelfGroups>(emptyGroups());
const loading = ref(true);
const failed = ref('');
const confirming = ref<string | null>(null);
const usage = ref<{ usage: number; quota: number } | null>(null);
const sampleBusy = ref(false);
const sampleError = ref('');
/** 想读队列里来自核心书库的外链书：本机没有正文，单独列一块，不混进 ShelfCard */
const wishlist = ref<WishItem[]>([]);

const stats = computed(() => shelfStats(groups.value));
/** 顺序只有 `SHELF_ORDER` 一份，这里不再另写数组字面量（漏改一组时页面不会报错，只会少一段） */
const order = SHELF_ORDER;

/**
 * 每组空着的原因不同，所以不写"这一组是空的"这种废话。
 * 都只有一句、且**与组名同一行**：四个分组全空时，四段独立空态会把页面拉长一倍，
 * 而空态本质上只是"这里暂时没东西"——它不该比有内容的书更占地方。
 */
const EMPTY_HINT: Record<ShelfGroup, string> = {
  reading: '从「想读」里点开一本，就会到这里。',
  want: '逛书库时看到想读的，会先存在这里。',
  finished: '读完由你自己点，系统不替你判断。',
  abandoned: '放下过的书留在这里，不算失败也不算读完。',
};

const usageText = computed(() => {
  const u = usage.value;
  if (!u || u.quota === 0) return '';
  const ratio = u.usage / u.quota;
  return `本机已用 ${humanSize(u.usage)} / 浏览器给了 ${humanSize(u.quota)}（${Math.round(ratio * 100)}%）`;
});

async function refresh(): Promise<void> {
  loading.value = true;
  failed.value = '';
  try {
    const [books, shelf, progress] = await Promise.all([listBooks(), listShelf(), listProgress()]);
    groups.value = buildShelf(books, shelf, progress);
    // 本机导入的书已经由 buildShelf 列在「想读」组里，这里只补核心库的外链书，
    // 否则同一本会在同一页出现两次
    wishlist.value = buildWishlist(shelf, SEED_BOOKS, books.map((b) => b.book_id)).filter(
      (w) => !w.local && w.title.length > 0,
    );
    usage.value = await quota();
  } catch (e) {
    // 打不开本机数据库（隐私模式最常见）：说清楚，不要显示成一个空书架
    // ——"书都没了"和"数据库打不开"是两种完全不同的坏消息。
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function open(id: string): void {
  void router.push(`/reader/${id}`);
}

async function onMove(p: { id: string; group: ShelfGroup }): Promise<void> {
  await moveToShelf(p.id, p.group);
  await refresh();
}

async function onRemove(id: string): Promise<void> {
  await removeBook(id);
  confirming.value = null;
  await refresh();
}

function askRemove(id: string): void {
  confirming.value = id;
}

/** 队列顺序只影响用户自己的先后，绝不回写推荐打分 */
async function moveWish(index: number, dir: -1 | 1): Promise<void> {
  const arr = [...wishlist.value];
  const j = index + dir;
  const a = arr[index];
  const b = arr[j];
  if (!a || !b) return;
  // 没排过队的条目折算成"极大值 - 显示位置"，语义是"排在队尾"。
  // 不能用数组下标兜底：下标是 0/1，与 Date.now() 量级的真实序号差十几个数量级，
  // 交换之后这一条会直接跳到队首，与用户按的方向相反。
  const orderOf = (v: number | null, i: number): number =>
    typeof v === 'number' ? v : Number.MAX_SAFE_INTEGER - i;
  const oa = orderOf(a.sortOrder, index);
  const ob = orderOf(b.sortOrder, j);
  await Promise.all([
    putShelf({ book_id: a.book_id, group: 'want', updated_at: a.addedAt, sort_order: ob }),
    putShelf({ book_id: b.book_id, group: 'want', updated_at: b.addedAt, sort_order: oa }),
  ]);
  await refresh();
}

async function dropWish(bookId: string): Promise<void> {
  await deleteShelf(bookId);
  await refresh();
}

/** 示例书走的是和导入完全相同的链路，所以"试出来的手感"就是真手感 */
async function loadSample(): Promise<void> {
  const sample = SAMPLE_BOOKS[0];
  if (!sample) return;
  sampleBusy.value = true;
  sampleError.value = '';
  const r = await installSample(sample);
  sampleBusy.value = false;
  if (!r.ok) {
    sampleError.value = r.error.detail;
    return;
  }
  await refresh();
  open(r.book.book_id);
}

onMounted(refresh);
</script>

<template>
  <section class="library">
    <header class="lib-head">
      <h1 class="lib-title">我的书架</h1>
      <p class="lib-sub">
        这些书全部在这台设备上，没有上传、没有账号。换浏览器或清站点数据后需要重新导入。
      </p>
      <router-link class="btn-primary lib-import" to="/import">导入一本书</router-link>
    </header>

    <p v-if="loading" class="state">正在打开本机书库…</p>

    <div v-else-if="failed" class="state state-bad">
      <p class="state-title">本机书库打不开</p>
      <p class="state-body">
        常见于无痕/隐私模式，或浏览器被设置为"退出时清除站点数据"。
        换一个普通窗口再打开本站，书还在原来的浏览器里。
      </p>
      <p class="state-detail">{{ failed }}</p>
      <button type="button" class="btn-ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="stats.total === 0 && wishlist.length === 0" class="state">
      <p class="state-title">还没有书</p>
      <p class="state-body">
        导入你自己的 EPUB 或 TXT，就能在这里读：翻页、调字号、划线、写笔记。
        书只存在本机，不会上传，也没有账号。
      </p>
      <div class="state-actions">
        <router-link class="btn-primary" to="/import">选一个文件</router-link>
        <button type="button" class="btn-ghost" :disabled="sampleBusy" @click="loadSample">
          {{ sampleBusy ? '正在准备示例…' : '先试读一段示例' }}
        </button>
      </div>
      <p v-if="sampleError" class="state-detail">{{ sampleError }}</p>
      <p class="state-note">
        示例只有一千多字，由本站编写，用途是让你在导入自己的书之前先试手感。
      </p>
    </div>

    <template v-else>
      <div v-for="g in order" :key="g" class="group">
        <div class="group-head">
          <h2 class="group-title">
            {{ SHELF_LABEL[g] }}<span class="group-count">{{ stats.byGroup[g] }}</span>
          </h2>
          <p v-if="groups[g].length === 0" class="group-empty">{{ EMPTY_HINT[g] }}</p>
        </div>
        <ul v-if="groups[g].length > 0" class="shelf-list">
          <ShelfCard
            v-for="b in groups[g]"
            :key="b.id"
            :book="b"
            :confirming="confirming === b.id"
            @open="open"
            @remove="onRemove"
            @ask-remove="askRemove"
            @move="onMove"
            @cancel="confirming = null"
          />
        </ul>
      </div>

      <section v-if="wishlist.length > 0" class="wish-block">
        <h2 class="group-title">
          从书库存的想读<span class="group-count">{{ wishlist.length }}</span>
        </h2>
        <p class="wish-hint">这些书不在本机，点开会去看它的详情和去哪读。顺序可以自己调。</p>
        <ul class="wish-list">
          <li v-for="(w, i) in wishlist" :key="w.book_id" class="wish-row">
            <router-link class="wish-title" :to="`/book/${w.book_id}`">{{ w.title }}</router-link>
            <span class="wish-meta">{{ w.author }} · 约 {{ w.hours }} 小时</span>
            <span class="wish-btns">
              <button type="button" class="mini" :disabled="i === 0" aria-label="上移" @click="moveWish(i, -1)">上移</button>
              <button type="button" class="mini" :disabled="i === wishlist.length - 1" aria-label="下移" @click="moveWish(i, 1)">下移</button>
              <button type="button" class="mini" @click="dropWish(w.book_id)">移出</button>
            </span>
          </li>
        </ul>
      </section>

      <div class="extra">
        <!-- 只在"书架上一本本机书都没有"时露出来：它的意思是"先试读一段"，
             书架里已经有书了还挂着这个按钮，像在劝人换个东西读 -->
        <button v-if="stats.total === 0" type="button" class="mini" :disabled="sampleBusy" @click="loadSample">
          {{ sampleBusy ? '正在准备示例…' : '试读示例' }}
        </button>
      </div>

      <nav class="lib-more" aria-label="更多功能">
        <router-link to="/notes">划线与笔记</router-link>
        <router-link to="/plan">读书计划</router-link>
        <router-link to="/stats">阅读统计</router-link>
        <router-link to="/books">逛书库</router-link>
      </nav>

      <p v-if="usageText" class="usage">{{ usageText }}</p>
      <NotesTransfer />
      <p class="privacy">
        清掉站点数据 = 本机副本消失。书要重新导入；划线与笔记可以用上面的导出留一份。
      </p>
    </template>
  </section>
</template>

<style scoped src="../styles/library.css"></style>
