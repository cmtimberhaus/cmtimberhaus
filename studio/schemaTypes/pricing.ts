import { defineArrayMember, defineField } from "sanity";
import type { ConditionalPropertyCallbackContext, CustomValidatorResult, NumberRule, ValidationContext } from "sanity";
import { optionalText } from "./fields";

interface Ref {
  _ref?: string;
}

interface PriceValue {
  timber?: Ref;
  amount?: number;
  bundleAmount?: number;
}

interface RowValue {
  label?: string;
  isStart?: boolean;
  prices?: PriceValue[];
}

interface PricingValue {
  sizeLabel?: string;
  defaultTimber?: Ref;
  bundle?: { label?: string; quantity?: number };
  rows?: RowValue[];
}

interface PieceDocument {
  availableTimbers?: Ref[];
}

function idsOf(document: PieceDocument | undefined): string[] {
  return (document?.availableTimbers ?? []).flatMap((reference) => (reference._ref ? [reference._ref] : []));
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function timberProblems(row: RowValue, name: string, available: string[]): string[] {
  const ids = (row.prices ?? []).flatMap((price) => (price.timber?._ref ? [price.timber._ref] : []));
  const problems: string[] = [];
  if (duplicates(ids).length > 0) problems.push(`${name} lists a timber more than once.`);
  const missing = available.filter((id) => !ids.includes(id));
  if (missing.length > 0) problems.push(`${name} needs a price for every available timber (${missing.length} missing).`);
  if (ids.some((id) => !available.includes(id))) problems.push(`${name} has a timber that is not in Available timbers.`);
  return problems;
}

function bundleProblems(value: PricingValue): string[] {
  const prices = (value.rows ?? []).flatMap((row) => row.prices ?? []);
  const withBundle = prices.filter((price) => price.bundleAmount !== undefined).length;
  if (value.bundle && withBundle !== prices.length) return ["Every price needs a bundle price when the piece has a bundle."];
  if (!value.bundle && withBundle > 0) return ["Bundle prices need the bundle (pair or set of 8) to be filled in."];
  return [];
}

function startProblems(value: PricingValue, rows: RowValue[]): string[] {
  const starts = rows.filter((row) => row.isStart);
  if (starts.length !== 1) return ["Exactly one row must be marked as the starting size."];
  const defaultTimber = value.defaultTimber?._ref;
  if (defaultTimber && !starts[0]?.prices?.some((price) => price.timber?._ref === defaultTimber)) {
    return ["The starting row needs a price for the timber shown first."];
  }
  return [];
}

function rowProblems(value: PricingValue, available: string[]): string[] {
  const rows = value.rows ?? [];
  const problems = rows.flatMap((row, index) =>
    timberProblems(row, row.label ? `Row "${row.label}"` : `Row ${index + 1}`, available),
  );
  const labels = rows.flatMap((row) => (row.label ? [row.label] : []));
  if (duplicates(labels).length > 0) problems.push("Each size can appear only once.");
  if (value.sizeLabel && labels.length !== rows.length) problems.push("Every row needs a size.");
  if (!value.sizeLabel && (rows.length !== 1 || labels.length > 0)) {
    problems.push("Without a size name the piece has exactly one row and no size.");
  }
  return [...problems, ...startProblems(value, rows)];
}

function pricingProblems(value: PricingValue | undefined, context: ValidationContext): CustomValidatorResult {
  if (!value) return true;
  const available = idsOf(context.document as PieceDocument | undefined);
  const problems = [...rowProblems(value, available), ...bundleProblems(value)];
  const defaultTimber = value.defaultTimber?._ref;
  if (!defaultTimber) problems.push("Choose the timber shown first.");
  else if (!available.includes(defaultTimber)) problems.push("The timber shown first must be one of the available timbers.");
  return problems.length > 0 ? problems.join(" ") : true;
}

/** Only the piece's own available timbers can be chosen. */
const timberReference = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "reference",
    to: [{ type: "material" }],
    options: {
      filter: ({ document }) => ({
        filter: "_id in $ids",
        params: { ids: idsOf(document as PieceDocument) },
      }),
    },
    validation: (rule) => rule.required(),
  });

