// Making a new TARA, and the next revision of a released one.

import { CRA_REQUIREMENTS } from "./cra.ts";
import type { Method } from "./method.ts";
import { FORMAT, SCOPE_KEYS, type ScopeEntry, type ScopeKey, type Tara } from "./tara.ts";

export interface NewTara {
  id: string;
  title: string;
  product?: string | null;
  organisation?: string | null;
  documentNumber?: string | null;
  /** The scoring method the TARA starts with. It gets its own copy. */
  method: Method;
  /** The moment of creation, as an ISO date and time. */
  now: string;
}

/**
 * A new, empty TARA that is ready to work in: its own copy of the scoring method, every scope question,
 * and a decision for each of the 21 essential requirements of CRA Annex I.
 *
 * The requirements of Part II (how vulnerabilities are handled) start as applying, because they bind every
 * manufacturer. Those of Part I(2) start undecided: whether each applies depends on the product.
 */
export function createTara(input: NewTara): Tara {
  const emptyScope = Object.fromEntries(SCOPE_KEYS.map((key) => [key, { decision: null, evidence: null }])) as Record<
    ScopeKey,
    ScopeEntry
  >;
  return {
    format: FORMAT,
    id: input.id,
    seq: 0,
    meta: {
      title: input.title.trim(),
      product: input.product?.trim() || null,
      organisation: input.organisation?.trim() || null,
      documentNumber: input.documentNumber?.trim() || null,
      revision: "0.1",
      status: "draft",
      example: false,
      storageLocation: null,
      distribution: null,
      createdAt: input.now,
      updatedAt: input.now,
      releasedAt: null,
      basedOn: null,
      revisionReason: null,
    },
    method: structuredClone(input.method),
    scope: emptyScope,
    items: [],
    elements: [],
    assets: [],
    damages: [],
    threats: [],
    paths: [],
    risks: [],
    controls: [],
    evidence: [],
    goalClaims: [],
    craDecisions: CRA_REQUIREMENTS.map((requirement) => ({
      id: requirement.id,
      requirementKey: requirement.key,
      applicability: requirement.part === "II" ? "applies" : null,
      justification: null,
      implementationRef: null,
      verificationRef: null,
    })),
    references: [],
    reviews: [],
    reviewCount: 0,
    signoffs: [],
    changeLog: [],
    counters: {},
  };
}

/**
 * The next revision of a released TARA: a new draft with everything carried over and every record keeping
 * its ID. The signatures are not carried: the new revision is signed for itself. The reviews are carried
 * with their references and ask to be confirmed again, because the revision of the document is part of
 * what each review covers.
 */
export function nextRevision(released: Tara, next: { id: string; revision: string; reason: string; now: string }): Tara {
  const draft = structuredClone(released);
  draft.id = next.id;
  draft.seq = 0;
  draft.meta = {
    ...draft.meta,
    revision: next.revision.trim(),
    status: "draft",
    createdAt: next.now,
    updatedAt: next.now,
    releasedAt: null,
    basedOn: { id: released.id, revision: released.meta.revision },
    revisionReason: next.reason.trim(),
  };
  draft.signoffs = [];
  return draft;
}

/** A title as the start of a TARA's ID: small letters, digits and hyphens. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "tara";
}
