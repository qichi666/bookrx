import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `tools/copy-audit.mjs` 自己的门禁：**它必须能红，也必须不误红**。
 *
 * 这份审计 329 行、写完一直没接进 `npm run check`，实测一跑就有 5 处命中，
 * 其中 4 处是规则扫错了目标（注释里的复述、书名数据里的「解锁」、Vue 运行时的 `track(`）。
 * 那种命中不会让人去改文案，只会让人把规则关掉——所以这里两头都测：
 *  ① 真违规必须红（否则门禁是装饰）；
 *  ② 已知的假警报必须不红（否则门禁会被关掉）。
 *
 * 用 `cwd` 指向临时目录而不是 `--root`：`--root` 下段名是 `custom`，
 * `rel` 变成绝对路径，`rel.startsWith('dist/')` 这类按段收窄的判断会静默失效——
 * 那样测出来的"绿"和线上行为根本不是一回事。
 */

const SCRIPT = resolve('tools/copy-audit.mjs');
const dirs: string[] = [];

/** 造一个最小站点根：`files` 的键是相对该根的路径。 */
function makeRoot(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'copy-audit-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

function run(dir: string, args: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], {
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
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // 临时目录清不掉不算测试失败；%TEMP% 有批量删除闸门，这里不跟它较劲
    }
  }
});

describe('copy-audit 必须能红', () => {
  it('界面上写了被禁的判断句 → 非零退出，并指认规则与行号', () => {
    const dir = makeRoot({ 'src/components/X.vue': '<template>\n<p>你现在状态很差</p>\n</template>\n' });
    const { code, out } = run(dir, ['--targets', 'src']);
    expect(code).toBe(1);
    expect(out).toContain('crisis/verdict');
    expect(out).toContain('X.vue:2');
  });

  it('危机页源码里出现 track( → 拦下（这条是防埋点，不是防框架）', () => {
    const dir = makeRoot({ 'src/views/CrisisView.vue': '<script>\nreport.track("open");\n</script>\n' });
    const { code, out } = run(dir, ['--targets', 'src']);
    expect(code).toBe(1);
    expect(out).toContain('crisis/track-call');
  });

  it('扫到 0 个文件 → 报「未验证」，不得当作通过', () => {
    const dir = makeRoot({ 'README.md': '空的\n' });
    const { code, out } = run(dir, ['--targets', 'src', '--strict']);
    expect(code).toBe(1);
    expect(out).toContain('未验证');
  });
});

describe('copy-audit 不许误红', () => {
  it('打包产物里 Vue 运行时的 dep.track() 不算埋点', () => {
    // 这是 2026-10-21 的实测现场：dist 里 4 处 track( 全部来自 Vue，不是上报代码
    const dir = makeRoot({
      'dist/assets/crisis-abc.js': 'get value(){return this.dep.track(),this._value}\n',
    });
    const { code, out } = run(dir, ['--targets', 'dist']);
    expect(out).not.toContain('crisis/track-call');
    expect(code).toBe(0);
  });

  it('但真埋点包名出现在危机 chunk 里照样拦（收窄的是范围，不是意图）', () => {
    const dir = makeRoot({ 'dist/assets/crisis-abc.js': 'gtag("event","crisis_open");\n' });
    const { code, out } = run(dir, ['--targets', 'dist']);
    expect(code).toBe(1);
    expect(out).toContain('crisis/analytics');
  });

  it('书目数据里的书名不算界面文案（「解锁」是真实存在的书名用词）', () => {
    const dir = makeRoot({
      'dist/catalog/candidates/all.json': '[{"title":"解锁你的潜能","q":0.8}]\n',
    });
    const { code, out } = run(dir, ['--targets', 'dist']);
    expect(out).not.toContain('copy/filler');
    expect(code).toBe(0);
  });

  it('但 src 里的同款用词照样拦 —— 跳过数据文件不等于跳过自己的文案', () => {
    const dir = makeRoot({ 'src/components/Empty.vue': '<template>\n<p>开始你的阅读之旅</p>\n</template>\n' });
    const { code, out } = run(dir, ['--targets', 'src']);
    expect(code).toBe(1);
    expect(out).toContain('copy/filler');
  });
});
