#!/usr/bin/env python3
"""把法規純文字（pdftotext -layout 輸出）轉成網頁用的 data/laws.js。

每一行條文會附上：
  z: 每個字可接受的注音首（多音字可有多個，第一個為主要讀音），標點為空字串，以 | 分隔
  k: 每個字的挖空等級字串（0 = 不挖，1 = 低密度就挖，2 = 中，3 = 高）

用法：
  pip install pypinyin
  python3 scripts/build_data.py
"""
import json
import re
from pathlib import Path

from pypinyin import Style, pinyin

from keywords import LEVELS, PATTERNS
from titles import TITLES

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    {"id": "police-personnel", "file": ROOT / "data/source/police-personnel.txt"},
]
OUT = ROOT / "data/laws.js"
SOUNDS_OUT = ROOT / "data/sounds.js"

ZHUYIN = set("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ")
HAN = re.compile(r"[㐀-鿿]")
NUM = "一二三四五六七八九十"

# 常見多音字（含臺灣讀音）可接受的注音首。pypinyin 的全部異讀太寬，只採用這份清單。
POLYPHONES = {
    "行": "ㄒㄏ", "曾": "ㄘㄗ", "長": "ㄓㄔ", "重": "ㄓㄔ", "率": "ㄌㄕ", "調": "ㄉㄊ",
    "給": "ㄍㄐ", "降": "ㄐㄒ", "會": "ㄏㄎ", "解": "ㄐㄒ", "校": "ㄒㄐ", "合": "ㄏㄍ",
    "識": "ㄕㄓ", "於": "ㄩㄨ", "屬": "ㄕㄓ", "擇": "ㄗㄓ", "嚇": "ㄏㄒ", "強": "ㄑㄐ",
    "差": "ㄔㄘ", "查": "ㄔㄓ", "參": "ㄘㄕ", "省": "ㄕㄒ", "便": "ㄅㄆ", "藏": "ㄘㄗ",
    "傳": "ㄔㄓ", "乘": "ㄔㄕ", "車": "ㄔㄐ", "說": "ㄕㄩ", "術": "ㄕㄓ", "量": "ㄌ", "暫": "ㄓㄗ",
}

RE_ART = re.compile(r"^\s*第\s*(\d+(?:-\d+)?)\s*條\s*$")
RE_CHAP = re.compile(rf"^\s*第\s*([{NUM}]+)\s*章\s*(\S+)\s*$")
RE_PARA = re.compile(r"^(\d+)\s{2,}(\S.*)$")
RE_ITEM = re.compile(rf"^\s*([{NUM}]+、)(.+)$")
RE_META = re.compile(r"^\s*(法規名稱|修正日期)：(.+)$")


def first_symbol(reading):
    for ch in reading:
        if ch in ZHUYIN:
            return ch
    return ""


def zhuyin_initials(text):
    """回傳每個字可接受的注音首字串。"""
    out = [""] * len(text)
    for m in re.finditer(r"[㐀-鿿]+", text):
        run = m.group()
        main = pinyin(run, style=Style.BOPOMOFO)
        for i, ch in enumerate(run):
            opts = [first_symbol(main[i][0])]
            for s in POLYPHONES.get(ch, ""):
                if s not in opts:
                    opts.append(s)
            opts = [o for o in opts if o]
            if not opts:
                raise SystemExit(f"找不到讀音：{ch}（{text}）")
            out[m.start() + i] = "".join(opts)
    return out


def keyword_levels(text):
    """依關鍵字表與規則給每個字挖空等級；先比對到的（等級低者優先）不會被覆蓋。"""
    lv = [0] * len(text)

    def mark(start, end, level):
        if any(lv[i] for i in range(start, end)):
            return
        for i in range(start, end):
            if HAN.match(text[i]):
                lv[i] = level

    for level in (1, 2, 3):
        for pat in PATTERNS.get(level, []):
            for m in re.finditer(pat, text):
                g = m.lastindex or 0
                mark(m.start(g), m.end(g), level)
        # 詞表：長詞優先
        for word in sorted(LEVELS.get(level, []), key=len, reverse=True):
            for m in re.finditer(re.escape(word), text):
                mark(m.start(), m.end(), level)
    return "".join(str(x) for x in lv)


