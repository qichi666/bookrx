#!/usr/bin/env node
/**
 * tools/copy-audit.mjs —— 文案审计（字符串层）
 *
 * 职责边界，先写清楚，免得它长成一个什么都管的大脚本：
 *   本脚本只做「有没有说错话」——禁词、空话、emoji、P8 的埋点泄漏。
 *   「有没有多出入口」不归它管：那是运行时 DOM 枚举（层 1），
 *   按 `data-crisis-entry` 属性数节点，写在组件测试里（P8 有三个合法入口：
 *   结果页危机条 / /about 固定链接 / URL 直达）。
 *   两层分工见 docs/UIUX.md 附录 A 第 34 条。**不设第三层（截图人工核）。**
 *
 * 用法：
 *   node tools/copy-audit.mjs                      # src 与 dist **各算一段**（默认）
 *   node tools/copy-audit.mjs --targets=src        # PR 期只扫源码（快，能定位到行）
 *   node tools/copy-audit.mjs --targets=dist       # 上线前只扫构建产物（唯一权威）
 *   node tools/copy-audit.mjs --targets=src,dist   # 显式两段（等价默认，但判定分开打印）
 *   node tools/copy-audit.mjs --json               # 机器可读
 *   node tools/copy-audit.mjs --root=a --root=b    # 覆盖扫描根（测试用，单段）
 *
 * ── 为什么拆成「段」而不是一个总数（v1.12，架构师口径）─────────────────────
 *   拆段改的是「它检查的东西在那一刻是否存在」，是**存在性问题**；
 *   「数命中够不够细」是**细度问题**。存在性没解决时，细度是白算的。
 *   具体说：`src/` 在 PR 期一定存在，`dist/` 只在构建后存在。两段混成一个总数时，
 *   「扫了 12 个文件、0 命中」这句话在两种情况下长得一样——
 *     ① src+dist 都扫了；② dist 不存在，只扫了 src。
 *   而这两种情况的**可信度差一个量级**：②根本没验过「用户真会看到的字符串」。
 *   所以每段各自打印分母、各自三态，判定不相加。
 *
 * ── 三态（SPEC §12）────────────────────────────────────────────────────────
 *   pass          该段分母 > 0 且 0 命中
 *   fail          该段有命中；或该段分母 ≤ 0（跑了但一个文件都没抓到）
 *   not-verified  该段根目录不存在（这一层没跑，不等于通过）
 *   注意 fail 与 not-verified **修法完全不同**：前者改文案，后者查构建/路径。
 *   合并成一个状态就会有人按错的那个去修。
 *
 * 为什么上线前必须再扫一次 dist/：
 *   注释、决策记录、changelog 在构建产物里根本不存在，假阳性自动消失；
 *   而且它扫的是「用户真会看到的字符串」，不是「我在哪个目录里搜过」。
 *   所以两层都跑，缺一层不算过。`dist/**\/*.map` 恒排除——那是给人看的，不是给用户看的。
 *
 * 已知前提（不满足会漏报，属于构建要求而不是脚本缺陷）：
 *   crisis/* 三条规则按文件名是否含 `crisis` 收窄，所以 **P8 必须被 Vite 拆成独立 chunk**。
 *   若它被打进 index-*.js，这三条会静默失效。构建后请确认 `dist/assets/` 里存在 crisis-*.js；
 *   不存在就把这条记成构建缺陷，不要就此认为「扫过了、是干净的」。
 *
 * 接线建议（package.json 目前还没有，由实现阶段加）：
 *   "check:copy": "node tools/copy-audit.mjs",
 *   "prebuild": "node tools/contrast-check.mjs && node tools/copy-audit.mjs --targets=src"
 *   "postbuild": "node tools/copy-audit.mjs --targets=dist --strict"
 *
 * 铁律：脚本红了改文案，不要改规则。规则是判据（PRD 禁用词清单 / SPEC §7.1.1 四禁止），
 *      不是可调参数。真要放宽某一条，先改文档，再改这里。
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname, isAbsolute } from 'node:path';

const CWD = process.cwd();
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const optVal = (name, fallback) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const JSON_OUT = has('json');
const STRICT = has('strict'); // CI 里用：任一段 not-verified 即失败

// ── 段（target）解析 ────────────────────────────────────────────────────────
// 一段 = 一个报告单位 = 一个独立的「存在性 + 三态」。默认 src 与 dist 各一段。
// `--scope` 是 v1.11 的旧名，保留为别名但不静默：每次运行都提示改口，
// 否则 CI 里会长期存在两种写法，而下一个人读日志时不知道该按哪一份跑。
const LEGACY_SCOPE = optVal('scope', null);
if (LEGACY_SCOPE) {
  console.warn('[deprecated] --scope 已改名 --targets，语义相同；请把 CI 与文档里的 --scope 全部改掉。');
}
const TARGETS_ARG = optVal('targets', LEGACY_SCOPE || 'src,dist');
const TARGET_NAMES = TARGETS_ARG.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ROOTS = argv.reduce((acc, a, i) => {
  if (a.startsWith('--root=')) acc.push(a.slice('--root='.length));
  else if (a === '--root' && argv[i + 1]) acc.push(argv[i + 1]);
  return acc;
}, []);

// --root 覆盖时只有一段：那是测试用的自定义根，没有 src/dist 之分。
const SEGMENTS = ROOTS.length
  ? [{ name: 'custom', roots: ROOTS }]
  : TARGET_NAMES.map((name) => ({ name, roots: [name] }));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist-ssr', '.vite', 'coverage']);
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte',
  '.html', '.json', '.css', '.scss', '.md', '.txt', '.svg',
]);

// ── 规则表 ──────────────────────────────────────────────────────────────────
// `files` 收窄到文件名/相对路径命中某个模式的文件；不给则全量扫。
// 每条都必须能指回一句文档，指不回去的规则不许进这张表。
//
// `rel` 是**相对 CWD** 的路径（`src/components/CrisisBar.vue` / `dist/assets/crisis-x.js`），
// 所以按段收窄写成 `rel.startsWith('dist/')` 是安全的。

/**
 * 数据文件不是界面文案。
 *
 * 书目 JSON 里出现「解锁」「探索」「备选」是**书名和豆瓣标签**，不是我们写的推荐语；
 * 拿 copy 规则去扫 6551 条书目只会得到一条永远修不掉的命中，最后逼人把规则关掉。
 * `src/` 除外——`src/data/*.ts` 里的字是我们自己写的，必须扫。
 */
