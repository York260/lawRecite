#!/usr/bin/env python3
"""在 index.html 的 CSS／JS 引用後面加上內容雜湊（?v=xxxxxxxx）。

GitHub Pages 會讓瀏覽器快取靜態檔約 10 分鐘；只要檔案內容變了網址就跟著變，
就不會發生「新的 index.html 配上舊的 style.css」而版面錯亂。每次改完程式後執行：

  python3 scripts/stamp_assets.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"


def digest(rel):
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]


def main():
    html = INDEX.read_text(encoding="utf-8")
    pattern = re.compile(r'((?:href|src)=")((?:assets|data)/[\w./-]+\.(?:css|js))(?:\?v=\w+)?(")')
    html, n = pattern.subn(lambda m: f"{m.group(1)}{m.group(2)}?v={digest(m.group(2))}{m.group(3)}", html)
    INDEX.write_text(html, encoding="utf-8")
    print(f"已更新 {n} 個引用")


if __name__ == "__main__":
    main()
