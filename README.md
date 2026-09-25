# Gangnam Beauty Guide — Review Syndication Stub

**Live demo:** [gbg-review-stub.vercel.app](https://gbg-review-stub.vercel.app/)  
**Built for:** We The Flywheel / Agentic Engineer assessment  
**All data is synthetic** — no live scraping, no real patient reviews

---

## What This Demonstrates

A production-shaped **data pipeline for review syndication** that solves four hard problems:

1. **🏥 Clinic identity normalization** — `ID Hospital` = `I.D. Hospital` = `ID 병원`
2. **🌐 Translation** — Korean Naver Cafe posts → English medical-tourism buyers
3. **🔍 Cross-source deduplication** — same review on Naver + clinic site → single record
4. **✅ Trust scoring** — verified procedure/surgeon + source credibility → 0–1 score

**Pipeline flow:** 9 raw reviews → normalize clinic names → translate → dedupe by content hash → trust score → **6 unique reviews, 3 clinics**

**Tech:** Zero-dependency Node.js pipeline (`pipeline.mjs`), typed pure functions (`normalize.ts`), static demo page (`public/index.html`). Runs in 60 seconds, no build step.

---

## The Problem

[Gangnam Beauty Guide](https://gangnambeautyguide.com) helps English speakers find Korean plastic surgery clinics. **Three blockers prevent trust at scale:**

| Problem | Why It Matters |
|---------|----------------|
| **Name variants** | Same clinic appears as `ID Hospital`, `I.D. Hospital`, `ID 병원` across Naver/clinic sites → reviews don't roll up |
| **Duplicates** | Clinics republish Naver Cafe posts on their own sites → double-counting inflates ratings |
| **Trust opacity** | Glossy clinic marketing vs. verified cafe word-of-mouth → buyers can't tell signal from noise |

**Competitors (RealSelf, DocFinder, Naver Cafe) face these too.** This stub shows a concrete solution.

---

## Quick Start

**Run the pipeline:**

```bash
git clone <repo>
cd gbg-review-stub
node pipeline.mjs
```

**Output (JSON to stdout + writes `public/data.json`):**

```json
{
  "ok": true,
  "stats": {
    "raw_input": 9,
    "after_dedupe": 6,
    "duplicates_merged": 3,
    "clinics": 3
  },
  "clinics": [
    {
      "clinic_key": "banobagi-plastic-surgery|seoul",
      "display_name": "Banobagi Plastic Surgery",
      "review_count": 2,
      "avg_trust_score": 0.874
    },
    ...
  ]
}
```

**View the demo:**

```bash
npx --yes serve public
# → open http://localhost:3000
```

Or open `public/index.html` directly in a browser — no server needed for a quick preview.

---

## How It Works (30-Second Version)

```
Raw Reviews (fixtures/raw-reviews.json)
   ↓
[1] Normalize clinic names → clinic_key = "id-hospital|seoul"
   ↓
[2] Translate Korean → English (stub MT or human-provided)
   ↓
[3] Fingerprint content → content_hash = fnv1a(author|date|body)
   ↓
[4] Score trust → 0.45·source + 0.30·verified_procedure + 0.25·verified_surgeon
   ↓
[5] Merge duplicates → keep highest trust, OR verified flags
   ↓
[6] Group by clinic → avg trust score, clinic cards
   ↓
Output: public/data.json + static demo page
```

**Full details:** See [ARCHITECTURE.md](ARCHITECTURE.md) for pipeline flow, design decisions, and production roadmap.

---

## Example: What the Fixtures Show

### Input (Raw Reviews)

**Review A** — Naver Cafe (`nc-88421`):
- Clinic: `ID Hospital` · Author: `skyline_j` · Date: `2025-11-02`
- Body: `코성형 3개월 후기...` → EN: `Rhinoplasty 3-month update...`
- Flags: ✅ verified_procedure, ✅ verified_surgeon
- Source weight: `naver_cafe` = 0.72 → **Trust: 0.874**

**Review B** — Clinic Site (`cs-id-102`):
- Clinic: `I.D. Hospital` · Author: `skyline_j` · Date: `2025-11-02`
- Body: `Rhinoplasty 3-month update...` (same text)
- Flags: ✅ verified_procedure, ❌ verified_surgeon
- Source weight: `clinic_site` = 0.55 → **Trust: 0.572**

### Pipeline Result

**After normalization:**
- Both map to `clinic_key: "id-hospital|seoul"` ← name variants collapsed
- Both produce `content_hash: "2b688a75"` ← same author + date + body

**After deduplication:**
- **Kept:** Review A (higher trust score)
- **Merged:** OR'd verification flags → ✅ procedure, ✅ surgeon (kept both signals)
- **dedupe_count:** 2

**Demo output:**
```
ID Hospital · Seoul · 2 reviews · avg trust 0.749

Review 1:
  @skyline_j · 2025-11-02 · Rhinoplasty
  trust 0.874 · ✓ procedure · ✓ surgeon · Naver Cafe · deduped ×2
  "Rhinoplasty 3-month update. Swelling gone in two weeks..."
```

**Three clinics in fixtures, all demonstrate this pattern.** See the [live demo](https://gbg-review-stub.vercel.app/) or open `public/index.html`.

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **`clinic_key = slug(canonical_name)\|slug(city)`** | Smallest stable join without a clinic master DB. City disambiguates brand names. Tiny alias table stubs entity resolution: `ID 병원` → `ID Hospital`. |
| **`content_hash = fnv1a(author\|date\|body)`** | Syndication keeps author + calendar day. Prefer EN body so KO original and EN copy collide. Exact hash first — fuzzy matching is a future phase. |
| **Trust: 0.45·source + 0.30·proc + 0.25·surgeon** | Medical-tourism buyers care most that the procedure/surgeon are real. Cafe word-of-mouth (0.72) beats clinic sites (0.55). Verification can override low source priors. |
| **Merge: max trust → earliest date → OR flags** | Keep the most trustworthy copy; tie-break by earliest review; never lose a verification signal present in any duplicate. |
| **Zero dependencies, no build step** | Any engineer can clone and run in 60 seconds. Typed logic in `normalize.ts`, runnable mirror in `pipeline.mjs`. |

**See [ARCHITECTURE.md](ARCHITECTURE.md)** for full rationale, trade-offs, and production evolution path.

---

## Project Structure

```
gbg-review-stub/
├── README.md                    # ← you are here
├── ARCHITECTURE.md              # deep dive: pipeline flow, design decisions
├── APPROACH.md                  # assessment answer (dense summary)
├── REFLECTION.md                # what I'd add with more time
│
├── pipeline.mjs                 # runnable pipeline (zero deps)
├── normalize.ts                 # typed pure functions
├── schema.ts                    # TypeScript interfaces
│
├── fixtures/
│   └── raw-reviews.json         # 9 synthetic reviews, 2 sources, 3 clinics
│
└── public/
    ├── index.html               # static demo (styled, clinic cards)
    └── data.json                # pipeline output (generated)
```

---

## What's Proven vs. Out of Scope

### ✅ What This Stub Proves

- Clinic identity normalization works with minimal infrastructure (alias table)
- Content hashing reliably catches cross-source duplicates
- Trust scoring differentiates verified reviews from marketing fluff
- Pipeline is runnable, transparent, testable
- Static output is deployment-ready (Vercel, Netlify, S3)

### ❌ Intentionally Out of Scope

- **Live scraping** — fixtures are synthetic (Naver API, clinic crawlers are a future phase)
- **Real translation** — MT is a stub prefix; production would use Papago/Google + human review
- **Fuzzy matching** — exact hash only; paraphrased reviews aren't caught yet
- **Clinic master DB** — alias table is a placeholder for license/address entity resolution
- **Anti-fraud** — no sockpuppet detection, velocity limits, or surgeon registry checks
- **Scale** — no database, no incremental updates, no pagination

**Why these limits?** This is a time-boxed assessment artifact. The goal is to **prove the core pipeline** and make production expansion obvious (see ARCHITECTURE.md § Production Evolution Path).

---

## Running the Demo Locally

**1. Generate fresh data:**

```bash
node pipeline.mjs
# → writes public/data.json
# → prints summary JSON (exit 0)
```

**2. View the demo:**

Option A: Direct open (works, but no HTTP so `data.json` fetch is skipped):
```bash
open public/index.html
```

Option B: Local server (recommended — demo fetches fresh `data.json`):
```bash
npx --yes serve public
# → http://localhost:3000
```

Option C: See the [live Vercel deployment](https://gbg-review-stub.vercel.app/)

---

## Next Steps (Production Path)

### Near-Term (0–3 months)
- **Fuzzy deduplication** — MinHash or embeddings for paraphrased reviews
- **Real translation** — Papago API + human review queue for high-traffic clinics
- **Clinic master** — link to Korean Medical Association licenses + addresses
- **Ingestion adapters** — per-source scrapers (Naver Cafe API, clinic site crawlers)

### Mid-Term (3–6 months)
- **Anti-fraud** — review velocity spikes, sockpuppet author detection
- **Surgeon verification** — match names to KMA registry
- **Procedure taxonomy** — normalize "nose job" / "rhinoplasty" / "코성형"
- **Trust UI** — filterable badges, clinic comparison tool

### Long-Term (6+ months)
- **Real-time ingestion** — webhook-driven Naver forum updates
- **User verification** — buyers upload post-op photos → trust boost
- **Multi-language** — Chinese/Japanese buyer interfaces
- **Recommendation engine** — "similar clinics" based on procedure + trust clusters

**See [ARCHITECTURE.md](ARCHITECTURE.md) § Production Evolution Path** for full details.

---

## Tech Choices

| Tech | Why |
|------|-----|
| **Node.js + ES modules** | Zero-dependency, instant setup, no build step |
| **TypeScript (types only)** | `normalize.ts` is typed for IDE/docs; `pipeline.mjs` mirrors it for runnability |
| **FNV-1a hash** | Fast, deterministic, collision-resistant for stub use (32-bit hex) |
| **Static output** | `index.html` + `data.json` → deploy anywhere (Vercel, Netlify, GitHub Pages) |
| **Synthetic fixtures** | Intentional duplicates + name variants prove all pipeline stages |

**No frameworks, no bundlers, no databases** — this is a deliberate constraint to keep the assessment artifact transparent and runnable.

---

## About This Repo

**Author:** Brandon McCray  
**Purpose:** Showcase for AI/agent engineer role applications  
**Assessment:** We The Flywheel / Agentic Engineer  
**Date:** September 2026

**What it shows:**
- Data pipeline design for a real product problem (review syndication)
- Pragmatic trade-offs (alias table stubs entity resolution, exact hash stubs fuzzy matching)
- Production roadmap clarity (ARCHITECTURE.md)
- Honest scope management (no fake metrics, no invented features)

**Live demo:** [gbg-review-stub.vercel.app](https://gbg-review-stub.vercel.app/)

---

## License & Data

**Code:** MIT (do whatever you want)  
**Data:** All synthetic — no real patient reviews, no live scraping. See `fixtures/raw-reviews.json` for sourcing.

**Disclaimer:** This is an assessment artifact. It demonstrates a data pipeline for a real product concept (Gangnam Beauty Guide) but is not production software. All reviews are fabricated for demonstration purposes.
