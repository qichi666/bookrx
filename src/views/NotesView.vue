<script setup lang="ts">
/**
 * 笔记总览（F10）+ 书摘图（F4 第三分支）。
 *
 * 之前笔记只能在**单本书的阅读器里**看：读过 5 本书就有 5 处彼此隔离的笔记。
 * 而笔记是这个产品里最重的用户资产（可锚定到段落偏移、可去重、可导出文件），
 * 却没有一个能跨书回看的入口——等于写完就沉底。
 *
 * 全文检索（借鉴 Alia 把 marginalia 全文搜索当核心功能）：
 * 笔记找不到等于没有，所以搜索是这一页的一等功能，不是可选装饰。
 *
 * 书摘图**只导出引文 + 书名 + 作者**，不含困境标签、分档、分数：
 * 一旦这些都上了可以发给别人的图，工具就变成了标签。
 */
import { computed, onMounted, ref } from 'vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { listAllAnnotations, listAllNotes, listBooks } from '@/storage/db.js';
import type { Annotation } from '@/contracts/reader.js';
import { renderQuoteCard, saveQuoteCard, type CardTheme } from '@/lib/quote-card.js';
import { renderRxCard } from '@/lib/rx-card.js';
import { hitFields, splitByKeyword } from '@/lib/highlight.js';

interface Row {
  key: string;
  book_id: string;
  book_title: string;
  book_author: string;
  quote: string;
  note: string;
  at: number;
}

const loading = ref(true);
const failed = ref('');
const rows = ref<Row[]>([]);
const q = ref('');
const busyKey = ref('');
const cardError = ref('');
const theme = ref<CardTheme>('paper');
const style = ref<'quote' | 'rx'>('quote');

async function refresh(): Promise<void> {
  loading.value = true;
  failed.value = '';
  try {
    const [notes, anns, userBooks] = await Promise.all([listAllNotes(), listAllAnnotations(), listBooks()]);
    const meta = new Map<string, { title: string; author: string }>();
    for (const b of SEED_BOOKS) meta.set(b.book_id, { title: b.title, author: b.author_display[0] ?? '' });
    for (const b of userBooks) meta.set(b.book_id, { title: b.title, author: b.author_display[0] ?? '' });

    const annById = new Map<string, Annotation>();
    for (const a of anns) annById.set(a.annotation_id, a);

    const out: Row[] = [];
    const usedAnn = new Set<string>();
    for (const n of notes) {
      const a = n.annotation_id ? annById.get(n.annotation_id) : undefined;
      if (a) usedAnn.add(a.annotation_id);
      const m = meta.get(n.book_id);
      out.push({
        key: n.note_id,
        book_id: n.book_id,
        book_title: m?.title ?? '这本书已不在书库里',
        book_author: m?.author ?? '',
        quote: a?.quote ?? '',
        note: n.body_markdown,
        at: n.updated_at,
      });
    }
    // 只有划线、没写笔记的也要出现：划了线本身就是"这句话重要"的判断
    for (const a of anns) {
      if (usedAnn.has(a.annotation_id)) continue;
      const m = meta.get(a.book_id);
      out.push({
        key: a.annotation_id,
        book_id: a.book_id,
        book_title: m?.title ?? '这本书已不在书库里',
        book_author: m?.author ?? '',
        quote: a.quote,
        note: '',
        at: a.created_at,
      });
    }
    rows.value = out.sort((x, y) => y.at - x.at);
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/** 文本按当前关键词切片；没在搜索时返回整段，模板不用写特判 */
function segs(text: string): { text: string; hit: boolean }[] {
  return splitByKeyword(text, q.value);
}

function hitsOf(r: Row): string[] {
  return hitFields(r, q.value);
}

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase();
  if (kw.length === 0) return rows.value;
  return rows.value.filter((r) =>
    `${r.book_title}\n${r.quote}\n${r.note}`.toLowerCase().includes(kw),
  );
});

const byBook = computed(() => {
  const map = new Map<string, Row[]>();
  for (const r of filtered.value) {
    const arr = map.get(r.book_id) ?? [];
    arr.push(r);
    map.set(r.book_id, arr);
  }
  return [...map.entries()];
});

/**
 * 两种版式：
 *  - 引文卡（默认）：一句引文 + 出处；
 *  - 处方笺：日期 + Rx + 书名 + 引文，版式是本产品独有的。
 *    它**同样不含困境标签**——那是用户和系统之间的判断，不该出现在可以发出去的图上。
 */
