<script setup lang="ts">
/**
 * 本地档案（F12）。
 *
 * 刻意不做的三件事：不做登录、不做「同步到云端」、不在切换后偷偷保留旧档案的数据。
 * 界面上把「这份档案里有什么」直接摊开：切换后三个数字会变，
 * 用户不用信我们的说明，自己就能验证隔离是不是真的。
 */
import { computed, onMounted, ref } from 'vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { listAllNotes, listShelf } from '@/storage/db.js';
import { listSessions } from '@/storage/activity.js';
import {
  DEFAULT_PROFILE_ID,
  activeProfileId,
  createProfile,
  listProfiles,
  removeProfile,
  switchProfile,
  type Profile,
} from '@/storage/profiles.js';

const profiles = ref<Profile[]>([]);
const current = ref(activeProfileId());
const counts = ref({ shelf: 0, notes: 0, sessions: 0 });
const loading = ref(true);
const busy = ref('');
const err = ref('');
const newName = ref('');
const confirmId = ref('');

async function refresh(): Promise<void> {
  loading.value = true;
  err.value = '';
  try {
    const [ps, shelf, notes, sessions] = await Promise.all([
      listProfiles(),
      listShelf(),
      listAllNotes(),
      listSessions(),
    ]);
    profiles.value = ps;
    current.value = activeProfileId();
    counts.value = { shelf: shelf.length, notes: notes.length, sessions: sessions.length };
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const currentName = computed(
  () => profiles.value.find((p) => p.profile_id === current.value)?.display_name ?? '我的书架',
);

function fmt(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString('zh-CN');
  } catch {
    return '日期未知';
  }
}

async function doCreate(): Promise<void> {
  if (!newName.value.trim() || busy.value) return;
  busy.value = 'create';
  err.value = '';
  try {
    await createProfile(newName.value);
    newName.value = '';
    await refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = '';
  }
}

async function doSwitch(id: string): Promise<void> {
  if (busy.value) return;
  busy.value = id;
  err.value = '';
  try {
    await switchProfile(id);
    // 各视图在 onMounted 里缓存了旧档案的数据，整页重载是最不容易漏的一种清法
    window.location.reload();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
    busy.value = '';
    await refresh();
  }
}

async function doRemove(id: string): Promise<void> {
  if (busy.value) return;
  busy.value = id;
  err.value = '';
  try {
    await removeProfile(id);
    confirmId.value = '';
    await refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = '';
  }
}

onMounted(refresh);
</script>

<template>
  <section class="profile">
    <header class="pf-head">
      <h1 class="pf-title">本机档案</h1>
      <p class="pf-sub">
        同一台设备上，把不同人的书架、笔记、划线和阅读记录分开。
        每份档案在浏览器里是一个独立的库，切换之后彼此看不到对方的数据。
      </p>
    </header>

    <p v-if="loading" class="pf-state">正在读本机档案…</p>

    <template v-else>
      <section class="pf-current">
        <div class="pf-current-head">
          <span class="pf-label">正在使用</span>
          <strong class="pf-current-name">{{ currentName }}</strong>
        </div>
        <p class="pf-counts">
          这份档案里：书架 {{ counts.shelf }} 本 · 笔记 {{ counts.notes }} 条 · 阅读记录 {{ counts.sessions }} 次
        </p>
        <p class="pf-hint">切到另一份档案，这三个数字会跟着变——这就是隔离的范围。</p>
      </section>

      <h2 class="pf-h2">这台设备上的档案</h2>
      <ul class="pf-list">
        <li
          v-for="p in profiles"
          :key="p.profile_id"
          class="pf-item"
          :class="{ 'is-current': p.profile_id === current }"
        >
          <div class="pf-item-main">
            <span class="pf-name">{{ p.display_name }}</span>
            <span v-if="p.profile_id === current" class="pf-badge">正在使用</span>
            <span v-else-if="p.profile_id === DEFAULT_PROFILE_ID" class="pf-badge pf-badge-soft">默认</span>
            <span class="pf-date">建于 {{ fmt(p.created_at) }}</span>
          </div>
          <div class="pf-item-actions">
            <button
              v-if="p.profile_id !== current"
              type="button"
              class="btn-ghost"
              :disabled="busy !== ''"
              @click="doSwitch(p.profile_id)"
            >
              切到这个
            </button>
            <template v-if="p.profile_id !== DEFAULT_PROFILE_ID && p.profile_id !== current">
              <button
                v-if="confirmId !== p.profile_id"
                type="button"
                class="pf-danger"
                @click="confirmId = p.profile_id"
              >
                删除
              </button>
              <template v-else>
                <span class="pf-confirm">连同里面的书和笔记一起删？</span>
                <button
                  type="button"
                  class="pf-danger"
                  :disabled="busy !== ''"
                  @click="doRemove(p.profile_id)"
                >
                  确认删除
                </button>
                <button type="button" class="btn-ghost" @click="confirmId = ''">取消</button>
              </template>
            </template>
          </div>
        </li>
      </ul>

      <section class="pf-new">
        <h2 class="pf-h2">新建一份档案</h2>
        <p class="pf-new-note">比如和家人共用这台电脑时各用一份。不用注册，也不会因此多出一个账号。</p>
        <form class="pf-form" @submit.prevent="doCreate">
          <label class="pf-field">
            <span class="pf-sr">档案名字</span>
            <input
              v-model="newName"
              type="text"
              maxlength="24"
              placeholder="给这份档案起个名字"
              aria-label="档案名字"
            />
          </label>
          <button type="submit" class="btn-primary" :disabled="busy !== '' || !newName.trim()">新建</button>
        </form>
      </section>

      <p v-if="err" class="pf-error" role="alert">{{ err }}</p>

      <p class="pf-note">
        不算在隔离里的：内置的 {{ SEED_BOOKS.length }} 本书是应用自带数据，所有档案都能看；
        首页卡片显隐、计划里的每周小时数这类界面偏好，也是这台设备共用的。
        档案只在这台机器上有效，没有同步也没有备份——重要的内容请自己导出。
      </p>

      <footer class="pf-foot">
        <router-link to="/library">回书架</router-link>
        <router-link to="/about">关于与隐私</router-link>
        <router-link to="/admin">维护者面板</router-link>
      </footer>
    </template>
  </section>
</template>

<style scoped src="../styles/profile.css"></style>
