import type { RelationKind, TagRelation } from '@/data/tag-relations.js';

/**
 * 书籍关系图谱（F15）。
 *
 * 输入「当前这本书 + 全量书 + 关系表」，输出「接着读哪几本，为什么」。
 * 纯函数：不读存储、不看时间、不随机——同一份输入永远同一份输出，
 * 与推荐内核同一套纪律。
 *
 * **不新增任何书字段**：关系全部由「现有标签 + 人工裁定的关系表」推出来。
 * 新增字段意味着 6551 条数据都要回填，而回填出来的东西没人核过。
 */

export interface RelationBook {
  book_id: string;
  title: string;
  author: string;
  hours: number;
  difficulty: number;
  tags: readonly { tag: string; weight: number }[];
}

export interface RelatedItem {
  book_id: string;
  title: string;
  author: string;
  hours: number;
  difficulty: number;
  kind: RelationKind;
  /** 卡片上那句话：为什么接得上 */
  why: string;
  /** 候选书命中的那个标签（用于界面上标注"它讲的是这一层"） */
  tag: string;
}

/** 低于这个权重不算「这本书讲这个」，避免 0.2 的边角标签把关系拉歪 */
const MIN_WEIGHT = 0.5;

const KIND_ORDER: Record<RelationKind, number> = { next: 0, pair: 1, tension: 2 };

/**
 * 找出与 `target` 有关系的书。
 *
 * 排序：先按关系类型（递进 → 互补 → 对照），再按「两边标签权重之和」降序，
 * 最后按书 id 升序。第三级保证全序，不依赖数组原顺序。
 */
export function relatedBooks(
  target: RelationBook,
  pool: readonly RelationBook[],
  relations: readonly TagRelation[],
  limit = 3,
): RelatedItem[] {
  const mine = new Map<string, number>();
  for (const t of target.tags) {
    if (t.weight >= MIN_WEIGHT) mine.set(t.tag, Math.max(mine.get(t.tag) ?? 0, t.weight));
  }
  if (mine.size === 0) return [];

  /** 同一本书可能通过多条关系命中，只留最强的那条 */
  const best = new Map<string, RelatedItem & { strength: number }>();

  for (const rel of relations) {
    const fromWeight = mine.get(rel.from);
    if (fromWeight === undefined) continue;
    for (const cand of pool) {
      if (cand.book_id === target.book_id) continue;
      const hit = cand.tags.find((t) => t.tag === rel.to && t.weight >= MIN_WEIGHT);
      if (!hit) continue;
      const strength = Math.round((fromWeight + hit.weight) * 1000);
      const prev = best.get(cand.book_id);
      if (prev && prev.strength >= strength) continue;
      best.set(cand.book_id, {
        book_id: cand.book_id,
        title: cand.title,
        author: cand.author,
        hours: cand.hours,
        difficulty: cand.difficulty,
        kind: rel.kind,
        why: rel.why,
        tag: rel.to,
        strength,
      });
    }
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        b.strength - a.strength ||
        (a.book_id < b.book_id ? -1 : a.book_id > b.book_id ? 1 : 0),
    )
    .slice(0, limit)
    .map((r) => ({
      book_id: r.book_id,
      title: r.title,
      author: r.author,
      hours: r.hours,
      difficulty: r.difficulty,
      kind: r.kind,
      why: r.why,
      tag: r.tag,
    }));
}
