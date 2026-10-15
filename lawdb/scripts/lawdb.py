#!/usr/bin/env python3
"""查詢 lawdb。只讀 lawdb/laws/*.json，不依賴 lawRecite 的任何檔案。

  python3 lawdb/scripts/lawdb.py list
  python3 lawdb/scripts/lawdb.py show 政府採購法 56          # 條號可寫 85-1
  python3 lawdb/scripts/lawdb.py show 預算法 62 64           # 多條
  python3 lawdb/scripts/lawdb.py search 最有利標 [法規名稱關鍵字]
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAWS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((ROOT / "laws").glob("*.json"))]


def find_law(key):
    exact = [l for l in LAWS if key in (l["name"], l["pcode"])]
    part = exact or [l for l in LAWS if key in l["name"]]
    if len(part) != 1:
        sys.exit("找不到或不只一部：" + "、".join(l["name"] for l in part) if part else f"找不到法規：{key}")
    return part[0]


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd, args = argv[0], argv[1:]
    if cmd == "list":
        for l in LAWS:
            print(f'{l["pcode"]}  {l["name"]}  修正 {l["lastUpdate"]}  {len(l["articles"])} 條')
    elif cmd == "show" and len(args) >= 2:
        law = find_law(args[0])
        print(f'《{law["name"]}》 最新異動 {law["lastUpdate"]}')
        for no in args[1:]:
            hit = [a for a in law["articles"] if a["no"] == no]
            print(f'\n{hit[0]["label"]}\n{hit[0]["text"]}' if hit else f"\n（無第 {no} 條）")
    elif cmd == "search" and args:
        scope = [l for l in LAWS if len(args) < 2 or args[1] in l["name"]]
        for l in scope:
            for a in l["articles"]:
                if args[0] in a["text"]:
                    first = next(s for s in a["text"].split("\n") if args[0] in s)
                    print(f'《{l["name"]}》{a["label"]}：{first[:70]}')
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
