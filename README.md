# Gangnam Beauty Guide — Review Syndication Stub

Assessment deliverable for **We The Flywheel / Agentic Engineer**.  
Synthetic data only — nothing scraped from live Korean sites.

**Product:** [Gangnam Beauty Guide](https://gangnambeautyguide.com) — discovery + reviews for Korean plastic surgery / aesthetics, aimed at English-speaking medical-tourism buyers.  
**Hard problem this stub attacks:** review syndication at scale across Korean sources with translation, de-duplication, clinic normalisation, and trust signals (`verified_procedure` / `verified_surgeon`).

Competitors in mind: RealSelf, DocFinder, Naver/Daum cafe forums.

---

## Problem framing

English buyers cannot read Naver Cafe posts; clinic sites re-publish the same praise with weaker verification; the same clinic appears as `ID Hospital`, `I.D. Hospital`, and `ID 병원`. Without a normalized join key, a content hash, and an explicit trust model, syndication either double-counts marketing copy or drops the high-signal cafe thread.

This stub shows a **minimal, runnable pipeline** that:

1. Normalizes clinic identity → `clinic_key`
2. Translates (or stubs MT) into English display body
3. Fingerprints reviews → `content_hash` for cross-source dedupe
4. Scores trust 0–1 from verification flags + source prior
5. Merges duplicates (highest trust, else earliest date)
6. Renders clinic cards in a static demo page

---

## Design choices

| Choice | Why |
|---|---|
| **`clinic_key = slug(canonicalize(name))\|slug(city)`** | Smallest stable join without a clinic master DB. City disambiguates common brand names; a tiny alias table stubs entity resolution (`ID 병원` → `ID Hospital`). |
| **`content_hash = fnv1a(author\|date\|body_norm)`** | Syndication re-posts keep author + calendar day while rewriting titles. Prefer EN body when present so KO original and EN copy collide. Exact hash first; fuzzy similarity is out of scope. |
| **Trust weights: 0.45·source + 0.30·verified_procedure + 0.25·verified_surgeon** | Buyers care most that the *procedure* and *surgeon* are real. Cafe priors (`naver_cafe` 0.72) beat owned pages (`clinic_site` 0.55); verification can still elevate a clinic-site review when both flags are true. |
| **Merge: max trust → earliest date → OR verified flags** | Prefer the most trustworthy copy of the same story; keep the chronologically first signal; never lose a verification bit that only one source carried. |

Schema: `schema.ts` / `schema.json`. Logic: `normalize.ts` (typed) mirrored in `pipeline.mjs` (runnable).

---

## How to run

```bash
cd /workspace/gbg-review-stub
node pipeline.mjs
```

- Reads `fixtures/raw-reviews.json` (9 synthetic reviews, 3 clinics, 2 sources)
- Writes `public/data.json`
- Prints a JSON summary to stdout (exit 0)

Open the demo (no server required for a quick look; any static host works):

```bash
# optional local preview
npx --yes serve public
# → open /index.html
```

Or open `public/index.html` directly; it embeds the pipeline output as `const DATA` and also fetches `data.json` when served over HTTP.

---

## What's intentionally out of scope

- Live scraping of Naver/Daum/cafe or clinic sites
- Paid translation / LLM APIs (MT is a stub prefix or provided `body_en`)
- Fuzzy near-duplicate detection (MinHash / embedding similarity)
- Real clinic master DB, surgeon license verification, or anti-fraud
- Auth, payments, SEO, or production infra
- Anything involving Brandon / Grimoire credentials

---

## Layout

```
gbg-review-stub/
├── README.md
├── APPROACH.md          # paste-ready assessment answer
├── REFLECTION.md        # optional field
├── schema.ts / schema.json
├── normalize.ts         # typed pure functions
├── pipeline.mjs         # zero-dep runner → public/data.json
├── fixtures/raw-reviews.json
└── public/
    ├── index.html       # static demo
    └── data.json        # pipeline output
```
