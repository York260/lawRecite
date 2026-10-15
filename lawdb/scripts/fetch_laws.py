#!/usr/bin/env python3
"""下載 lawdb 收錄的法規，輸出 lawdb/laws/<PCode>.json 與 lawdb/manifest.json。

資料來源：kong0107/mojLawSplitJSON（全國法規資料庫每日轉出的 JSON 鏡像）。
用法：python3 lawdb/scripts/fetch_laws.py        # 全部重抓（更新用）
"""
import json, re, sys, time, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://raw.githubusercontent.com/kong0107/mojLawSplitJSON/gh-pages/"

# (分組, PCode, 名稱)。名稱僅供對照，實際以下載內容的「法規名稱」為準。
LAWS = [
    ("警察組織與職權", "D0080001", "警察法"),
    ("警察組織與職權", "D0080002", "警察法施行細則"),
    ("警察組織與職權", "D0000001", "內政部組織法"),
    ("警察組織與職權", "D0000159", "內政部警政署組織法"),
    ("警察組織與職權", "A0010036", "中央行政機關組織基準法"),
    ("警察組織與職權", "D0080026", "警察勤務條例"),
    ("警察組織與職權", "D0080145", "警察職權行使法"),
    ("警察組織與職權", "D0080042", "警械使用條例"),
    ("警察組織與職權", "D0080067", "社會秩序維護法"),
    ("警察組織與職權", "D0080058", "集會遊行法"),
    ("警察組織與職權", "C0010001", "刑事訴訟法"),
    ("警察人事與倫理", "S0020005", "警察人員人事條例"),
    ("警察人事與倫理", "D0080111", "警察人員陞遷辦法"),
    ("警察人事與倫理", "D0080179", "警察人員獎懲標準"),
    ("警察人事與倫理", "D0080007", "警察教育條例"),
    ("警察人事與倫理", "S0020038", "公務員服務法"),
    ("警察人事與倫理", "S0040001", "公務人員考績法"),
    ("警察人事與倫理", "S0120001", "公務人員保障法"),
    ("性別平等", "N0030014", "性別平等工作法"),
    ("性別平等", "H0080067", "性別平等教育法"),
    ("性別平等", "D0050074", "性騷擾防治法"),
    ("性別平等", "D0080079", "性侵害犯罪防治法"),
    ("性別平等", "D0050071", "家庭暴力防治法"),
    ("財務與預算", "T0020001", "預算法"),
    ("財務與預算", "T0020005", "決算法"),
    ("財務與預算", "T0030001", "會計法"),
    ("財務與預算", "U0010001", "審計法"),
    ("財務與預算", "G0320015", "財政收支劃分法"),
    ("財務與預算", "G0360033", "公共債務法"),
    ("財務與預算", "A0040003", "地方制度法"),
    ("後勤與採購", "A0030057", "政府採購法"),
    ("後勤與採購", "A0030058", "政府採購法施行細則"),
    ("後勤與採購", "A0030099", "投標廠商資格與特殊或巨額採購認定標準"),
    ("後勤與採購", "A0030080", "最有利標評選辦法"),
    ("後勤與採購", "A0030103", "採購評選委員會組織準則"),
    ("後勤與採購", "A0030102", "採購評選委員會審議規則"),
    ("後勤與採購", "G0370001", "國有財產法"),
    ("後勤與採購", "G0370002", "國有財產法施行細則"),
    ("後勤與採購", "D0080043", "各級警察機關學校武器彈藥統籌調配辦法"),
    ("行政法通則", "A0000001", "中華民國憲法"),
    ("行政法通則", "A0000002", "中華民國憲法增修條文"),
    ("行政法通則", "A0030055", "行政程序法"),
    ("行政法通則", "A0030023", "行政執行法"),
    ("行政法通則", "A0030210", "行政罰法"),
]


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))


def article_key(label):
    m = re.match(r"第\s*([0-9]+(?:-[0-9]+)?)\s*條", label)
    return m.group(1) if m else label


def convert(raw):
    chapter, arts = "", []
    for it in raw["法規內容"]:
        if "編章節" in it:
            chapter = re.sub(r"\s+", " ", it["編章節"]).strip()
        else:
            arts.append({
                "no": article_key(it["條號"]),
                "label": re.sub(r"\s+", "", it["條號"]),
                "chapter": chapter,
                "text": it["條文內容"].replace("\r\n", "\n").strip(),
            })
    return {
        "pcode": raw["法規網址"].rsplit("=", 1)[-1],
        "name": raw["法規名稱"],
        "type": raw["法規性質"],
        "category": raw["法規類別"],
        "lastUpdate": raw["最新異動日期"],
        "url": raw["法規網址"],
        "history": raw.get("沿革內容", "").replace("\r\n", "\n"),
        "articles": arts,
    }


def main():
    (ROOT / "laws").mkdir(exist_ok=True)
    manifest = {"fetched": date.today().isoformat(), "source": BASE, "laws": []}
    for group, pcode, label in LAWS:
        raw = json.loads(get(f"{BASE}FalVMingLing/{pcode}.json"))
        law = convert(raw)
        if law["name"] != label:
            print(f"!! 名稱不符 {pcode}: 預期 {label}，實際 {law['name']}", file=sys.stderr)
        (ROOT / "laws" / f"{pcode}.json").write_text(
            json.dumps(law, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        manifest["laws"].append({
            "group": group, "pcode": pcode, "name": law["name"], "type": law["type"],
            "lastUpdate": law["lastUpdate"], "articles": len(law["articles"]),
            "url": law["url"],
        })
        print(f"{pcode} {law['name']} {law['lastUpdate']} {len(law['articles'])}條")
    (ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
