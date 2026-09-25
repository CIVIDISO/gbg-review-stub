#!/usr/bin/env node
/**
 * GBG Review Syndication Stub — self-contained pipeline
 * Usage: node pipeline.mjs
 * Reads fixtures/raw-reviews.json → writes public/data.json → prints summary JSON
 * No build step, no deps. Synthetic assessment data only.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Normalise helpers (mirrored from normalize.ts) ─────────────────────────

const SOURCE_WEIGHTS = {
  realself: 0.85,
  naver_cafe: 0.72,
  daum_cafe: 0.68,
  clinic_site: 0.55,
};
const DEFAULT_SOURCE_WEIGHT = 0.5;

/**
 * Tiny stub alias table — stands in for a clinic master DB.
 * Maps noisy upstream names → canonical display name used for clinic_key.
 */
const CLINIC_ALIASES = {
  "id hospital": "ID Hospital",
  "i.d. hospital": "ID Hospital",
  "i d hospital": "ID Hospital",
  "id 병원": "ID Hospital",
  "id병원": "ID Hospital",
  banobagi: "Banobagi Plastic Surgery",
  "banobagi plastic surgery": "Banobagi Plastic Surgery",
  "jw plastic surgery": "JW Plastic Surgery",
  jw: "JW Plastic Surgery",
};