async function makeCard(r: Row): Promise<void> {
  if (busyKey.value) return;
  busyKey.value = r.key;
  cardError.value = '';
  try {
    const input = {
      quote: r.quote || r.note,
      title: r.book_title,
      author: r.book_author || '作者未知',
      theme: theme.value,
    };
    const blob = style.value === 'rx' ? await renderRxCard(input) : await renderQuoteCard(input);
    saveQuoteCard(blob, `bookrx-${style.value}-${r.key.replace(/[^a-z0-9]/gi, '')}.png`);
  } catch (e) {
    cardError.value = e instanceof Error ? e.message : String(e);
  } finally {
    busyKey.value = '';
  }
}

onMounted(refresh);
</script>

<template>
  <section class="notes">
    <header class="nt-head">
      <h1 class="nt-title">划线与笔记</h1>
      <p class="nt-sub">
        全部来自这台设备。删掉书不会删掉你写下的字——它们仍然在这里，也仍然能导出。
      </p>
    </header>

    <p v-if="loading" class="nt-state">正在读本机笔记…</p>

    <div v-else-if="failed" class="nt-state nt-bad">
      <p class="nt-state-title">笔记读不出来</p>
      <p class="nt-detail">{{ failed }}</p>
      <button type="button" class="btn-ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="rows.length === 0" class="nt-state">
      <p class="nt-state-title">还没有划线和笔记</p>
      <p class="nt-state-body">
        在阅读器里选中一段正文，就有「划线」；划完可以接着写一句自己的想法。
        写下来的东西会集中出现在这一页。
      </p>
      <router-link class="btn-primary nt-cta" to="/library">去书架挑一本</router-link>
    </div>

    <template v-else>
      <div class="nt-toolbar">
        <input
          v-model="q"
          type="search"
          class="nt-search"
          placeholder="搜书名、引文或自己写的字"
          aria-label="搜索笔记"
        />
        <div class="nt-theme" role="group" aria-label="书摘图版式">
          <button type="button" :class="{ on: style === 'quote' }" @click="style = 'quote'">引文卡</button>
          <button type="button" :class="{ on: style === 'rx' }" @click="style = 'rx'">处方笺</button>
        </div>
        <div class="nt-theme" role="group" aria-label="书摘图配色">
          <button type="button" :class="{ on: theme === 'paper' }" @click="theme = 'paper'">纸白</button>
          <button type="button" :class="{ on: theme === 'night' }" @click="theme = 'night'">夜黑</button>
        </div>
      </div>

      <p class="nt-tally">
        {{ filtered.length }} 条<span v-if="q"> · 从 {{ rows.length }} 条里筛出</span>
      </p>

      <p v-if="cardError" class="nt-error" role="alert">{{ cardError }}</p>

      <p v-if="filtered.length === 0" class="nt-state">
        没有匹配「{{ q }}」的内容。换个词，或者清空搜索。
      </p>

      <section v-for="[bookId, list] in byBook" :key="bookId" class="nt-book">
        <h2 class="nt-book-title">
          <router-link :to="`/book/${bookId}`">{{ list[0]!.book_title }}</router-link>
          <span class="nt-book-count">{{ list.length }} 条</span>
        </h2>
        <ul class="nt-list">
          <li v-for="r in list" :key="r.key" class="nt-item">
            <blockquote v-if="r.quote" class="nt-quote">
              <template v-for="(seg, i) in segs(r.quote)" :key="i"
                ><mark v-if="seg.hit" class="nt-hit">{{ seg.text }}</mark
                ><template v-else>{{ seg.text }}</template></template>
            </blockquote>
            <p v-if="r.note" class="nt-note">
              <template v-for="(seg, i) in segs(r.note)" :key="i"
                ><mark v-if="seg.hit" class="nt-hit">{{ seg.text }}</mark
                ><template v-else>{{ seg.text }}</template></template>
            </p>
            <p v-if="q && hitsOf(r).length > 0" class="nt-hits">命中：{{ hitsOf(r).join(' / ') }}</p>
            <div class="nt-actions">
              <button type="button" class="nt-card" :disabled="busyKey === r.key" @click="makeCard(r)">
                {{ busyKey === r.key ? '正在生成…' : '做成书摘图' }}
              </button>
              <router-link v-if="r.book_id.startsWith('user:')" class="nt-open" :to="`/reader/${r.book_id}`">
                回到原文
              </router-link>
            </div>
          </li>
        </ul>
      </section>

      <footer class="nt-foot">
        <router-link to="/library">书架</router-link>
        <router-link to="/about">这些数据存在哪</router-link>
      </footer>
    </template>
  </section>
</template>

<style scoped src="../styles/notes.css"></style>