const isDataFile = (rel) => !rel.startsWith('src/') && /(^|\/)(catalog|data|fixtures|seeds)\//.test(rel);

const RULES = [
  {
    id: 'crisis/verdict',
    pattern: /状态很差/,
    why: '「状态很差」是在给用户下负面判断。定稿为「不太好过」（PRD §17.1 / UIUX §2.3）。',
  },
  {
    id: 'crisis/nav',
    files: (rel) => /crisis/i.test(rel),
    pattern: /返回推荐结果|继续选书|回到书单|看看为你挑的书/,
    why: 'P8 返回只给「返回上一页」（无历史→「回到首页」）。任何方向性引导等于在他最脆弱的一刻把他推回货架（UIUX P8）。',
  },
  {
    id: 'crisis/topic',
    files: (rel) => /crisis/i.test(rel),
    pattern: /读完这本书|会好起来|阅读也能帮到你|很多读者读完/,
    why: 'P8 四禁止之②：禁止把阅读当疗法，禁止越界承诺（UIUX P8 四禁止表）。',
  },
  {
    id: 'crisis/analytics',
    files: (rel) => /crisis/i.test(rel),
    pattern: /analytics|gtag|posthog|plausible|umami|sendBeacon|utm_source/,
    why: 'P8 四禁止之④：/crisis 是全站唯一零观测页面，该路由产物不得含任何埋点代码（UIUX 验收 27）。',
  },
  {
    /**
     * `track(` 单独一条、**只扫 src**。
     *
     * 2026-10-21 实测：`dist/assets/crisis-*.js` 里有 4 处 `track(`，全部来自 Vue 运行时
     * （`Dep#track` 与 `ref.value` 里的 `this.dep.track()`）——危机 chunk 必然打包 Vue，
     * 所以这条规则若扫 dist 就**永远红**。永远红的规则只有一个下场：被人注释掉，
     * 连同上面那条真正管用的埋点包名规则一起失守。
     *
     * 收窄的是扫描范围（手写的危机页源码），不是判定意图。
     */
    id: 'crisis/track-call',
    files: (rel) => !rel.startsWith('dist/') && /crisis/i.test(rel),
    pattern: /track\(/,
    why: 'P8 四禁止之④：危机页不得主动上报任何行为（UIUX 验收 27）。',
  },
  {
    id: 'copy/promo',
    pattern: /强烈推荐|你可能喜欢|猜你喜欢|猜你想读|备选|探索档/,
    skip: isDataFile,
    why: '档位只允许「高度契合 / 较为契合 / 换个角度」三词，推荐语不许营销化（UIUX 验收 21）。',
  },
  {
    id: 'copy/byo-fault',
    pattern: /暂不可读|资源缺失|暂不支持在线阅读/,
    skip: isDataFile,
    why: '需自备文件不是故障。措辞含糊等于欺骗（UIUX §9.2 硬规则四条）。',
  },
  {
    id: 'copy/p017-empty',
    files: (rel) => /noInline|p0-?17/i.test(rel),
    pattern: /抱歉|暂不支持|资源缺失|敬请期待/,
    why: 'P0-17 说明条不道歉、不暗示缺失（UIUX 验收 28 ①）。',
  },
  {
    id: 'copy/filler',
    pattern: /Welcome to|Lorem ipsum|开始你的阅读之旅|解锁|Elevate your|Seamless|Unleash|Next-Gen/,
    skip: isDataFile,
    why: '空洞占位文案 = 没写。空状态必须含「发生了什么 + 为什么 + 下一步」三件套（UIUX 验收 3）。',
  },
  {
    id: 'icons/emoji',
    pattern: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
    why: '零 emoji 功能图标。图标只从 src/ui/icons.ts（Lucide）取（UIUX 验收 1 / §6）。',
    // UGC 数据文件里允许出现（用户自己写的内容），见 docs/UIUX.md 验收 1 的例外条款
    skip: (rel) => /(^|\/)(data|fixtures|seeds)\//.test(rel) || /\.test\./.test(rel),
  },
];

// ── 文件遍历 ────────────────────────────────────────────────────────────────
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // 目录不存在：交给调用方决定是警告还是失败
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      // dist 的 sourcemap 恒排除：那是给人看的，不是给用户看的
      if (e.name.endsWith('.map')) continue;
      if (!TEXT_EXT.has(extname(e.name))) continue;
      yield full;
    }
  }
}

