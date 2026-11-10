<script setup lang="ts">
/**
 * 首页「今天」区块（F1 增强）。
 *
 * 为什么单独成块：原来的「继续读」是首页最底部一行小链接，用户要滑到底才看得到；
 * 而首页四张卡都是**静态入口**——打开首页永远看到同样的四块砖，没有一次是"今天不一样"。
 * 这一块做两件事，且只做两件：
 *  ① 在读的那一本，带进度，一键回去；
 *  ② 自己以前划过的一条，每天换一条（确定性选取，见 `lib/daily-pick.ts`）。
 *
 * 两条硬约束：
 *  - 没有数据就**整块不渲染**，不留一句"暂无数据"占位；
 *  - 读库失败（隐私模式）时安静地不显示，不把首页变成错误页。
 */
import { computed, onMounted, ref } from 'vue';
import { getBook, getProgress, listAllAnnotations, listShelf } from '@/storage/db.js';
import { pickDaily } from '@/lib/daily-pick.js';
import { readerHref } from '@/lib/reader-link.js';
import { todayIso } from '@/lib/local-date.js';

interface Resume {
  book_id: string;
  title: string;
  percent: number;
}

interface Daily {
  book_id: string;
  title: string;
  quote: string;
  /** 能精确回到原段落就带参数，不能就只打开这本书 */
  href: string;
}

const resume = ref<Resume | null>(null);
const daily = ref<Daily | null>(null);
const hasAny = computed(() => resume.value !== null || daily.value !== null);

onMounted(async () => {
  try {
    const shelf = await listShelf();
    const reading = shelf
      .filter((s) => s.group === 'reading')
      .sort((a, b) => b.updated_at - a.updated_at)[0];
    if (reading) {
      const [book, pg] = await Promise.all([getBook(reading.book_id), getProgress(reading.book_id)]);
      if (book) {
        resume.value = {
          book_id: reading.book_id,
          title: book.title,
          percent: Math.round((pg?.percent ?? 0) * 100),
        };
      }
    }
  } catch {
    // 本机库打不开（隐私模式）：这一块整体不显示，不做错误提示
  }

  try {
    // 只挑有引文的：没有引文的划线在首页上只剩一个书名，等于没提供内容
    const anns = (await listAllAnnotations())
      .filter((a) => a.quote.trim().length > 0)
      .sort((a, b) => a.created_at - b.created_at);
    const got = pickDaily(anns, todayIso(), String(anns.length));
    if (!got) return;
    const book = await getBook(got.book_id);
    if (!book) return;
    daily.value = {
      book_id: got.book_id,
      title: book.title,
      quote: got.quote,
      href: readerHref(got.book_id, got.locator.start),
    };
  } catch {
    // 同上：没有划线就不显示，不报错
  }
});
</script>

<template>
  <section v-if="hasAny" class="today">
    <h2 class="today-title">今天</h2>

    <router-link v-if="resume" class="today-resume" :to="`/reader/${resume.book_id}`">
      <span class="today-resume-label">接着读</span>
      <span class="today-resume-title">{{ resume.title }}</span>
      <span class="today-resume-pct">{{ resume.percent }}%</span>
    </router-link>

    <figure v-if="daily" class="today-quote">
      <blockquote class="today-quote-text">{{ daily.quote }}</blockquote>
      <figcaption class="today-quote-meta">
        <router-link class="today-quote-book" :to="daily.href">《{{ daily.title }}》· 回到这句</router-link>
      </figcaption>
    </figure>
  </section>
</template>

<style scoped src="../../styles/today.css"></style>
