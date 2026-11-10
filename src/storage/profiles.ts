import { plainValue } from '@/lib/plain.js';
import {
  DEFAULT_PROFILE_ID,
  activeProfileId,
  closeAll,
  dbNameFor,
  getAll,
  openFor,
  openRegistry,
  setActiveProfileId,
  tx,
} from './connection.js';

/**
 * 本地档案（F12）。**不是账号**——没有密码、没有同步、没有服务端；
 * 换台机器、换个浏览器、清掉站点数据就什么都没有，这是设计意图。
 *
 * 隔离不看字段，看**库名**：一个档案一个 IndexedDB 数据库，
 * 所以书架 / 进度 / 笔记 / 划线 / 会话 / 回执天然互不可见，
 * 不存在「哪个读写函数忘了加过滤条件」这类只在切换后才暴露的事故。
 *
 * 档案清单固定写在默认库 `bookrx` 的 `profiles` 表里。
 * 如果它也跟着当前档案走，切到 B 之后就再也列不出 A 了。
 */

export { activeProfileId, DEFAULT_PROFILE_ID, dbNameFor };

export interface Profile {
  profile_id: string;
  display_name: string;
  created_at: number;
  last_active_at: number;
}

/** 老用户升级到 v2 时 `profiles` 是空的，第一次列档案时补一条默认记录。 */
async function ensureDefaultProfile(): Promise<void> {
  const db = await openRegistry();
  const old = await tx<Profile>(db, 'profiles', 'readonly', (t) =>
    t.objectStore('profiles').get(DEFAULT_PROFILE_ID) as IDBRequest<Profile>,
  );
  if (old) return;
  const now = Date.now();
  await tx(db, 'profiles', 'readwrite', (t) =>
    t.objectStore('profiles').put({
      profile_id: DEFAULT_PROFILE_ID,
      display_name: '我的书架',
      created_at: now,
      last_active_at: now,
    }),
  );
}

export async function listProfiles(): Promise<Profile[]> {
  await ensureDefaultProfile();
  const db = await openRegistry();
  const out = await getAll<Profile>(db, 'profiles');
  return out.sort((a, b) => a.created_at - b.created_at);
}

export async function createProfile(displayName: string): Promise<Profile> {
  const name = displayName.trim().slice(0, 24);
  if (!name) throw new Error('先给这个档案起个名字');
  const now = Date.now();
  const p: Profile = {
    profile_id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    display_name: name,
    created_at: now,
    last_active_at: now,
  };
  const db = await openRegistry();
  await tx(db, 'profiles', 'readwrite', (t) => t.objectStore('profiles').put(plainValue(p)));
  // 立刻把新库建出来：切过去时第一次读写不必再等一次 upgrade
  await openFor(p.profile_id);
  return p;
}

/** 切换后调用方要刷新页面：各视图在 onMounted 里缓存了旧档案的数据。 */
export async function switchProfile(profileId: string): Promise<void> {
  const list = await listProfiles();
  const target = list.find((p) => p.profile_id === profileId);
  if (!target) throw new Error('这个档案已经不在了');
  setActiveProfileId(profileId);
  await closeAll();
  const db = await openRegistry();
  await tx(db, 'profiles', 'readwrite', (t) =>
    t.objectStore('profiles').put(plainValue({ ...target, last_active_at: Date.now() })),
  );
}

function dropDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('删除档案失败'));
    req.onblocked = () => reject(new Error('这个档案还在别的标签页里打开着，先关掉那个页面再删'));
  });
}

/**
 * 删档案 = 删整个库 + 删清单记录。默认档案和正在使用的档案都不许删：
 * 前者是老数据的落脚点，后者删掉会让界面瞬间指向一个不存在的库。
 */
export async function removeProfile(profileId: string): Promise<void> {
  if (profileId === DEFAULT_PROFILE_ID) throw new Error('默认档案不能删除');
  if (profileId === activeProfileId()) throw new Error('正在用的档案不能删，请先切到另一个');
  await closeAll();
  await dropDatabase(dbNameFor(profileId));
  const db = await openRegistry();
  await tx(db, 'profiles', 'readwrite', (t) => t.objectStore('profiles').delete(profileId));
}
