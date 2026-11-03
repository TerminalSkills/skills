---
name: trademark-clearance
description: >-
  Screens a proposed brand, product or company name for trademark conflicts before launch or filing: builds exact, phonetic and spelling-variant searches for the USPTO Trademark Search system, checks each hit in TSDR, covers foreign registers through TMview and the WIPO Global Brand Database, looks for unregistered (common law) use and domains, rates each conflict with the du Pont likelihood-of-confusion factors, and writes a clearance report with filing costs and next steps. Use when a user asks "is this name trademarked", "can I use this brand name", "run a trademark search", "check a name before we launch", "trademark knockout search", or "will the USPTO refuse my mark". Produces a screening report, not a legal opinion.
license: Apache-2.0
compatibility: "A browser automation tool (Playwright MCP or similar) to drive tmsearch.uspto.gov, TSDR, TMview and the WIPO Global Brand Database, which are JavaScript apps with no keyless public API; curl for RDAP domain lookups. No API keys."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: "trademark, uspto, brand-naming, clearance-search, legal-research"
---

# Trademark Clearance

## Overview

Before a team prints a name on a product, it needs to know two things: whether someone already owns rights in a confusingly similar mark for related goods, and whether the USPTO would refuse to register it. This skill runs that screening the way a trademark paralegal does a knockout search, then writes a report a founder can act on or hand to an attorney.

What it covers:

- **Registrability:** descriptiveness and other refusals under Lanham Act §2 (15 U.S.C. §1052).
- **Federal conflicts:** the USPTO Trademark Search system at `tmsearch.uspto.gov`, which replaced TESS in November 2023, and each hit's record in TSDR.
- **Foreign conflicts:** TMview (`tmdn.org/tmview`, 81 offices listed on its search page in November 2026, including the EUIPO, the UK, China and the US) and the WIPO Global Brand Database (`branddb.wipo.int`).
- **Unregistered use:** U.S. rights come from use, so an unregistered business can block you in its area.
- **Analysis and report:** the du Pont factors, a risk rating per conflict, and a recommendation.

This is a screening, not a legal opinion, and no search can promise a name is free. The agent never files, signs declarations, pays fees or creates USPTO accounts for the user.

## Instructions

### 1. Collect the inputs

Use what the user gave. If an item is missing, state an assumption in the report and continue, such as "U.S. only" or "not yet in use". A broad category is enough to start: "a mobile app" means class 9, plus 42 if it runs as a service. Stop to ask only when not even the kind of product is known.

1. **The mark** exactly as it will be used: the word(s), any logo, any stylized spelling.
2. **Goods and services** in plain words ("subscription software for scheduling dental appointments").
3. **Markets:** U.S. states now, countries within 2–3 years, sales channels.
4. **Applicant domicile:** where the owner lives or is incorporated.
5. **Launch date** and whether the name is already in use.

Map the goods to Nice classes. The 13th edition, NCL(13-2026), has been in force since 1 January 2026. Use the USPTO ID Manual at `https://idm-tmng.uspto.gov/` for pre-approved wording. ID Manual entries avoid the $200-per-class free-text surcharge. Common software startup classes: 9 (downloadable software), 42 (SaaS, software design), 35 (retail, advertising, business services).

### 2. Check registrability first

A name nobody else uses can still be refused. Place it on the strength spectrum: **generic** (never registrable), **descriptive** (refused under §2(e)(1) unless it has acquired distinctiveness), **suggestive**, **arbitrary**, **fanciful** (strongest). "Fast Invoice" for invoicing software is descriptive. "Lightbeam" for dashboards is arbitrary or suggestive. Also flag surnames (§2(e)(4)), geographic terms (§2(e)(2)), and anything that falsely suggests a connection with a person or institution (§2(a)).

### 3. Build the search variants

Write the list before searching, so the report can show what was covered:

