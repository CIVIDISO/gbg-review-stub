/**
 * Gangnam Beauty Guide — Review Syndication Stub
 * Normalized types for cross-source Korean aesthetics reviews.
 * Synthetic assessment artifact — not production schema.
 */

/** Canonical clinic identity after name+city normalisation. */
export interface ClinicIdentity {
  /** Stable key: slug(name) + "|" + slug(city). Used for grouping & merge. */
  clinic_key: string;
  display_name: string;
  city: string;
  /** Optional district hint (e.g. Gangnam-gu) when present in source. */
  district?: string;
}

/** Trust / verification signals attached to a review. */
export interface TrustFlags {
  verified_procedure: boolean;
  verified_surgeon: boolean;
  /**
   * Source reliability weight in [0, 1].
   * e.g. clinic_site=0.55, naver_cafe=0.72, realself=0.85
   */
  source_weight: number;
}

/** A single review after normalisation (post-translation, pre- or post-dedupe). */
export interface NormalizedReview {
  id: string;
  clinic_key: string;
  clinic_display_name: string;
  city: string;

  /** Upstream provenance */
  source: "naver_cafe" | "clinic_site" | "daum_cafe" | "realself" | string;
  source_review_id: string;
  source_url?: string;

  /** Language pipeline */
  language_original: "ko" | "en" | string;
  language_display: "en";
  body_original: string;
  body_translated: string;
  translation_method: "human" | "mt_stub" | "none";

  author_handle: string;
  reviewed_at: string; // ISO date YYYY-MM-DD

  /** Dedup identity: hash(author_norm + date + body_norm) */
  content_hash: string;

  trust: TrustFlags;
  /** Composite 0–1 from verified flags + source_weight */
  trust_score: number;

  /** Procedure / surgeon labels when available */
  procedure?: string;
  surgeon_name?: string;

  /** Set after merge */
  duplicate_of?: string;
  dedupe_count?: number;
}

/** Output shape of the syndication pipeline. */
export interface PipelineResult {
  generated_at: string;
  synthetic: true;
  clinics: Array<{
    clinic_key: string;
    display_name: string;
    city: string;
    review_count: number;
    avg_trust_score: number;
    reviews: NormalizedReview[];
  }>;
  stats: {
    raw_input: number;
    after_normalize: number;
    after_dedupe: number;
    duplicates_merged: number;
    clinics: number;
  };
}
