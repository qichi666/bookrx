"""真实浏览器冒烟：走一遍「问卷 → 结果 → 危机页 → 关于页」。

单元测试跑在 happy-dom 里，它不会告诉你 CSS 是否加载、路由是否 404、
localStorage 是否在真实浏览器下抛异常。这份脚本只回答一个问题：
**打包产物在浏览器里点得通吗。**

用法：
    npm run build              # 先出 dist
    python tools/smoke-browser.py

端口没人监听就自己拉一个 `vite preview`，跑完关掉——中途失败也不留僵尸进程。
截图落在 .vitest-tmp/shots/，出问题先看图。
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 4188
BASE = f"http://localhost:{PORT}/"
ROOT = Path(__file__).resolve().parent.parent
SHOT = ROOT / ".vitest-tmp" / "shots"

SOURCE_LABELS = ("书里写的", "你的回答", "书的标注")
FREE_TEXT = "每次开会轮到我说话，脑子就一片空白，怕别人觉得我没准备好"

problems: list[str] = []
console_errors: list[str] = []
server: subprocess.Popen[bytes] | None = None


def check(label: str, ok: bool, detail: str = "") -> None:
    print(("  OK   " if ok else "  FAIL ") + label + ((" -> " + detail) if detail else ""))
    if not ok:
        problems.append(label + ((" | " + detail) if detail else ""))


def port_open(port: int, timeout: float = 0.4) -> bool:
    for host in ("::1", "127.0.0.1"):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except OSError:
            continue
    return False


def start_preview() -> None:
    """端口没人监听就自己起一个。shell=True 是因为 Windows 上 npx 是 .cmd。"""
    global server
    if port_open(PORT):
        print(f"沿用已经在跑的 preview（:{PORT}）")
        return
    print(f"起一个 vite preview（:{PORT}）……")
    server = subprocess.Popen(
        f"npx vite preview --port {PORT} --strictPort",
        cwd=ROOT,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        if port_open(PORT):
            return
        time.sleep(0.5)
    stop_preview()
    sys.exit("[未验证] preview 没起来，浏览器冒烟无从谈起")


def stop_preview() -> None:
    """Windows 上 shell=True 起的是 cmd 外壳，只 kill 外壳不会带走 node，得整棵树杀。"""
    global server
    if server is None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(server.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        server.terminate()
    server = None


def run_checks() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 420, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        # ① 问卷第 1 屏
        page.goto(BASE, wait_until="networkidle")
        page.screenshot(path=str(SHOT / "01-quiz-step1.png"), full_page=True)
        check("首屏渲染出标题", page.locator("h1").count() > 0, page.locator("h1").first.inner_text()[:30])
        domains = page.locator(".domain-item")
        check("第 1 屏有困境域可点", domains.count() >= 4, f"{domains.count()} 个")

        domains.first.click()
        page.get_by_role("button", name="下一步").click()

        # ② 标签多选 + 主诉追问
        page.wait_for_timeout(200)
        tags = page.locator(".quiz-body .chips").first.locator("button.chip")
        check("第 2 屏有标签可点", tags.count() >= 3, f"{tags.count()} 个")
        tags.nth(0).click()
        picked_labels = [tags.nth(0).inner_text()]
        tags.nth(1).click()
        picked_labels.append(tags.nth(1).inner_text())
        page.screenshot(path=str(SHOT / "02-quiz-step2.png"), full_page=True)
        check("多选后出现主诉追问", page.locator(".primary-ask").count() == 1)
        # 选了两项就必须显式指定主诉（契约：primary_source 不允许 'order'）
        page.locator(".primary-ask button.chip").first.click()
        page.wait_for_timeout(150)
        check("主诉选定后「下一步」可点", page.get_by_role("button", name="下一步").is_enabled())
        page.get_by_role("button", name="下一步").click()

        # ③ 偏好 chip（全跳过）
        page.wait_for_timeout(200)
        rows = page.locator(".chip-row")
        check("第 3 屏有 chip 组（5 组阅读偏好 + 1 组沉重题材）", rows.count() >= 5, f"{rows.count()} 组")
        page.get_by_role("button", name="下一步").click()

        # ④ 自由文本
        page.wait_for_timeout(200)
        page.locator("textarea.free-text").fill(FREE_TEXT)
        page.screenshot(path=str(SHOT / "03-quiz-step4.png"), full_page=True)
        page.get_by_role("button", name="看推荐").click()

        # 结果页
        page.wait_for_selector(".summary-echo", timeout=8000)
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOT / "04-result.png"), full_page=True)
        marks = page.locator(".summary-echo mark").all_inner_texts()
        check("摘要条有回显片段", len(marks) > 0, " / ".join(marks))
        # 逐字回显的可验证形态：每段回显都必须逐字出现在「用户写下的话」或「用户点选的标签」里，
        # 不能是系统改写出来的概括
        sources = [FREE_TEXT, *picked_labels]
        leaked = [m for m in marks if m and not any(m in s for s in sources)]
        check("每段回显都逐字来自用户（未改写）", not leaked, " / ".join(leaked))
        cards = page.locator(".book-card")
        check("结果页有书卡", cards.count() > 0, f"{cards.count()} 张")

        # 理由展开（P1-3 三档来源）
        why = page.locator("details.why").first
        check("每张卡都有理由展开区", page.locator("details.why").count() == cards.count(),
              f"{page.locator('details.why').count()} / {cards.count()}")
        if why.count() > 0:
            why.locator("summary").click()
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOT / "05-why.png"), full_page=True)
            # 只看展开的那一张：折叠状态下子元素的 inner_text 是空串，
            # 扫全页会把「没展开」误读成「来源为空」
            src = why.locator(".why-source").all_inner_texts()
            check("理由展开后每行都有来源", len(src) > 0 and all(s.strip() for s in src), " / ".join(src))
            check("来源只在三档之内", all(s in SOURCE_LABELS for s in src), " / ".join(src))

        # 本地反馈
        fb = page.get_by_role("button", name="有用")
        check("反馈条可点", fb.count() == 1)
        if fb.count() == 1:
            fb.click()
            page.wait_for_timeout(300)
            stored = page.evaluate("() => localStorage.getItem('bookrx.feedback.v1')")
            check("反馈落进 localStorage", stored is not None and "useful" in (stored or ""))
            check("反馈里没有自由文本", "脑子" not in (stored or ""))
            page.screenshot(path=str(SHOT / "06-feedback.png"), full_page=True)

        # 危机页（懒加载独立 chunk）
        page.goto(BASE + "#/crisis", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOT / "07-crisis.png"), full_page=True)
        body = page.locator("body").inner_text()
        check("危机页有号码", any(n in body for n in ("12356", "82951332", "400-161-9995")), body[:40])
        out_links = page.locator("a[href^='http']")
        check("危机页有来源链接", out_links.count() >= 3, f"{out_links.count()} 个")

        # 关于页 / 框架页
        for path in ("#/about", "#/framework"):
            page.goto(BASE + path, wait_until="networkidle")
            page.wait_for_timeout(200)
            check(f"{path} 能打开且有内容", page.locator("h1, h2").count() > 0)

        page.goto(BASE, wait_until="networkidle")
        page.screenshot(path=str(SHOT / "08-back-home.png"), full_page=True)

        ctx.close()
        browser.close()


def main() -> int:
    SHOT.mkdir(parents=True, exist_ok=True)
    if not (ROOT / "dist" / "index.html").exists():
        print("[未验证] 没有 dist —— 先跑 npm run build。空产物下的「通过」没有意义。")
        return 1

    start_preview()
    try:
        run_checks()
    finally:
        stop_preview()

    print()
    if console_errors:
        print(f"[控制台报错] {len(console_errors)} 条：")
        for e in console_errors[:8]:
            print("  - " + e[:160])
        problems.append("控制台有报错")

    if problems:
        print(f"[失败] {len(problems)} 项：")
        for x in problems:
            print("  x " + x)
        return 1

    print(f"[通过] 打包产物在真实浏览器里走通了全流程，控制台无报错（截图见 {SHOT}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
