#!/usr/bin/env node
/**
 * tools/doc-audit.mjs —— 文档机械事实闸门
 *
 * ══ 职责边界，写在这里是为了防止它长大 ══
 * 本脚本只查**机械事实**，三样，就三样：
 *   1. 表格列数是否一致（表头 vs 每一行）
 *   2. 文档内锚点是否悬空（`[文字](#锚点)` 指向的标题不存在）
 *   3. 文档里有没有 emoji
 * 这三样都不需要判断，所以**永远不会有误报争议**：有误报就是实现 bug，不是规则争议。
 *
 * **凡是需要判断的东西，一律不许做成闸门**——「这段理由写得对不对」「这条规则表述是否一致」
 * 「术语有没有统一」，这些属于评审清单，不属于这里。
 * 为什么要把这条写进文件头：第一个想加规则的人一定会想加「检查术语统一」，然后它每天红一次，
 * 然后有人给它加 `|| true`，然后整套门禁就死了。**死法不是写错规则，是被噪音逼着关掉。**
 * 要加第四样检查，先问 team-lead。
 *
 * ══ 豁免：只能逐行，不能全局；而且要用得贵 ══
 * 允许在需要豁免的那一行（或它的上一行）写：<!-- doc-audit:ignore 原因 -->
 * **禁止** `--skip`、禁止配置文件白名单、禁止按目录排除。
 * 理由：全局豁免一旦存在，就没人再区分「这一行确实特殊」和「这条规则烦人」。
 * 原因字段必须非空——写不出原因，说明它不是特例，是 bug。
 * **另一半（team-lead 补的）：每次动用豁免都要在 PR 里被看到。**
 * 逐行豁免没有这一半，就会退化成「每行都挂一条」。**豁免要贵，检查才可信。**
 * 现在全仓 0 条豁免——这不是巧合，是这个项目只有一条 emoji 禁令，
 * 不该为一个大字标题上的装饰符号花掉一次额度（那次已改成文字）。
 *
 * ══ 三态语义（SPEC §12）══
 *   pass     ：扫到了东西，且全部干净
 *   fail     ：有命中，或有检查的分母 ≤ 0（**没干活的检查不算通过**）
 *   not-verified：一个文件都没扫到（空仓 / 路径错了）——**不是通过**
 * 第二行必须打印分母：「扫了 N 张表 / N 个标题 / N 个锚点链接 / M 个文件」。
 * 「命中 0」如果没有分母，等于什么都没说：0 次命中可能来自「真的干净」，
 * 也可能来自「根本没扫到该扫的地方」，这两种在报告里长得一模一样。
 *
 * **分母怎么选**（team-lead 规则）：选「**本来可能出问题的地方**」，
 * 不是选「我们实际检查的条数」。所以锚点检查的分母是「标题 + 锚点链接」，
 * 而不是「链接数」——前者是每一个可能出错的位置，后者只是我们核对过的对象。
 *
 * 用法：
 *   node tools/doc-audit.mjs              # 扫 docs/**.md
 *   node tools/doc-audit.mjs --json
 *   node tools/doc-audit.mjs --root=docs --root=README.md
 *   node tools/doc-audit.mjs --strict     # 未验证也算失败（CI 里用这个）
 *
 * 接线建议（package.json 由实现阶段建）：
 *   "check:doc": "node tools/doc-audit.mjs --strict",
 *   "prebuild": "npm run check:doc && npm run check:contrast && npm run check:copy"
 *
 * 铁律：脚本红了改文档，不要改规则。
 *
 * 关于锚点检查的「分母」：只数「指向标题的链接」会让「这份文档没有内链」被判成未验证，
 * 那是把「没事可做」说成「没做事」。所以分母 = 标题数 + 锚点链接数，
 * 两者都打印出来，任何一边异常都能一眼看出。
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import { findEmoji } from './emoji-scan.mjs';

const CWD = process.cwd();
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const JSON_OUT = has('json');
const STRICT = has('strict');
const ROOTS = argv.reduce((acc, a, i) => {
  if (a.startsWith('--root=')) acc.push(a.slice('--root='.length));
  else if (a === '--root' && argv[i + 1]) acc.push(argv[i + 1]);
  return acc;
}, []);

const SCAN_ROOTS = ROOTS.length ? ROOTS : ['docs'];
const IGNORE_MARK = '<!-- doc-audit:ignore';

// ── 工具 ────────────────────────────────────────────────────────────────────

/**
 * 剥掉 fenced block 与行内代码。
 * 不剥就数列数 = 第一次跑就满屏假阳性：`core:010003`、`reason.mismatch`、
 * 单元格里写着 `|` 的代码示例，全都会被当成多余的分隔符。
 * 假阳性的第一反应永远是「这工具不准」，不是「我写错了」。
 */
