import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const DOMAIN_DIR = fileURLToPath(new URL('../../src/domain/', import.meta.url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/**
 * 可复现性断言（P2-②）：打分路径里不得出现任何随机源或时钟。
 * 这不是风格检查——`Math.random` 或 `Date.now` 一旦进了打分，
 * 「同输入同输出」这个可单测的前提就没了，而闸门 0 的两项指标全部建立在它之上。
 */
describe('打分路径不含随机源 / 时钟', () => {
  const files = tsFiles(DOMAIN_DIR);

  it('扫到了文件（扫描对象为空只能报未验证，不能报通过）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('src/domain 下无 Math.random / Date.now / new Date', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const pat of ['Math.random', 'Date.now', 'new Date', 'performance.now']) {
        if (code.includes(pat)) offenders.push(`${f} → ${pat}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
