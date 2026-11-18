"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  bundleLine,
  selectionPriceText,
  startSelection,
  type PiecePricing,
  type Selection,
} from "@/lib/pricing";

interface PriceSelectorProps {
  pieceSlug: string;
  pricing: PiecePricing;
  timbers: { name: string; slug: string }[];
  specs: { label: string; value: string }[];
  /** Shown under the price when the piece has no bundle line. */
  priceNote: string | null;
  note: string | null;
  enquiryNote: string;
  /** The description, rendered on the server between the choices and the specifications. */
  children: ReactNode;
}

interface OptionGroupProps {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string) => void;
}

function OptionGroup({ legend, name, options, selected, onSelect }: OptionGroupProps) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <ul className="pd-opts">
        {options.map((option) => (
          <li key={option.value}>
            <label className="opt">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={option.value === selected}
                onChange={() => onSelect(option.value)}
              />
              <span>{option.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function sizeLegend(label: string): string {
  return label.includes("(mm)") ? label : `${label} (mm)`;
}

/** The Timber and Size rows follow the choice. Any other row is shown as written. */
function specRows(
  specs: PriceSelectorProps["specs"],
  timberName: string,
  size: string | null,
): { label: string; value: string }[] {
  const timberRow = { label: "Timber", value: timberName };
  const rows = specs.map((spec) => {
    const key = spec.label.trim().toLowerCase();
    if (key === "timber") return timberRow;
    if (key === "size" && size !== null) return { label: spec.label, value: `${size} mm` };
    return spec;
  });
  if (!specs.some((spec) => spec.label.trim().toLowerCase() === "timber")) rows.unshift(timberRow);
  if (size !== null && !specs.some((spec) => spec.label.trim().toLowerCase() === "size")) {
    rows.push({ label: "Size", value: `${size} mm` });
  }
  return rows;
}

export function PriceSelector({ pieceSlug, pricing, timbers, specs, priceNote, note, enquiryNote, children }: PriceSelectorProps) {
  const [selection, setSelection] = useState<Selection>(() => startSelection(pricing));
  const sizes = pricing.rows.flatMap((row) => (row.label ? [row.label] : []));
  const timber = timbers.find((candidate) => candidate.slug === selection.timber);
  const bundle = bundleLine(pricing, selection);
  const extraLine = bundle ?? priceNote;

  return (
    <form className="pd-form" method="get" action="/enquire">
      <input type="hidden" name="piece" value={pieceSlug} />
      <div className="pd-pricebox" aria-live="polite" aria-atomic="true">
        <span className="pd-price">{selectionPriceText(pricing, selection)}</span>
        {extraLine && <span className="pd-set">{extraLine}</span>}
      </div>
      <div className="pd-avail pd-pick">
        <OptionGroup
          legend="Timber"
          name="timber"
          options={timbers.map((option) => ({ value: option.slug, label: option.name }))}
          selected={selection.timber}
          onSelect={(value) => setSelection({ ...selection, timber: value })}
        />
        {pricing.sizeLabel && (
          <OptionGroup
            legend={sizeLegend(pricing.sizeLabel)}
            name="size"
            options={sizes.map((size) => ({ value: size, label: size }))}
            selected={selection.size}
            onSelect={(value) => setSelection({ ...selection, size: value })}
          />
        )}
        {timber && (
          <Link className="pd-more" href={`/materials#mat-${timber.slug}`}>
            About {timber.name}
          </Link>
        )}
        {note && <div className="pd-note">{note}</div>}
      </div>
      {children}
      <dl className="pd-specs">
        {specRows(specs, timber?.name ?? "", pricing.sizeLabel ? selection.size : null).map((spec) => (
          <div key={spec.label}>
            <dt>{spec.label}</dt>
            <dd>{spec.value}</dd>
          </div>
        ))}
      </dl>
      <div className="pd-cta">
        <button type="submit" className="dark-btn">
          Enquire about this piece
        </button>
        <small>{enquiryNote}</small>
      </div>
    </form>
  );
}
