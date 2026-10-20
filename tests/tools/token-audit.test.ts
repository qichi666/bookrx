import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `tools/token-audit.mjs` 自己的门禁：**它必须能红，也必须不误红**。
 *
 * 背景：阅读器的 5 个文件引用了 4 个从未定义过的令牌，而类型检查、样式门禁、
 * 构建**全绿**——因为 CSS 变量拼错不会报错，只会让那条声明被丢掉，背景静默消失。
 * 这条门禁就是为这类"看起来在跑、其实没在管"补的。所以两头都要测：
 *  ① 引用未定义令牌 → 必须红，且指出文件和行号；
 *  ② 全局令牌 / 文件内局部变量 / 注释里提到 → 必须不红。
 */

const SCRIPT = resolve('tools/token-audit.mjs');
const dirs: string[] = [];

function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'token-audit-'));
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

const TOKENS = ':root {\n  --text-primary: #1b1f1d;\n  --surface: #ffffff;\n}\n';

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // 临时目录删不掉不算失败
    }
  }
});

describe('token-audit 必须能红', () => {
  it('引用不存在的令牌 → 非零退出，并给出文件与行号', () => {
    const dir = makeRoot({
      'src/tokens.css': TOKENS,
      'src/components/X.vue': '<style scoped>\n.a {\n  background: var(--surface-raised);\n}\n</style>\n',
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('--surface-raised');
    expect(out).toContain('X.vue:3');
  });

  it('写了回退值也照样红 —— 回退值救显示效果，救不了拼错的意图', () => {
    const dir = makeRoot({
      'src/tokens.css': TOKENS,
      'src/views/Y.vue': '<style>\n.a { color: var(--text-inverse, var(--text-primary)); }\n</style>\n',
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('--text-inverse');
  });

  it('扫到 0 个文件 → 报「未验证」，不得当作通过', () => {
    const dir = makeRoot({ 'README.md': '空\n' });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('未验证');
  });

  it('找不到 tokens.css → 也是未验证（比的是空集合，绿得没有意义）', () => {
    const dir = makeRoot({ 'src/a.css': '.a { color: var(--text-primary); }\n' });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('未验证');
  });
});

describe('token-audit 不许误红', () => {
  it('全局令牌照常用', () => {
    const dir = makeRoot({
      'src/tokens.css': TOKENS,
      'src/a.css': '.a { color: var(--text-primary); background: var(--surface); }\n',
    });
    const { code } = run(dir);
    expect(code).toBe(0);
  });

  it('组件自己声明的局部变量算已定义', () => {
    const dir = makeRoot({
      'src/tokens.css': TOKENS,
      'src/b.vue': '<style>\n.box { --gap: 8px; padding: var(--gap); }\n</style>\n',
    });
    const { code } = run(dir);
    expect(code).toBe(0);
  });

  it('注释里提到的旧写法不算引用（否则逼人删解释）', () => {
    const dir = makeRoot({
      'src/tokens.css': TOKENS,
      'src/c.css': '/* 以前这里是 var(--surface-raised)，已删 */\n.a { color: var(--text-primary); }\n',
    });
    const { code, out } = run(dir);
    expect(out).not.toContain('--surface-raised');
    expect(code).toBe(0);
  });
});
