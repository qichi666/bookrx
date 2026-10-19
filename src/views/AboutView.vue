<script setup lang="ts">
/**
 * `/about`（占位实现）。第二个 `data-crisis-entry` 挂在这里。
 * 两处入口是刻意的：结果页那个给"刚被推荐了书、状态不好"的人，
 * 这个给"随便逛到这里"的人。少了任何一个，都会有一类人找不到出口。
 */
</script>

<template>
  <section class="about">
    <a class="about-crisis" data-crisis-entry href="#/crisis">心理援助资源</a>
  </section>
</template>

<style scoped>
.about {
  padding: 16px;
}
</style>