/** True when the piece being edited has a price table, so the plain text prices are not used. */
export const hasPricing = ({ document }: ConditionalPropertyCallbackContext): boolean =>
  Boolean((document as { pricing?: unknown } | undefined)?.pricing);

/** True when the piece's price table has a pair or set of 8, which writes its own line under the price. */
export const hasBundle = ({ document }: ConditionalPropertyCallbackContext): boolean =>
  Boolean((document as { pricing?: { bundle?: unknown } } | undefined)?.pricing?.bundle);

const wholeDollars = (rule: NumberRule) => rule.required().integer().min(1);

export const pricingField = defineField({
  name: "pricing",
  title: "Prices by timber and size",
  type: "object",
  description:
    "The card price and the piece page price come from this table, so the two plain price fields are hidden while it is filled in. Leave it empty to type the prices by hand.",
  validation: (rule) => rule.custom(pricingProblems),
  fields: [
    defineField({
      name: "sizeLabel",
      title: "Size name",
      type: "string",
      description:
        'Leave empty when the piece has one size and only the timber changes the price. For example "Size (mm)" or "Length".',
      validation: optionalText("pieceSubtitle"),
    }),
    timberReference("defaultTimber", "Timber shown first"),
    defineField({
      name: "priceSuffix",
      title: "Words after the price on the piece page (optional)",
      type: "string",
      description: 'For example "each" or "a pair".',
    }),
    defineField({
      name: "cardSuffix",
      title: "Words after the price on the card (optional)",
      type: "string",
      description: 'For example "installed" or "a pair".',
    }),
    defineField({
      name: "bundle",
      title: "Bundle price (optional)",
      type: "object",
      description: "For pieces sold singly or as a pair or set. Every price below then needs a bundle price too.",
      fields: [
        defineField({
          name: "label",
          title: "Sold as",
          type: "string",
          options: {
            list: [
              { title: "Pair", value: "pair" },
              { title: "Set of 8", value: "set of 8" },
            ],
            layout: "radio",
          },
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: "quantity",
          title: "Number of pieces in the bundle",
          type: "number",
          validation: (rule) => rule.required().integer().min(2),
        }),
      ],
    }),
    defineField({
      name: "rows",
      title: "Sizes",
      type: "array",
      description: "One row per size, or a single row when only the timber changes the price.",
      of: [
        defineArrayMember({
          type: "object",
          name: "priceRow",
          fields: [
            defineField({ name: "label", title: "Size", type: "string", description: 'For example "2000 x 1000".' }),
            defineField({
              name: "isStart",
              title: "Starting size",
              type: "boolean",
              description: "The size selected when the page opens. Exactly one row.",
              initialValue: false,
            }),
            defineField({
              name: "prices",
              title: "Price by timber",
              type: "array",
              of: [
                defineArrayMember({
                  type: "object",
                  name: "timberPrice",
                  fields: [
                    timberReference("timber", "Timber"),
                    defineField({ name: "amount", title: "Price (whole dollars)", type: "number", validation: wholeDollars }),
                    defineField({
                      name: "bundleAmount",
                      title: "Bundle price (whole dollars, optional)",
                      type: "number",
                      validation: (rule) => rule.integer().min(1),
                    }),
                  ],
                  preview: { select: { title: "timber.name", subtitle: "amount" } },
                }),
              ],
            }),
          ],
          preview: {
            select: { title: "label", subtitle: "isStart" },
            prepare: ({ title, subtitle }) => ({
              title: title ?? "Single price row",
              subtitle: subtitle ? "Starting size" : undefined,
            }),
          },
        }),
      ],
      validation: (rule) => rule.required().min(1),
    }),
  ],
});