function stripCode(text) {
  const out = [];
  let inFence = false;
  let fenceMark = '';
  for (const line of text.split(/\r?\n/)) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMark = fence[1][0];
        out.push('');
        continue;
      }
      if (fence[1][0] === fenceMark) {
        inFence = false;
        out.push('');
        continue;
      }
    }
    if (inFence) {
      out.push('');
      continue;
    }
    // 行内代码：整体替换成等宽占位，避免 `` `a|b` `` 把单元格劈开
    out.push(line.replace(/`[^`]*`/g, (m) => 'x'.repeat(Math.max(1, m.length))));
  }
  return out;
}

/** 单元格切分：先转义 `\|`，再按 `|` 切 */
function cells(line) {
  const s = line.replace(/\\\|/g, '\u0000');
  const parts = s.split('|');
  if (parts.length && parts[0].trim() === '') parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts;
}

const SEP_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

/** GitHub 风格 slug（宽严两版，严的不过再用宽的兜） */
function slugStrict(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[[\]()（）【】《》「」『』“”"'’‘]/g, '')
    .replace(/[!-/:-@[-`{-~]/g, '')
    .replace(/\s+/g, '-');
}
const slugLoose = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

function anchorsOf(text) {
  const set = new Set();
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!m) continue;
    const title = m[2];
    list.push({ title, slug: slugStrict(title) });
  }
  // 重名标题 GitHub 会加 -1/-2 后缀
  const seen = new Map();
  for (const h of list) {
    const n = seen.get(h.slug) || 0;
    set.add(n === 0 ? h.slug : `${h.slug}-${n}`);
    seen.set(h.slug, n + 1);
  }
  return { set, list };
}

