#!/usr/bin/env python3
"""把 index.html、樣式、程式與資料合併成單一 HTML 檔（方便傳到手機離線開啟）。

用法：
  python3 scripts/build_single.py                 # 輸出 dist/lawrecite.html
  python3 scripts/build_single.py --fragment OUT  # 只輸出 <title> 以後的內容（給外部包裝用）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def inline(html):
    css = (ROOT / "assets/style.css").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="assets/style\.css(?:\?v=\w+)?">', lambda m: "<style>\n" + css + "</style>", html)
    for src in ("data/laws.js", "data/sounds.js", "assets/app.js", "assets/duel.js"):
        js = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
        html = re.sub(r'<script src="' + re.escape(src) + r'(?:\?v=\w+)?"></script>', lambda m: "<script>\n" + js + "</script>", html)
    return html


def main():
    html = inline((ROOT / "index.html").read_text(encoding="utf-8"))
    if len(sys.argv) == 3 and sys.argv[1] == "--fragment":
        head = re.search(r"<title>.*?</head>", html, re.S).group(0).replace("</head>", "")
        app = re.search(r"<!--APP-->(.*)<!--/APP-->", html, re.S).group(1)
        out = Path(sys.argv[2])
        out.write_text(head + app, encoding="utf-8")
    else:
        out = ROOT / "dist/lawrecite.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(html, encoding="utf-8")
    print(f"已輸出 {out}（{out.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