- the exact mark, and each word of a multi-word mark on its own;
- phonetic equivalents and misspellings (LIGHTBEAM, LITEBEAM, LYTEBEEM);
- split and joined forms (LIGHT BEAM, LIGHT-BEAM);
- translations of foreign words: under the doctrine of foreign equivalents, KVITKA (Ukrainian for "flower") is compared with FLOWER. Since *In re Vetements Group AG* (Fed. Cir. 2025), the USPTO translates unless it is shown that American buyers, including those who speak the language, would be unlikely to stop and translate (TMEP §1207.01(b)(vi));
- the dominant word with common prefixes and suffixes removed (GET-, -LY, -HQ, -AI).

### 4. Search the USPTO register

Open `https://tmsearch.uspto.gov/search/search-information`, set the search box dropdown to **Field tag and Search builder**, type the query and press Enter. Results show the wordmark, live/dead status, class, serial number and owner. When a query has exactly one hit, the site skips the list and opens that record (the URL ends in the serial number). There is no keyless public API, so drive the page with a browser tool. Without one, give the user the exact queries and ask for the results or the **Export** file.

Syntax, from the USPTO field tag and regex handouts:

- Field tags are UPPERCASE and end with a colon; search terms are lowercase; `AND`, `OR`, `AND NOT` are uppercase.
- `CM:` searches the word mark, pseudo mark, translation and transliteration together. Use it by default.
- `LD:true` keeps live records, `LD:false` dead ones. `IC:009` is an international class (three digits). `CC:009` adds classes the USPTO treats as coordinated with class 9. `GS:` searches the goods/services text. `OW:` is the owner. `SN:` and `RN:` are serial and registration numbers.
- `*` and `?` are wildcards outside quotes. `"..."` is an exact phrase. `"zebra star"~3` is a proximity search.
- A regex goes between slashes and must match the **whole word**. `/l[iy]te?b/` matches nothing. Add `.*` to catch the term inside longer words.

Query set for LIGHTBEAM in classes 9 and 42:

```text
CM:lightbeam
CM:"light beam" AND LD:true
CM:/l[iy]g?h?te?b[aeiy]{1,3}m{1,2}/ AND LD:true AND IC:(009 042)
CM:/.*l[iy]g?h?te?b[aeiy]{1,3}m.*/ AND LD:true AND CC:(009 042)
CM:/.*beam.*/ AND LD:true AND GS:(analytics dashboard*)
CM:/l[iy]g?h?te?b[aeiy]{1,3}m{1,2}/ AND LD:false
```

USPTO phonetic sets to substitute: hard K `[ckqx]{1,2}`, soft S `[scz]{1,2}`, F/PH `[fph]{1,2}`, J/G `d{0,1}[gj][eiy]{1,2}`, -TION `[scth]{1,3}[aeiouy]{1,2}n`, -ITE/-IGHT `[iy][gh]{0,2}t`.

The fourth query widens to marks containing the term and to coordinated classes, the fifth checks how crowded the dominant word is, and the last finds dead records. A dead registration is not cited against an application, but its owner may still be using the name and hold common-law rights.

### 5. Read each relevant hit in TSDR

Open the record by serial number:

```text
https://tsdr.uspto.gov/#caseNumber=97486509&caseType=SERIAL_NO&searchType=statusSearch
```

Record the mark, owner, status, filing and registration dates, register (Principal or Supplemental), filing basis, and the full goods/services text. Also note when maintenance filings are due: a §8 declaration between years 5 and 6, then renewal every 10 years. A registration past its deadline may soon be cancelled.

### 6. Search foreign registers when the user sells abroad

- **TMview** (`https://www.tmdn.org/tmview/`): one search across EUIPO (`EM`), national EU offices, the UK, China, Japan, Korea, the US and others.
- **WIPO Global Brand Database** (`https://branddb.wipo.int/en/similarname`): choose the **Phonetic** or **Fuzzy** search strategy and filter by Nice class and designated country. It includes Madrid international registrations.

Most countries outside the U.S. are first-to-file: whoever files first owns the mark, whatever their use. Flag every market on the user's roadmap where the name is not yet filed, China especially.

### 7. Look for unregistered use and domains

