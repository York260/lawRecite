# lawdb：警察特考（三等・行政管理）法規資料庫

獨立於 lawRecite 的法規資料庫。**不被 `index.html`、`assets/`、`data/`、`scripts/` 引用，也不會被它們讀取**，
刪掉整個 `lawdb/` 不影響網頁運作。

## 內容

- `laws/<PCode>.json`：一部法規一個檔，含名稱、類別、沿革、全部條文（含編章節）。
- `manifest.json`：收錄清單、各法最新異動日、抓取日（2026-10-15）。
- `scripts/fetch_laws.py`：重新下載、更新全部法規。
- `scripts/lawdb.py`：命令列查詢（見下）。

共 44 部，依據「警察組織與管理」特考專書筆記（警察組織、警政策略、執法倫理、性別、
警察預算、財務與後勤）所引用的法規，再補上應試時常搭配的相關法規。

## 查詢

```sh
python3 lawdb/scripts/lawdb.py list
python3 lawdb/scripts/lawdb.py show 政府採購法 36 56
python3 lawdb/scripts/lawdb.py show 政府採購法 85-1
python3 lawdb/scripts/lawdb.py search 最有利標 政府採購法   # 第二個參數可限定法規
```

## 更新

```sh
python3 lawdb/scripts/fetch_laws.py
```

來源是 [kong0107/mojLawSplitJSON](https://github.com/kong0107/mojLawSplitJSON)，
為[全國法規資料庫](https://law.moj.gov.tw/)每日轉出的 JSON 鏡像（本次鏡像最新資料日為 2026-09-24）。
考前請再用全國法規資料庫核對「最新異動」日期；鏡像不等於官方公告。

## 收錄法規

「筆記」欄：● 專書筆記中直接提到；○ 筆記未點名，為補充（應試常搭配或屬上位、程序法）。

### 警察組織與職權

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [警察法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080001) | 2002-06-12 | 20 | `D0080001` |
| ● | [警察法施行細則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080002) | 2000-11-22 | 16 | `D0080002` |
| ● | [內政部組織法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0000001) | 2025-12-10 | 7 | `D0000001` |
| ● | [內政部警政署組織法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0000159) | 2013-08-21 | 9 | `D0000159` |
| ● | [中央行政機關組織基準法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0010036) | 2025-01-20 | 39 | `A0010036` |
| ● | [警察勤務條例](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080026) | 2008-07-02 | 29 | `D0080026` |
| ● | [警察職權行使法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080145) | 2011-04-27 | 32 | `D0080145` |
| ● | [警械使用條例](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080042) | 2022-10-19 | 18 | `D0080042` |
| ● | [社會秩序維護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080067) | 2025-06-11 | 96 | `D0080067` |
| ● | [集會遊行法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080058) | 2021-01-27 | 35 | `D0080058` |
| ● | [刑事訴訟法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0010001) | 2026-05-13 | 712 | `C0010001` |

### 警察人事與倫理

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [警察人員人事條例](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0020005) | 2025-04-25 | 52 | `S0020005` |
| ● | [警察人員陞遷辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080111) | 2025-06-09 | 33 | `D0080111` |
| ● | [警察人員獎懲標準](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080179) | 2019-08-15 | 16 | `D0080179` |
| ○ | [警察教育條例](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080007) | 2002-06-05 | 16 | `D0080007` |
| ● | [公務員服務法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0020038) | 2022-06-22 | 27 | `S0020038` |
| ○ | [公務人員考績法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0040001) | 2025-11-19 | 25 | `S0040001` |
| ○ | [公務人員保障法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0120001) | 2025-07-09 | 111 | `S0120001` |

### 性別平等

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [性別平等工作法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030014) | 2023-08-16 | 50 | `N0030014` |
| ● | [性別平等教育法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0080067) | 2023-08-16 | 48 | `H0080067` |
| ● | [性騷擾防治法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050074) | 2023-08-16 | 34 | `D0050074` |
| ● | [性侵害犯罪防治法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080079) | 2023-02-15 | 56 | `D0080079` |
| ● | [家庭暴力防治法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050071) | 2023-12-06 | 77 | `D0050071` |

### 財務與預算

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [預算法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=T0020001) | 2021-06-09 | 101 | `T0020001` |
| ○ | [決算法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=T0020005) | 2011-05-25 | 33 | `T0020005` |
| ○ | [會計法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=T0030001) | 2022-06-15 | 123 | `T0030001` |
| ○ | [審計法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=U0010001) | 2015-12-09 | 82 | `U0010001` |
| ● | [財政收支劃分法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0320015) | 2025-12-03 | 44 | `G0320015` |
| ○ | [公共債務法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0360033) | 2021-06-09 | 13 | `G0360033` |
| ● | [地方制度法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0040003) | 2025-12-03 | 107 | `A0040003` |

### 後勤與採購

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [政府採購法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030057) | 2019-05-22 | 123 | `A0030057` |
| ○ | [政府採購法施行細則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030058) | 2021-07-14 | 127 | `A0030058` |
| ○ | [投標廠商資格與特殊或巨額採購認定標準](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030099) | 2015-10-29 | 18 | `A0030099` |
| ○ | [最有利標評選辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030080) | 2025-01-21 | 25 | `A0030080` |
| ○ | [採購評選委員會組織準則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030103) | 2026-05-08 | 11 | `A0030103` |
| ○ | [採購評選委員會審議規則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030102) | 2021-11-04 | 19 | `A0030102` |
| ● | [國有財產法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0370001) | 2018-11-21 | 79 | `G0370001` |
| ○ | [國有財產法施行細則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0370002) | 2010-07-23 | 85 | `G0370002` |
| ● | [各級警察機關學校武器彈藥統籌調配辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0080043) | 2019-06-04 | 8 | `D0080043` |

### 行政法通則

| 筆記 | 法規 | 最新異動 | 條數 | PCode |
|---|---|---|---|---|
| ● | [中華民國憲法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000001) | 1947-01-01 | 175 | `A0000001` |
| ○ | [中華民國憲法增修條文](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000002) | 2005-06-10 | 12 | `A0000002` |
| ○ | [行政程序法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030055) | 2021-01-20 | 176 | `A0030055` |
| ○ | [行政執行法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030023) | 2010-02-03 | 45 | `A0030023` |
| ○ | [行政罰法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030210) | 2022-06-15 | 46 | `A0030210` |

## 未收錄

- 《警察人員管理條例》：資料來源查無此法（現行為《警察人員人事條例》）。
- 專書筆記本身（老師的講義）未放進 repo，這個儲存庫是公開的，避免散布他人著作。
