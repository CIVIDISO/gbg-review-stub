/**
 * Pure TypeScript normalisers for GBG review syndication stub.
 * No runtime deps — mirrored in pipeline.mjs for zero-build execution.
 */

export type SourceId = "naver_cafe" | "clinic_site" | "daum_cafe" | "realself" | string;

export interface RawReview {
  source: SourceId;
  source_review_id: string;
  source_url?: string;
  clinic_name: string;
  city: string;
  district?: string;
  author_handle: string;
  reviewed_at: string;
  language: string;
  body: string;
  body_en?: string;
  verified_procedure?: boolean;
  verified_surgeon?: boolean;
  procedure?: string;
  surgeon_name?: string;
}

export interface TrustFlags {
  verified_procedure: boolean;
  verified_surgeon: boolean;
  source_weight: number;
}

export interface NormalizedReview {
  id: string;
  clinic_key: string;
  clinic_display_name: string;
  city: string;
  source: string;
  source_review_id: string;
  source_url?: string;
  language_original: string;
  language_display: "en";
  body_original: string;
  body_translated: string;
  translation_method: "human" | "mt_stub" | "none";
  author_handle: string;
  reviewed_at: string;
  content_hash: string;
  trust: TrustFlags;
  trust_score: number;
  procedure?: string;
  surgeon_name?: string;
  duplicate_of?: string;
  dedupe_count?: number;
}

/** Source reliability priors — cafe word-of-mouth > owned clinic pages. */
export const SOURCE_WEIGHTS: Record<string, number> = {
  realself: 0.85,
  naver_cafe: 0.72,
  daum_cafe: 0.68,
  clinic_site: 0.55,
};

const DEFAULT_SOURCE_WEIGHT = 0.5;

/**
 * Tiny stub alias table — stands in for a clinic master DB.
 * Production would replace this with entity resolution over licenses / addresses.
 */
export const CLINIC_ALIASES: Record<string, string> = {
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

/** Collapse punctuation/whitespace/case for stable keys. */
export function slugify(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b([a-z])\.(?=[a-z])/gi, "$1")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function canonicalizeClinicName(name: string): string {
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

/**
 * clinic_key = slug(canonicalize(name)) + "|" + slug(city)
 * Why: same clinic often appears as "ID Hospital", "ID병원", "I.D. Hospital / Gangnam"
 * across Naver vs clinic sites. Name+city is the smallest stable join key without
 * a clinic master DB; a small alias table stubs that master for the assessment.
 */
export function buildClinicKey(name: string, city: string): string {
  return `${slugify(canonicalizeClinicName(name))}|${slugify(city)}`;
}

function normalizeBodyForHash(body: string): string {
  return body
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Fast deterministic digests for stub use (FNV-1a 32-bit hex). */
export function fnv1aHex(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * content_hash from author + date + body.
 * Prefer EN body when present so KO original + EN syndication collide.
 */
export function buildContentHash(
  author: string,
  date: string,
  body: string
): string {
  const payload = [
    slugify(author),
    date.trim(),
    normalizeBodyForHash(body),
  ].join("|");
  return fnv1aHex(payload);
}

/**
 * trust_score ∈ [0,1]:
 *   0.45 * source_weight
 * + 0.30 if verified_procedure
 * + 0.25 if verified_surgeon
 *
 * Why: medical-tourism buyers care most that procedure + surgeon are real;
 * source prior still matters but shouldn't dominate a fully verified cafe review.
 */
export function computeTrustScore(
  verifiedProcedure: boolean,
  verifiedSurgeon: boolean,
  sourceWeight: number
): number {
  const w = Math.min(1, Math.max(0, sourceWeight));
  let score = 0.45 * w;
  if (verifiedProcedure) score += 0.3;
  if (verifiedSurgeon) score += 0.25;
  return Math.round(score * 1000) / 1000;
}

export function normalizeReview(raw: RawReview, index: number): NormalizedReview {
  const sourceWeight =
    SOURCE_WEIGHTS[raw.source] ?? DEFAULT_SOURCE_WEIGHT;
  const verifiedProcedure = !!raw.verified_procedure;
  const verifiedSurgeon = !!raw.verified_surgeon;
  const displayName = canonicalizeClinicName(raw.clinic_name);
  const clinicKey = buildClinicKey(raw.clinic_name, raw.city);
  const bodyTranslated =
    raw.body_en ??
    (raw.language === "en" ? raw.body : `[mt_stub] ${raw.body}`);
  const translationMethod: NormalizedReview["translation_method"] =
    raw.language === "en"
      ? "none"
      : raw.body_en
        ? "human"
        : "mt_stub";
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
    content_hash: buildContentHash(
      raw.author_handle,
      raw.reviewed_at,
      hashBody
    ),
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

/**
 * Merge by content_hash: keep highest trust_score; on tie, earliest reviewed_at;
 * on further tie, prefer higher source_weight. OR verified flags across copies.
 */
export function mergeDuplicates(
  reviews: NormalizedReview[]
): NormalizedReview[] {
  const byHash = new Map<string, NormalizedReview>();

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

export function groupByClinic(reviews: NormalizedReview[]) {
  const map = new Map<
    string,
    {
      clinic_key: string;
      display_name: string;
      city: string;
      reviews: NormalizedReview[];
    }
  >();

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