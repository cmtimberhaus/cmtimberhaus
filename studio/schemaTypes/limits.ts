/**
 * Soft length limits, derived from the longest current value plus headroom.
 * They only produce Studio warnings; required-ness and format are the hard errors.
 * Pure data, so the import script can check documents against the same numbers.
 */
export const limits = {
  pieceName: 40,
  pieceSubtitle: 70,
  piecePrice: 40,
  piecePriceNote: 80,
  pieceNote: 200,
  pieceDescription: 500,
  specLabel: 24,
  specValue: 80,
  photoAlt: 120,
  materialName: 40,
  materialKind: 50,
  materialDescription: 400,
  materialSummary: 160,
  tagline: 40,
  sub: 60,
  location: 40,
  heading: 40,
  tileTitle: 24,
  ctaEyebrow: 24,
  ctaBody: 220,
  introParagraph: 400,
  aboutParagraph: 500,
  signoff: 30,
  enquireBody: 220,
  pieceEnquiryNote: 160,
} as const;

export type LimitKey = keyof typeof limits;
