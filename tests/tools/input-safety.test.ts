import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `tools/input-safety.mjs` 自己的门禁：**它必须能红，也必须不误红**。
 *
 * 这条检查守的是一个「现在恰好成立」的性质：书里的 HTML 从来没有被交给浏览器解析。
 * 这种性质最容易被一次"为了方便"的改动打破，而且打破时不会有任何报错——
 * 页面照常渲染，只是用户导入的书可以执行脚本了。所以两头都要测：
 *  ① 写出 `v-html` / `innerHTML` / 放宽 CSP → 必须红；
 *  ② 注释里解释「为什么不用 v-html」→ 必须不红。
 */

const SCRIPT = resolve('tools/input-safety.mjs');
const dirs: string[] = [];

const GOOD_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'" />`;

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'input-safety-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

function run(dir: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('input-safety 必须能红', () => {
  it('组件里写了 v-html → 非零退出，并给出文件与行号', () => {
    const dir = makeRoot({
      'index.html': GOOD_CSP,
      'src/views/Bad.vue': '<template><div v-html="chapters"></div></template>\n',
    });
    const r = run(dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Bad.vue:1');
  });

  it('innerHTML 赋值 → 拦下', () => {
    const dir = makeRoot({
      'index.html': GOOD_CSP,
      'src/engine/inject.ts': 'export function f(el: HTMLElement, s: string) { el.innerHTML = s; }\n',
    });
    expect(run(dir).code).not.toBe(0);
  });

  it("CSP 里加了 'unsafe-inline' → 拦下（内联脚本就能跑了）", () => {
    const dir = makeRoot({
      'index.html': `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'" />`,
      'src/a.ts': 'export const a = 1;\n',
    });
    const r = run(dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('unsafe-inline');
  });

  it('CSP 整个没了 → 拦下', () => {
    const dir = makeRoot({
      'index.html': '<html><head></head></html>',
      'src/a.ts': 'export const a = 1;\n',
    });
    expect(run(dir).code).not.toBe(0);
  });

  it('扫到 0 个源文件 → 报「未验证」，不得当作通过', () => {
    const dir = makeRoot({ 'index.html': GOOD_CSP });
    const r = run(dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('未验证');
  });
});

describe('input-safety 不许误红', () => {
  it('注释里解释「为什么不用 v-html」不算违规', () => {
    const dir = makeRoot({
      'index.html': GOOD_CSP,
      'src/engine/import/html.ts': [
        '/**',
        ' * 这里不用 v-html：导入的书是不可信输入，innerHTML 会把控制权交给浏览器。',
        ' */',
        '// 也不要 srcdoc',
        'export const strip = (s: string): string => s;\n',
      ].join('\n'),
    });
    expect(run(dir).code).toBe(0);
  });

  it('正常的文本节点渲染 + 合规 CSP → 通过', () => {
    const dir = makeRoot({
      'index.html': GOOD_CSP,
      'src/components/Para.vue': '<template><p><span>{{ text }}</span></p></template>\n',
    });
    expect(run(dir).code).toBe(0);
  });
});
