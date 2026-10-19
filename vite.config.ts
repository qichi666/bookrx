import { mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/**
 * 与 cacheDir 同病的第二处：vitest 的 SSR / web 转换缓存走 `os.tmpdir()`，
 * 在受限环境（沙箱 / 只读 temp）抛 EPERM——worker 被杀时测试计数会随机变少
 * （18/21 个文件、110 条，看起来像"某些用例消失了"）、退出码非零。
 *
 * 两处都踩过：系统 temp 被拦一次；改到 node_modules/.tmp 后又踩一次（node_modules
 * 下某些路径的写入同样被拒，且失败发生在 worker 里，主进程只看到文件数对不上）。
 * 定式：落到**工作区根目录**下的 .vitest-tmp/——项目根是可写的，且已 gitignore。
 */
const TMP_DIR = fileURLToPath(new URL('./.vitest-tmp', import.meta.url));
mkdirSync(TMP_DIR, { recursive: true });
// Windows 上 os.tmpdir() 只认 TEMP / TMP；TMPDIR 是 Unix 惯例，三个都设
process.env.TMPDIR = TMP_DIR;
process.env.TMP = TMP_DIR;
process.env.TEMP = TMP_DIR;

// P8 危机页必须是独立 chunk：copy-audit 层 2 有三条规则按 crisis-* 文件名收窄，
// 被并进主包时那三条规则会静默失效（不报错、也不命中）。
export default defineConfig({
  plugins: [vue()],
  /**
   * 显式指定缓存目录。默认落在系统临时目录，某些受限环境（沙箱 / CI 只读 temp）
   * 会在写缓存时抛 EPERM —— 那种错误不来自被测代码，但会让整个测试进程非零退出，
   * 看起来和"有一条断言挂了"一模一样。
   */
  cacheDir: 'node_modules/.vite',
  /**
   * 相对 base：GitHub Pages 项目页部署在 /<repo>/ 子路径下，
   * 默认的绝对 /assets/ 会 404。hash 路由不受 base 影响。
   */
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          // Windows 的路径分隔符是 `\`，不归一化的话这条判断在本机恒为假：
          // 构建照常成功、产物里没有 crisis-*.js，只有 postbuild 才发现——而那时
          // 失败看起来像"构建炸了"，真正的改动在配置里。
          if (id.replace(/\\/g, '/').includes('src/views/CrisisView')) return 'crisis';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    /**
     * 文件级串行。vitest 会把每个转换后的模块写进 `tmpDir/<ssr|web>/<hash>`
     * （resolveConfig 里 `cacheFs: true` 硬编码，没有开关可选），多个 worker
     * 并发写同一路径在 Windows 上会撞 EPERM：worker 直接被 kill，主进程只看到
     * **文件数悄悄变少**（19/21）+ 退出码 1 + 一条 "Unhandled Error"，
     * 看起来像"有几条用例凭空消失"，极难归因。
     * 本套件 21 个文件、百来条用例，串行只多花几秒，换确定性值得。
     */
    fileParallelism: false,
  },
});