- Web search the name with the product terms, and check app stores, GitHub, Amazon, Product Hunt and social handles.
- Search the Secretary of State business entity database in each state where the user will operate. An entity name is not a trademark, but it shows who may be using the name.

Check domains over RDAP:

```bash
curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' https://rdap.org/domain/lightbeam.com
```

Check only a domain made of letters, digits, hyphens and dots, and keep the URL in quotes, because the name comes from the user. A `200` means registered. A `404` from the registry's own server (the effective URL has moved off `rdap.org`) means not registered. A `404` still on `rdap.org` means the TLD has no RDAP service: `.io`, `.co` and `.de` do not, and `google.io` returns 404 there. For those, use the registry's or a registrar's WHOIS page.

### 8. Rate each conflict

The USPTO decides §2(d) refusals with the du Pont factors (*In re E. I. du Pont de Nemours & Co.*, 476 F.2d 1357 (C.C.P.A. 1973); TMEP §1207.01):

1. similarity of the marks in appearance, sound, connotation and commercial impression;
2. relatedness of the goods or services as described in the application and registration;
3. trade channels; 4. conditions of sale (impulse or careful, sophisticated buyers);
5. fame of the prior mark; 6. number and nature of similar marks in use on similar goods;
7. actual confusion; 8. concurrent use without confusion;
9. variety of goods under the prior mark; 10. market interface, such as consent agreements;
11. the applicant's right to exclude others; 12. extent of potential confusion; 13. any other probative fact.

The first two factors carry most cases. The goods need not be identical, only related enough that buyers would assume one source. Courts deciding infringement use similar circuit tests, such as *Polaroid* in the Second Circuit and *Sleekcraft* in the Ninth.

Ratings:

- **High:** same or nearly same mark, live, and identical or closely related goods. Expect a §2(d) refusal or a demand letter.
- **Moderate:** similar mark with related goods, or same mark in a neighbouring class; weak marks in a crowded field.
- **Low:** different commercial impression, unrelated goods, or a dead record with no sign of use.

### 9. Write the report

Use these sections:

1. Mark, goods, classes, markets, search date.
2. Variants and queries run, with sources.
3. Registrability findings.
4. A conflict table with mark, owner, serial or registration number, status, classes, goods and risk.
5. The analysis of each High and Moderate conflict.
6. A recommendation: **clear to proceed**, **proceed with changes**, or **choose another name**.
7. Next steps and costs.
8. The limits of the search.

### 10. Next steps and costs

USPTO fees per class, in effect since 18 January 2025:

| Item | Fee |
|---|---|
| Base application | $350 |
| Insufficient information surcharge | $100 |
| Free-text goods instead of ID Manual | $200 |
| Each extra 1,000 characters of goods text | $200 |
| Statement of use, for an intent-to-use filing | $150 |
| Each 6-month extension to file the statement of use | $125 |

- New applications are filed in Trademark Center (`https://trademarkcenter.uspto.gov/`), which replaced the TEAS application forms on 18 January 2025.
- File on use (§1(a)) if the mark is in commerce, otherwise intent-to-use (§1(b)). After a notice of allowance, the statement of use is due within 6 months, extendable up to five times.
- An owner domiciled outside the U.S. must file through a U.S.-licensed attorney (37 C.F.R. §2.11).
- Whoever files must verify their identity for their USPTO.gov account (ID.me or paper). One account per person.
- After registration: a watch service, §8 at years 5–6, §15 incontestability after five years of continuous use, §8 and §9 renewal every 10 years.

## Examples

### Example 1: A SaaS dashboard named "Lightbeam"

A founder plans to sell "Lightbeam", a hosted analytics dashboard, in the U.S., in classes 9 and 42. The step 4 queries, run on 3 November 2026, returned:

