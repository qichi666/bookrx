/**
 * 连接、库名、schema。**从 `db.ts` 拆出来**，因为「连哪个库」和「怎么读写表」
 * 是两件事：F12 的本地档案让库名变成变量之后，混在一起会让每次读写都得
 * 先想一遍「我现在在哪个档案里」。
 *
 * ── 隔离方案：按档案分库，而不是给每张表加 profile_id ──────────────────
 * 原方案（v4 第 0.1 节）要求所有用户数据表加 `profile_id` 并回填默认档案。
 * 那条路要改十张表的键、索引和每一个读写函数，是全案最大的迁移风险；
 * 而且只要漏一个函数，就会出现「切了档案却还看得见上一个档案的笔记」。
 *
 * 这里改成：**一个档案一个 IndexedDB 库**。
 *  - 默认档案直接用 v1 老库名 `bookrx` → 老用户升级后数据原地保留，零迁移；
 *  - 其他档案用 `bookrx:p:<id>` → 首次打开时 `onupgradeneeded` 建全十张表；
 *  - 隔离由**数据库边界**保证，读写函数一行都不用改，也不存在「漏过滤」；
 *  - 档案清单必须放在一个不随切换变化的地方，固定存默认库的 `profiles` 表。
 *
 * 仍然没有账号、没有同步、没有服务端；换设备或清浏览器数据就什么都没有。
 *
 * ── 连接复用 ────────────────────────────────────────────────────────────
 * 旧实现每次操作 `open` 再 `close`：一次翻页开三次连接，且事务抛错时
 * 跳过 close，异常路径上句柄一个都收不回来。按库名缓存连接解决这两件事。
 * `onversionchange` 必须让路，否则别的标签页要升级版本时会被永久挡住。
 */

export const DB_NAME = 'bookrx';
export const DB_VERSION = 2;
export const DEFAULT_PROFILE_ID = 'default';

const ACTIVE_KEY = 'bookrx.profile.active';

/** 隐私模式 / 禁用存储时 localStorage 可能直接抛，读不到就退回默认档案。 */
export function activeProfileId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function setActiveProfileId(id: string): void {
  try {
    if (id === DEFAULT_PROFILE_ID) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* 写不进去时只影响下次打开，本次会话由调用方负责刷新 */
  }
}

/** 默认档案沿用 v1 老库名：这是「零迁移」的全部秘密。 */
export function dbNameFor(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? DB_NAME : `${DB_NAME}:p:${profileId}`;
}

const conns = new Map<string, Promise<IDBDatabase>>();

function connect(name: string): Promise<IDBDatabase> {
  const cached = conns.get(name);
  if (cached) return cached;

  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 全部用 contains 判断：v1 老库进来只补建新表，新库一次建全。
      // 两条路径共用同一段代码，不存在「新装能用、升级炸掉」的故障。
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('shelf')) db.createObjectStore('shelf', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('annotations')) {
        const s = db.createObjectStore('annotations', { keyPath: 'annotation_id' });
        s.createIndex('by_book', 'book_id');
      }
      if (!db.objectStoreNames.contains('notes')) {
        const s = db.createObjectStore('notes', { keyPath: 'note_id' });
        s.createIndex('by_book', 'book_id');
      }
      /* v2 新增 */
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'session_id' });
        s.createIndex('by_book', 'book_id');
        s.createIndex('by_started', 'started_at');
      }
      if (!db.objectStoreNames.contains('receipts')) {
        db.createObjectStore('receipts', { keyPath: 'book_id' });
      }
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'profile_id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        conns.delete(name);
      };
      resolve(db);
    };
    req.onerror = () => {
      conns.delete(name); // 失败不要缓存，否则这个会话再也打不开
      reject(req.error ?? new Error('indexedDB.open 失败'));
    };
  });

  conns.set(name, p);
  return p;
}

/** 当前档案的数据连接。所有读写函数走这里，不需要知道自己属于哪个档案。 */
export function open(): Promise<IDBDatabase> {
  return connect(dbNameFor(activeProfileId()));
}

/** 档案清单固定连接在默认库；切到别的档案后仍要能列出全部档案。 */
export function openRegistry(): Promise<IDBDatabase> {
  return connect(DB_NAME);
}

/** 指定档案的数据连接，用于只读统计。 */
export function openFor(profileId: string): Promise<IDBDatabase> {
  return connect(dbNameFor(profileId));
}

/** 切换 / 删除档案前关掉所有连接：否则旧连接会一直指向旧库。 */
export async function closeAll(): Promise<void> {
  const all = [...conns.values()];
  conns.clear();
  for (const p of all) {
    try {
      (await p).close();
    } catch {
      /* 本来就没打开成功，不用管 */
    }
  }
}

export function tx<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let req: IDBRequest<T> | void;
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error ?? new Error('事务失败'));
    t.onabort = () => reject(t.error ?? new Error('事务被中止'));
    req = run(t);
  });
}

export function getAll<T>(db: IDBDatabase, store: string, query?: IDBKeyRange | IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll(query);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error(`读取 ${store} 失败`));
  });
}
