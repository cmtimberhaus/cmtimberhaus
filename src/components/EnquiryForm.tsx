"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { findCell, formatPrice, resolveSelection, type PiecePricing, type Selection } from "@/lib/pricing";

type Status = "idle" | "sending" | "sent" | "error";

export interface EnquiryPiece {
  slug: string;
  name: string;
  pricing: PiecePricing | null;
  timbers: { slug: string; name: string }[];
}

interface EnquiryFormProps {
  pieces: EnquiryPiece[];
  fallbackEmail: string;
}

/** What the link chose: timber name, size and the guide price, all as text. */
interface Chosen {
  timber: string;
  size: string;
  guidePrice: string;
}

interface ApiResponse {
  error?: string;
}

function isApiResponse(value: unknown): value is ApiResponse {
  return typeof value === "object" && value !== null;
}

/** Reads timber and size from the link. Values this piece does not offer are ignored. */
function chosenFromLink(piece: EnquiryPiece, params: URLSearchParams): Chosen | null {
  const { pricing } = piece;
  if (!pricing) return null;
  const timberParam = params.get("timber");
  const sizeParam = params.get("size");
  const timberKnown = piece.timbers.some((timber) => timber.slug === timberParam);
  const sizeKnown = pricing.rows.some((row) => row.label !== null && row.label === sizeParam);
  if (!timberKnown && !sizeKnown) return null;

  const selection: Selection = resolveSelection(pricing, timberKnown ? timberParam : null, sizeKnown ? sizeParam : null);
  const cell = findCell(pricing, selection);
  const timber = piece.timbers.find((candidate) => candidate.slug === selection.timber);
  if (!cell || !timber) return null;
  const each = pricing.priceSuffix === "each" ? " each" : "";
  return {
    timber: timber.name,
    size: selection.size ? `${selection.size} mm` : "",
    guidePrice: `${formatPrice(cell.amount)}${each}`,
  };
}

function interestMessage(pieceName: string, chosen: Chosen | null): string {
  const article = /^(the|mr|mrs|ms|miss) /i.test(pieceName) ? "" : "the ";
  if (!chosen) return `Hi, I'm interested in ${article}${pieceName}. `;
  const detail = [chosen.timber, chosen.size].filter(Boolean).join(", ");
  return `Hi, I'm interested in ${article}${pieceName} in ${detail} (guide price ${chosen.guidePrice}). `;
}

export function EnquiryForm({ pieces, fallbackEmail }: EnquiryFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pieceSlug, setPieceSlug] = useState("");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");
  const thanksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const piece = pieces.find((candidate) => candidate.slug === params.get("piece"));
    if (!piece) return;
    const fromLink = chosenFromLink(piece, params);
    setPieceSlug(piece.slug);
    setChosen(fromLink);
    setMessage((current) => current || interestMessage(piece.name, fromLink));
  }, [pieces]);

  useEffect(() => {
    if (status === "sent") thanksRef.current?.focus();
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorText("");

    try {
      const response = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          piece: pieceSlug,
          timber: chosen?.timber ?? "",
          size: chosen?.size ?? "",
          guidePrice: chosen?.guidePrice ?? "",
          website,
        }),
      });

      if (response.ok) {
        setStatus("sent");
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      setErrorText(isApiResponse(body) && body.error ? body.error : "");
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="thanks" role="status" tabIndex={-1} ref={thanksRef}>
        <strong>Thank you.</strong>
        <p>Your enquiry has been sent. We&rsquo;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form className="enq-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={5000}
          style={{ resize: "vertical" }}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <label className="hp" aria-hidden="true">
        Leave this field empty
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </label>
      {status === "error" && (
        <p className="form-error" role="alert">
          {errorText || "Sorry, your enquiry could not be sent."} Please try again, or email us at{" "}
          <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.
        </p>
      )}
      <button type="submit" className="dark-btn" style={{ alignSelf: "flex-start" }} disabled={status === "sending"}>
        {status === "sending" ? "Sending" : "Send Enquiry"}
      </button>
    </form>
  );
}