| Mark | Owner | Serial | Classes | Goods | Risk |
|---|---|---|---|---|---|
| LIGHTBEAM, live, Reg. 7706971 (Feb. 25, 2025) | LightBeam.ai, Inc. | 97486509 | 9, 42 | downloadable software for enabling secure… | High |
| LIGHTBEAM, live | PaperFree Corporation | 78567763 | 9 | software for receiving, capturing, storing, organizing… | High |
| LIGHTBEAMERS, live | Mindfit Coaching, Inc. | 88807841 | 41, 42 | online instruction | Moderate |
| LITEBEAM, live | Ubiquiti Inc. | 86657214 | 9 | radio transmission antennas | Low |
| LIGHTBEAM SYSTEMS, cancelled | Donn Marcus Gurule | 77253270 | 9, 42 | — | Check for use |

The phonetic query limited to `IC:(009 042)` found the first, second and fourth rows. LIGHTBEAMERS only appeared once the query used `CC:` and `.*`. The two LIGHTBEAM registrations are the same mark for software, so a §2(d) refusal is likely, and LightBeam.ai can oppose or sue. LITEBEAM sounds the same, but it covers antenna hardware sold to network installers. The `beam` query returned 11 live marks for analytics or dashboard software, including GLASSBEAM, BOOKBEAM and SUNBEAM. A variant such as "Beamline" would therefore sit in a crowded field and get only narrow protection.

The report recommends **choosing another name** and re-running the search on the shortlist. `lightbeam.io` could not be checked over RDAP because `.io` has no RDAP service, so the report points the user to a registrar's lookup.

### Example 2: A Ukrainian cosmetics brand expanding to the EU and U.S.

A company in Kyiv sells "Kvitka" face creams online in Ukraine and plans EU and U.S. launches next year. The goods are cosmetics in class 3, plus online retail of cosmetics in class 35. On 3 November 2026 the agent ran:

```text
CM:/k[vw][iy]t{1,2}k[ao]/ AND LD:true AND CC:003
CM:flower AND LD:true AND IC:003
```

1. The first query had one hit, so the site opened it directly. It was KVITKA, Reg. 8057707 (Dec. 9, 2025), serial 99152189, owned by Zurbagan Innovations LLC of Brooklyn, for beauty salon services in class 44. It is the identical word, and cosmetics and salon services reach the same buyers. A search limited to `IC:003` would have missed it, because class 44 is coordinated with class 3. Rating: **High** for the U.S.
2. "Kvitka" means "flower" in Ukrainian, a literal translation from a modern language, so the USPTO would likely compare it with FLOWER. The second query returned 333 live FLOWER-formative marks in class 3, including FLOWER for color cosmetics (serial 76710267). That crowded field makes FLOWER weak for cosmetics, which lowers the risk. Rating: **Moderate**.
3. TMview with territories UA, EM and PL, and WIPO's phonetic search in class 3, cover the EU launch. The EU and Ukraine are first-to-file, so the report says to file there before launching.
4. The report recommends an attorney's opinion on the KVITKA registration, or a different U.S. brand, before any U.S. filing. A U.S. filing must go through a U.S.-licensed attorney, because the owner is domiciled in Ukraine. Two classes cost $350 each with ID Manual wording, such as "Cosmetic creams for skin care".

## Guidelines

- Call it a screening report, date it, and say it does not replace an attorney's opinion. Recommend counsel before adopting a High-risk name, or when the stakes justify a commercial full search.
- Never write "available" or "clear" without "based on the searches listed". New applications are filed every day, so a result holds only for its search date.
- Search goods by meaning, not by class number alone. Software in class 9 conflicts with SaaS in class 42, which is why `CC:` exists.
- Quote statuses and dates from TSDR, not from memory. If a source cannot be reached, say which source and leave the gap visible.
- Do not file, sign, pay or create accounts for the user. The applicant signs a declaration under penalty of perjury that only they can make.
- Warn about scams. Official USPTO correspondence always appears in the TSDR **Documents** tab. Letters from "registries" or "monitoring services" asking for money usually are not official. Report suspicious ones to `TMScams@uspto.gov`.
- Keep the user's unreleased name out of public forums and social posts. Web, domain and app store lookups reveal the name to those services; say so before running them if the name is confidential.
- In a logged-in browser, stay on search and status pages. Never open filing, payment or account pages.