function slugify(input) {
  return input
    .normalize("NFKC")
    .toLowerCase()
    // collapse single-letter abbreviations: "I.D." → "id"
    .replace(/\b([a-z])\.(?=[a-z])/gi, "$1")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function canonicalizeClinicName(name) {
  const collapsed = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b([a-z])\.(?=[a-z])/gi, "$1")
    .replace(/[''`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const noSpaceHangul = collapsed.replace(/\s+/g, "");
  return (
    CLINIC_ALIASES[collapsed] ||
    CLINIC_ALIASES[noSpaceHangul] ||
    name.replace(/\s+/g, " ").trim()
  );
}

function buildClinicKey(name, city) {
  const canonical = canonicalizeClinicName(name);
  return `${slugify(canonical)}|${slugify(city)}`;
}

function normalizeBodyForHash(body) {
  return body
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function fnv1aHex(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function buildContentHash(author, date, body) {
  const payload = [slugify(author), date.trim(), normalizeBodyForHash(body)].join(
    "|"
  );
  return fnv1aHex(payload);
}

function computeTrustScore(verifiedProcedure, verifiedSurgeon, sourceWeight) {
  const w = Math.min(1, Math.max(0, sourceWeight));
  let score = 0.45 * w;
  if (verifiedProcedure) score += 0.3;
  if (verifiedSurgeon) score += 0.25;
  return Math.round(score * 1000) / 1000;
}

function normalizeReview(raw, index) {
  const sourceWeight = SOURCE_WEIGHTS[raw.source] ?? DEFAULT_SOURCE_WEIGHT;
  const verifiedProcedure = !!raw.verified_procedure;
  const verifiedSurgeon = !!raw.verified_surgeon;
  const displayName = canonicalizeClinicName(raw.clinic_name);
  const clinicKey = buildClinicKey(raw.clinic_name, raw.city);
  const bodyTranslated =
    raw.body_en ?? (raw.language === "en" ? raw.body : `[mt_stub] ${raw.body}`);
  const translationMethod =
    raw.language === "en" ? "none" : raw.body_en ? "human" : "mt_stub";
  // Prefer EN body for hash so KO original + EN syndication of the same review collide.
  const hashBody = raw.body_en ?? raw.body;

  return {
    id: `nr_${String(index + 1).padStart(3, "0")}`,
    clinic_key: clinicKey,
    clinic_display_name: displayName,
    city: raw.city.trim(),
    source: raw.source,
    source_review_id: raw.source_review_id,
    source_url: raw.source_url,
    language_original: raw.language,
    language_display: "en",
    body_original: raw.body,
    body_translated: bodyTranslated,
    translation_method: translationMethod,
    author_handle: raw.author_handle,
    reviewed_at: raw.reviewed_at,
    content_hash: buildContentHash(raw.author_handle, raw.reviewed_at, hashBody),
    trust: {
      verified_procedure: verifiedProcedure,
      verified_surgeon: verifiedSurgeon,
      source_weight: sourceWeight,
    },
    trust_score: computeTrustScore(
      verifiedProcedure,
      verifiedSurgeon,
      sourceWeight
    ),
    procedure: raw.procedure,
    surgeon_name: raw.surgeon_name,
    dedupe_count: 1,
  };
}

function mergeDuplicates(reviews) {
  const byHash = new Map();

  for (const r of reviews) {
    const existing = byHash.get(r.content_hash);
    if (!existing) {
      byHash.set(r.content_hash, { ...r, dedupe_count: 1 });
      continue;
    }
    const keepNew =
      r.trust_score > existing.trust_score ||
      (r.trust_score === existing.trust_score &&
        r.reviewed_at < existing.reviewed_at) ||
      (r.trust_score === existing.trust_score &&
        r.reviewed_at === existing.reviewed_at &&
        r.trust.source_weight > existing.trust.source_weight);

    const winner = keepNew ? r : existing;
    const loser = keepNew ? existing : r;
    const vp =
      winner.trust.verified_procedure || loser.trust.verified_procedure;
    const vs = winner.trust.verified_surgeon || loser.trust.verified_surgeon;
    byHash.set(r.content_hash, {
      ...winner,
      dedupe_count: (existing.dedupe_count ?? 1) + 1,
      trust: {
        verified_procedure: vp,
        verified_surgeon: vs,
        source_weight: winner.trust.source_weight,
      },
      trust_score: computeTrustScore(vp, vs, winner.trust.source_weight),
    });
  }

  return Array.from(byHash.values()).sort((a, b) => {
    if (a.clinic_key !== b.clinic_key)
      return a.clinic_key.localeCompare(b.clinic_key);
    if (a.reviewed_at !== b.reviewed_at)
      return a.reviewed_at.localeCompare(b.reviewed_at);
    return b.trust_score - a.trust_score;
  });
}

function groupByClinic(reviews) {
  const map = new Map();

  for (const r of reviews) {
    let g = map.get(r.clinic_key);
    if (!g) {
      g = {
        clinic_key: r.clinic_key,
        display_name: r.clinic_display_name,
        city: r.city,
        reviews: [],
      };
      map.set(r.clinic_key, g);
    }
    g.reviews.push(r);
  }

  return Array.from(map.values())
    .map((g) => {
      const avg =
        g.reviews.reduce((s, r) => s + r.trust_score, 0) / g.reviews.length;
      return {
        ...g,
        review_count: g.reviews.length,
        avg_trust_score: Math.round(avg * 1000) / 1000,
      };
    })
    .sort((a, b) => b.avg_trust_score - a.avg_trust_score);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const fixturePath = join(__dirname, "fixtures", "raw-reviews.json");
const outDir = join(__dirname, "public");
const outPath = join(outDir, "data.json");

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const raw = fixture.reviews;

const normalized = raw.map((r, i) => normalizeReview(r, i));
const deduped = mergeDuplicates(normalized);
const clinics = groupByClinic(deduped);

const result = {
  generated_at: new Date().toISOString(),
  synthetic: true,
  note: "Synthetic assessment data for Gangnam Beauty Guide review syndication stub. Not real patient reviews.",
  design: {
    clinic_key:
      "slug(canonicalize(name))|slug(city) — alias table stubs a clinic master DB",
    content_hash:
      "fnv1a(author_slug|date|normalized_body) — EN body preferred so KO/EN copies collide",
    trust_score:
      "0.45*source_weight + 0.30*verified_procedure + 0.25*verified_surgeon",
    merge_policy:
      "same content_hash → keep highest trust_score, else earliest reviewed_at; OR verified flags",
    source_weights: SOURCE_WEIGHTS,
  },
  clinics,
  stats: {
    raw_input: raw.length,
    after_normalize: normalized.length,
    after_dedupe: deduped.length,
    duplicates_merged: normalized.length - deduped.length,
    clinics: clinics.length,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");

const summary = {
  ok: true,
  wrote: outPath,
  stats: result.stats,
  clinics: clinics.map((c) => ({
    clinic_key: c.clinic_key,
    display_name: c.display_name,
    review_count: c.review_count,
    avg_trust_score: c.avg_trust_score,
    max_dedupe: Math.max(...c.reviews.map((r) => r.dedupe_count ?? 1)),
  })),
};

console.log(JSON.stringify(summary, null, 2));
