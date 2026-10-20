import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `tools/doc-audit.mjs` 自己的门禁。
 *
 * 它跟 `copy-audit` 是同一类问题：写好了、303 行、从没接过 `check`，
 * 因为一跑就有 18 处命中——其中 15 处是 `✓` `✗` 被当成 emoji（emoji 定义和
 * `style-audit` 不一致造成的假警报），只有 3 处是真错。
 *
 * 这里锁住的是"改完之后两件事仍然成立"：
 *  ① 真的坏了必须红（表格列数不齐、emoji）；
 *  ② 排版标记不许再红（`✓` `✗` 是表格里在用的标记，不是 emoji）。
 */

const SCRIPT = resolve('tools/doc-audit.mjs');
const dirs: string[] = [];

/**
 * 造一个临时文档根，返回**相对项目根的路径**。
 *
 * 不能用 `os.tmpdir()`：doc-audit 对绝对路径的 `--root` 会走进"扫到 0 个文件 → 未验证"，
 * 于是一条本该红的用例会以"未验证"退出——恰好也是非零退出码，看上去像通过了，
 * 实际什么都没测。相对路径是它真正支持的那种用法。
 */
function makeRoot(files: Record<string, string>): string {
  mkdirSync('.vitest-tmp', { recursive: true });
  const dir = mkdtempSync(join('.vitest-tmp', 'doc-audit-'));
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
    const out = execFileSync(process.execPath, [SCRIPT, '--root', dir, '--strict'], {
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
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // 临时目录清不掉不算测试失败
    }
  }
});

describe('doc-audit 必须能红', () => {
  it('表格某一行的列数和表头对不上 → 非零退出并指出行号', () => {
    const dir = makeRoot({
      'a.md': ['# 标题', '', '| 甲 | 乙 |', '|---|---|', '| 1 | 2 | 3 |', ''].join('\n'),
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('table-columns');
    expect(out).toContain('a.md:5');
  });

  it('文档里出现真 emoji → 拦下', () => {
    const dir = makeRoot({ 'a.md': ['# 标题', '', '这里有个 🔥', ''].join('\n') });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('emoji');
  });
});

describe('doc-audit 不许误红', () => {
  it('对比表里的 ✓ / ✗ 是排版标记，不算 emoji', () => {
    const dir = makeRoot({
      'a.md': [
        '# 标题',
        '',
        '| 方案 | 可行 |',
        '|---|---|',
        '| 甲 | ✓ |',
        '| 乙 | ✗ |',
        '',
        '箭头 → 与 ← 也是排版标记。',
        '',
      ].join('\n'),
    });
    const { code, out } = run(dir);
    expect(out).not.toContain('[emoji]');
    expect(code).toBe(0);
  });

  it('有文件但一个可检查对象都没有 → 报「没干活的检查不算通过」', () => {
    const dir = makeRoot({ 'a.md': '只是一行普通文字\n' });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('没干活的检查不算通过');
  });

  it('连文件都没有 → 报「未验证」，不冒充通过', () => {
    const dir = makeRoot({ 'a.txt': '放一个非 .md，让它扫不到文档\n' });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('未验证');
  });
});
