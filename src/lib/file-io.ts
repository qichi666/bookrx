/**
 * 文件读写的最小封装（导出书单 / 导入书单 / 导入 EPUB）。
 *
 * 单独放一层是因为"下载"在测试环境里不存在（happy-dom 没有 URL.createObjectURL），
 * 把它收在一处，组件测试可以只 stub 这一个模块，而不是给每个组件写一套 DOM 桩。
 */

/** 触发浏览器下载。filename 由调用方决定（导出书单用带时间戳的名字）。 */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分浏览器上会让下载中断；一个宏任务之后回收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTextFile(file: File | Blob): Promise<string> {
  return file.text();
}

export async function readArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/** 体积的人类可读写法（导入失败态里要说"你的文件 62 MB，上限 50 MB"） */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
