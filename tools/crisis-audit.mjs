#!/usr/bin/env node
/**
 * 危机资源核实审计。**三态**：通过 / 未通过 / 未验证。
 *
 * 这个脚本存在的原因很具体：危机资源条已经在线上跑，危机检测与硬互斥都有单测覆盖，
 * 但 `catalog/crisis-resources.json` 原先的字段只有 `name / contact / scope / hours`——
 * **数据结构上就没有任何可核实的痕迹**。三个号码是否正确、是否还在服务，
 * 无法从数据里判断；页面上那句「清单核对日期」也没有对应的来源。
 *
 * 所以这里断言四件事，任何一条不满足都非零退出：
 *  ① 每条资源（含紧急情况）必须有 `source_url` 与 `verified_at`；
 *  ② `verified_at` 必须是合法日期，且不超过 `max_age_days` 天；
 *  ③ 号码形态合法（不能是空串、不能是占位符）；
 *  ④ 列表至少 2 条、必须有紧急情况条目 —— 只有 1 条时"资源缺失"不会报错，
 *     只会让一个本该有多条出口的页面看起来信息稀疏。
 *
 * 扫到 0 条资源 = **未验证**，同样非零退出。不得报"通过"。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'catalog', 'crisis-resources.json');

const DAY = 24 * 60 * 60 * 1000;
const failures = [];
const unverified = [];

function chk(name, ok, detail = '') {
  if (ok) console.log(`[通过] ${name}`);
  else {
    console.log(`[失败] ${name}${detail ? ` —— ${detail}` : ''}`);
    failures.push(name);
  }
}

function daysSince(dateStr, now) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

function main() {
  const raw = JSON.parse(readFileSync(FILE, 'utf8'));
  const now = Date.now();
  const maxAge = Number(raw.max_age_days ?? 90);
  const items = [
    ...(Array.isArray(raw.resources) ? raw.resources.map((r) => ({ ...r, kind: 'resource' })) : []),
    ...(raw.emergency ? [{ ...raw.emergency, kind: 'emergency' }] : []),
  ];

  console.log(`crisis-audit：${items.length} 条（资源 ${raw.resources?.length ?? 0} + 紧急 ${raw.emergency ? 1 : 0}），有效期 ${maxAge} 天`);

  if (items.length === 0) {
    console.error('[未验证] 一条危机资源都没有 —— 不得报"通过"');
    process.exit(1);
  }

  const missingSource = items.filter((r) => !r.source_url).map((r) => r.contact ?? '(无号码)');
  chk('每条都有 source_url（没有来源就等于无法核实）', missingSource.length === 0, missingSource.join(', '));

  const missingVerified = items.filter((r) => !r.verified_at).map((r) => r.contact ?? '(无号码)');
  chk('每条都有 verified_at', missingVerified.length === 0, missingVerified.join(', '));

  const invalidDate = items
    .filter((r) => r.verified_at && daysSince(r.verified_at, now) === null)
    .map((r) => `${r.contact}:${r.verified_at}`);
  chk('verified_at 都是合法日期（YYYY-MM-DD）', invalidDate.length === 0, invalidDate.join(', '));

  const stale = items
    .filter((r) => {
      const d = r.verified_at ? daysSince(r.verified_at, now) : null;
      return d !== null && d > maxAge;
    })
    .map((r) => `${r.contact} 已 ${daysSince(r.verified_at, now)} 天`);
  chk(`没有超过 ${maxAge} 天未核实的条目`, stale.length === 0, stale.join(', '));

  // 未来日期不是"更新"，是录入错误（或被顺手写成明年）
  const future = items
    .filter((r) => {
      const d = r.verified_at ? daysSince(r.verified_at, now) : null;
      return d !== null && d < 0;
    })
    .map((r) => `${r.contact}:${r.verified_at}`);
  chk('verified_at 不在未来', future.length === 0, future.join(', '));

  const badContact = items
    .filter((r) => typeof r.contact !== 'string' || r.contact.trim().length < 3)
    .map((r) => r.name ?? '(未命名)');
  chk('号码字段非空且不是占位符', badContact.length === 0, badContact.join(', '));

  const dup = items
    .map((r) => (r.contact ?? '').replace(/\s/g, ''))
    .filter((x, i, arr) => x !== '' && arr.indexOf(x) !== i);
  chk('号码不重复（重复会让同一条占两个位置）', dup.length === 0, [...new Set(dup)].join(', '));

  chk('资源条目 ≥ 2 条', (raw.resources?.length ?? 0) >= 2, `${raw.resources?.length ?? 0} 条`);
  chk('有紧急情况条目（120 / 110）', Boolean(raw.emergency?.contact));

  const oldest = items.reduce((min, r) => {
    const d = r.verified_at ? daysSince(r.verified_at, now) : null;
    return d !== null && (min === null || d > min) ? d : min;
  }, null);
  if (oldest !== null) console.log(`最久未核实：${oldest} 天（阈值 ${maxAge} 天）`);
  const methods = items.reduce((m, r) => {
    const k = r.verify_method ?? 'unspecified';
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  console.log(`核实方式：${Object.entries(methods).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  if (methods.unspecified) {
    console.log('提示：未标注 verify_method 的条目按"只核对了官方页面"处理，不是电话实测');
  }

  if (unverified.length > 0 || failures.length > 0) {
    console.error(`\n[不通过] 危机资源审计失败 ${failures.length} 项`);
    process.exit(1);
  }
  console.log('\n[通过] 危机资源审计通过');
}

main();