const exists = async (p) => {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
};

// ── 逐段扫描 ────────────────────────────────────────────────────────────────
// 每段自己数分母（扫了多少个文件）、自己算三态。**不相加**：
// src 的 0 命中不能替 dist 作证，dist 的 0 命中也不能替 src 定位到行。
async function runSegment(seg) {
  const out = {
    name: seg.name,
    roots: seg.roots,
    missingRoots: [],
    filesScanned: 0,
    hits: [],
    result: 'not-verified',
  };

  for (const root of seg.roots) {
    // `--root` 允许绝对路径（测试用）。绝对路径再 join CWD 会拼出一个不存在的
    // 混合路径，而 walk() 对不存在目录是静默 return → 会报成「未验证」，
    // 看起来像"环境问题"，实际是路径拼错。这一行就是为那一次排查写的。
    const abs = isAbsolute(root) ? root : join(CWD, root);
    if (!(await exists(abs))) {
      out.missingRoots.push(root);
      continue;
    }
    for await (const file of walk(abs)) {
      const rel = relative(abs, file).split('\\').join('/');
      const relFromCwd = `${root}/${rel}`;
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      out.filesScanned += 1;
      const lines = text.split(/\r?\n/);
      for (const rule of RULES) {
        if (rule.skip && rule.skip(relFromCwd)) continue;
        if (rule.files && !rule.files(relFromCwd)) continue;
        for (let i = 0; i < lines.length; i += 1) {
          const m = lines[i].match(rule.pattern);
          if (!m) continue;
          out.hits.push({
            rule: rule.id,
            segment: seg.name,
            file: relFromCwd,
            line: i + 1,
            column: (m.index ?? 0) + 1,
            excerpt: lines[i].trim().slice(0, 120),
            why: rule.why,
          });
        }
      }
    }
  }

  // 三态：命中 → fail；跑到了但分母 ≤0 → fail（跑了没抓到，不是没跑）；
  //      根目录不存在 → not-verified。三者的修法完全不同，不许合并。
  const nothingHere = out.missingRoots.length === seg.roots.length;
  if (out.hits.length) out.result = 'fail';
  else if (nothingHere) out.result = 'not-verified';
  else if (out.filesScanned <= 0) out.result = 'fail';
  else out.result = 'pass';

  return out;
}

