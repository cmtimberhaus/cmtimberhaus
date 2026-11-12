"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "sent" | "error";

interface EnquiryFormProps {
  pieces: { slug: string; name: string }[];
  fallbackEmail: string;
}

interface ApiResponse {
  error?: string;
}

function isApiResponse(value: unknown): value is ApiResponse {
  return typeof value === "object" && value !== null;
}

function interestMessage(pieceName: string): string {
  const article = /^(the|mr|mrs|ms|miss) /i.test(pieceName) ? "" : "the ";
  return `Hi, I'm interested in ${article}${pieceName}. `;
}

export function EnquiryForm({ pieces, fallbackEmail }: EnquiryFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pieceSlug, setPieceSlug] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");
  const thanksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("piece");
    const piece = pieces.find((candidate) => candidate.slug === slug);
    if (!piece) return;
    setPieceSlug(piece.slug);
    setMessage((current) => current || interestMessage(piece.name));
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
        body: JSON.stringify({ name, email, message, piece: pieceSlug, website }),
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