def parse(path):
    meta, articles = {}, []
    chapter, art = "", None
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        if m := RE_META.match(raw):
            meta[m.group(1)] = re.sub(r"\s+", " ", m.group(2).strip())
            continue
        if m := RE_CHAP.match(raw):
            chapter = f"第{m.group(1)}章 {m.group(2)}"
            continue
        if m := RE_ART.match(raw):
            art = {"id": m.group(1), "chapter": chapter, "lines": []}
            articles.append(art)
            continue
        if art is None:
            continue
        if m := RE_PARA.match(raw):
            art["lines"].append({"label": m.group(1), "kind": "para", "t": m.group(2)})
        elif m := RE_ITEM.match(raw):
            art["lines"].append({"label": m.group(1), "kind": "item", "t": m.group(2)})
        elif art["lines"]:
            art["lines"][-1]["t"] += raw
        else:
            art["lines"].append({"label": "", "kind": "para", "t": raw})

    for art in articles:
        for line in art["lines"]:
            t = re.sub(r"\s+", "", line["t"])
            line["t"] = t
            line["z"] = "|".join(zhuyin_initials(t))
            line["k"] = keyword_levels(t)
    return meta, articles


def big5_common():
    """Big5 常用字（A440–C67E，共 5401 字）。"""
    out = []
    for lead in range(0xA4, 0xC7):
        for trail in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            if (lead, trail) > (0xC6, 0x7E):
                return out
            try:
                out.append(bytes([lead, trail]).decode("big5"))
            except UnicodeDecodeError:
                pass
    return out


def build_sounds(extra_chars):
    """語音模式用：無聲調注音 → 同音字，讓辨識出的同音字也算對。"""
    groups = {}
    for ch in sorted(set(big5_common()) | set(extra_chars)):
        if not HAN.match(ch):
            continue
        for r in pinyin(ch, style=Style.BOPOMOFO, heteronym=True)[0]:
            syl = "".join(c for c in r if c in ZHUYIN)
            if syl and ch not in groups.setdefault(syl, []):
                groups[syl].append(ch)
    body = "|".join(f"{syl}:{''.join(chs)}" for syl, chs in sorted(groups.items()))
    SOUNDS_OUT.write_text(
        "// 由 scripts/build_data.py 產生，請勿手動修改\nwindow.LAW_SOUNDS = " + json.dumps(body, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def main():
    laws = []
    for src in SOURCES:
        meta, articles = parse(src["file"])
        titles = TITLES.get(src["id"], {})
        for art in articles:
            art["title"] = titles.get(art["id"], "")
        missing = [a["id"] for a in articles if not a["title"]]
        if missing:
            print(f"注意：{src['id']} 第 {'、'.join(missing)} 條沒有條名")
        laws.append({
            "id": src["id"],
            "name": meta.get("法規名稱", src["id"]),
            "date": meta.get("修正日期", ""),
            "articles": articles,
        })
    body = json.dumps(laws, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "// 由 scripts/build_data.py 產生，請勿手動修改\nwindow.LAWS = " + body + ";\n",
        encoding="utf-8",
    )
    build_sounds(c for law in laws for a in law["articles"] for l in a["lines"] for c in l["t"])
    for law in laws:
        chars = [c for a in law["articles"] for l in a["lines"] for c in l["t"] if HAN.match(c)]
        levels = "".join(l["k"] for a in law["articles"] for l in a["lines"])
        n = len(chars)
        print(f"{law['name']}：{len(law['articles'])} 條，{n} 字")
        for d in (1, 2, 3):
            blank = sum(1 for c in levels if c != "0" and int(c) <= d)
            print(f"  挖空等級 {d}：{blank} 字（{blank / n:.0%}）")


if __name__ == "__main__":
    main()