const segments = [];
for (const seg of SEGMENTS) segments.push(await runSegment(seg));

const LABEL = { pass: '通过', fail: '失败', 'not-verified': '未验证' };
const allHits = segments.flatMap((s) => s.hits);

// 总判定：任一段 fail → fail；否则任一段 not-verified → not-verified；否则 pass。
// **不做加权、不做"整体通过率"**——两段里有一段没跑，就不能叫通过。
const overall = segments.some((s) => s.result === 'fail')
  ? 'fail'
  : segments.some((s) => s.result === 'not-verified')
    ? 'not-verified'
    : 'pass';

// ── 输出 ────────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        // 顶层保留 scope 字段名会被误解成「一次扫了全部」，故只输出 targets。
        targets: segments.map((s) => ({
          name: s.name,
          roots: s.roots,
          missingRoots: s.missingRoots,
          filesScanned: s.filesScanned,
          rules: RULES.length,
          result: s.result,
          hits: s.hits.length,
        })),
        overall,
        rules: RULES.length,
        hits: allHits,
      },
      null,
      2,
    ),
  );
} else {
  // 每段一段报告：**分母各自打各自**。
  for (const s of segments) {
    const head = `[${s.name}] ${s.roots.join(' + ')}`;
    if (s.result === 'not-verified') {
      console.warn(`${head} 未验证：根目录不存在（${s.missingRoots.join(', ')}），这一层没跑，不等于通过。`);
    } else if (s.result === 'fail') {
      console.error(`${head} 失败：扫了 ${s.filesScanned} 个文件，${s.hits.length} 处命中。`);
    } else {
      console.log(`${head} 通过：扫了 ${s.filesScanned} 个文件，${RULES.length} 条规则，0 命中。`);
    }
    if (s.result === 'fail' && s.hits.length === 0) {
      console.error(`       ↑ 分母为 ${s.filesScanned}：目录在，但一个文件都没读到。这是路径/过滤配错了，不是"干净"。`);
    }
  }

  if (allHits.length) {
    const byRule = new Map();
    for (const h of allHits) byRule.set(h.rule, (byRule.get(h.rule) || 0) + 1);
    console.error(`\n共 ${allHits.length} 处命中，涉及 ${byRule.size} 条规则：\n`);
    for (const h of allHits) {
      console.error(`  [${h.segment}] ${h.file}:${h.line}:${h.column}  [${h.rule}]`);
      console.error(`    ${h.excerpt}`);
      console.error(`    为什么：${h.why}\n`);
    }
    console.error('修文案，不要改规则。');
  }

  console.log(
    `\n总判定：${LABEL[overall]}` +
      `（${segments.map((s) => `${s.name}=${LABEL[s.result]}`).join(' / ')}）`,
  );
  if (overall === 'not-verified') {
    console.warn('有一段没跑。--strict 下这算失败——一个没跑过的段不能让另一段替它作证。');
  }
}

// 退出码：fail 恒 1；not-verified 只在 --strict 下 1（本地开发时不阻塞，
// 但 CI 与 postbuild 必须带 --strict，否则"没跑"会被读成"过了"）。
process.exit(overall === 'fail' || (STRICT && overall === 'not-verified') ? 1 : 0);