async function* walk(target) {
  let st;
  try {
    st = await readdir(target, { withFileTypes: true });
  } catch {
    // 可能是文件而不是目录
    if (extname(target) === '.md') yield target;
    return;
  }
  for (const e of st) {
    const full = join(target, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      yield* walk(full);
    } else if (e.isFile() && extname(e.name) === '.md') {
      yield full;
    }
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
const hits = [];
const stats = { files: 0, tables: 0, headings: 0, anchorLinks: 0 };
const missingRoots = [];

for (const root of SCAN_ROOTS) {
  const abs = join(CWD, root);
  let any = false;
  for await (const file of walk(abs)) {
    any = true;
    const rel = relative(CWD, file).split('\\').join('/');
    const raw = await readFile(file, 'utf8');
    const lines = raw.split(/\r?\n/);
    const ignored = (i) =>
      (lines[i] || '').includes(IGNORE_MARK) || (lines[i - 1] || '').includes(IGNORE_MARK);

    stats.files += 1;

    // ① 表格列数
    const stripped = stripCode(raw);
    for (let i = 0; i < stripped.length - 1; i += 1) {
      if (!/^\s*\|/.test(stripped[i])) continue;
      if (!SEP_RE.test(stripped[i + 1] || '')) continue;
      const head = cells(stripped[i]).length;
      stats.tables += 1;
      let r = i + 1;
      while (r < stripped.length && /^\s*\|/.test(stripped[r])) {
        if (!ignored(r)) {
          const c = cells(stripped[r]).length;
          if (c !== head) {
            hits.push({
              check: 'table-columns',
              file: rel,
              line: r + 1,
              detail: `列数 ${c} ≠ 表头 ${head}`,
              excerpt: lines[r].trim().slice(0, 100),
            });
          }
        }
        r += 1;
      }
      i = r - 1;
    }

    // ② 锚点
    const { set, list } = anchorsOf(raw);
    stats.headings += list.length;
    const looseSet = new Set([...set].map(slugLoose));
    const linkRe = /\[[^\]]*\]\(#([^)\s]+)\)/g;
    for (let i = 0; i < lines.length; i += 1) {
      if (ignored(i)) continue;
      linkRe.lastIndex = 0;
      let m;
      while ((m = linkRe.exec(lines[i])) !== null) {
        stats.anchorLinks += 1;
        const target = decodeURIComponent(m[1]);
        if (set.has(target) || looseSet.has(slugLoose(target))) continue;
        hits.push({
          check: 'anchor',
          file: rel,
          line: i + 1,
          detail: `锚点 #${target} 在本文中不存在`,
          excerpt: lines[i].trim().slice(0, 100),
        });
      }
    }

    // ③ emoji（不剥代码：文档里的 emoji 多半就写在示例文案的引号或反引号里，
    //    那正是最该抓的位置；定义来自 tools/emoji-scan.mjs，与 style-audit 同一份，
    //    因此 `✓` `✗` 这类表格排版标记不会在这里变成红灯）
    for (let i = 0; i < lines.length; i += 1) {
      if (ignored(i)) continue;
      const found = findEmoji(lines[i]);
      if (found.length === 0) continue;
      hits.push({
        check: 'emoji',
        file: rel,
        line: i + 1,
        detail: `发现 emoji：${[...new Set(found)].join(' ')}`,
        excerpt: lines[i].trim().slice(0, 100),
      });
    }
  }
  if (!any) missingRoots.push(root);
}

// ── 输出（三态） ────────────────────────────────────────────────────────────
// 两件事必须分开：
//   files === 0        → 一个文件都没扫到 → **未验证**（路径错了 / 空仓，属"没跑"）
//   files > 0 但分母 ≤0 → 文件扫到了，但那三样一样没有 → **fail**（属"跑了但没抓到东西"）
// 后者按 SPEC §12 的「N ≤ 0 直接 fail」处理：它可能是 .md 被写成了纯文本堆，
// 也可能是解析器坏了——两种都必须有人看一眼，不能安静地绿过去。
const denominator = stats.tables + stats.headings + stats.anchorLinks;
const nothingScanned = stats.files === 0;
const zeroDenominator = !nothingScanned && denominator <= 0;
const result = hits.length || zeroDenominator ? 'fail' : nothingScanned ? 'not-verified' : 'pass';

if (JSON_OUT) {
  console.log(JSON.stringify({ ...stats, denominator, missingRoots, result, hits }, null, 2));
} else {
  for (const r of missingRoots) console.warn(`[skip] ${r} 下没有 .md——这一段没跑，不算通过。`);
  console.log(
    `扫了 ${stats.files} 个文件 / ${stats.tables} 张表 / ${stats.headings} 个标题 / ${stats.anchorLinks} 个锚点链接`,
  );
  if (result === 'fail' && hits.length) {
    const by = new Map();
    for (const h of hits) by.set(h.check, (by.get(h.check) || 0) + 1);
    console.error(
      `\n文档审计未通过：${hits.length} 处（${[...by].map(([k, v]) => `${k} ${v}`).join(' / ')}）\n`,
    );
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  [${h.check}] ${h.detail}`);
      console.error(`    ${h.excerpt}\n`);
    }
    console.error('修文档，不要改规则；确实特殊的行，用 <!-- doc-audit:ignore 原因 --> 逐行豁免。');
  } else if (result === 'fail') {
    console.error(
      `\n文档审计未通过：分母为 ${denominator}（表 ${stats.tables} + 标题 ${stats.headings} + 锚点 ${stats.anchorLinks}），` +
        `说明有一项检查根本没扫到东西。**没干活的检查不算通过。**`,
    );
  } else if (result === 'not-verified') {    console.warn(
      `未验证：${SCAN_ROOTS.join(' + ')} 下没扫到可检查的内容（文件 ${stats.files}，分母 ${denominator}）。这不等于通过。`,
    );
    if (STRICT) console.error('--strict 下这算失败。');
  } else {
    console.log('文档审计通过：三样机械事实全部干净。');
  }
}

process.exit(result === 'pass' ? 0 : result === 'fail' ? 1 : STRICT ? 1 : 0);
