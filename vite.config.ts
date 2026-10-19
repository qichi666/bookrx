import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

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
  },
});
