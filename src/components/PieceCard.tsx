import Link from "next/link";
import { pieceHref, type Piece } from "@/lib/content";
import { Carousel } from "./Carousel";

interface PieceCardProps {
  piece: Piece;
}

export function PieceCard({ piece }: PieceCardProps) {
  const href = pieceHref(piece);
  const images = piece.cardImages.map((image, index) => ({
    image,
    alt: `${piece.name}, ${piece.cardSubtitle}, photo ${index + 1} of ${piece.cardImages.length}`,
  }));

  return (
    <div className="card">
      <div className="ph">
        <Carousel images={images} href={href} sizes="(max-width: 600px) 50vw, 300px" label={`${piece.name} photos`} />
      </div>
      <Link className="card-link" href={href}>
        <h2 className="nm">{piece.name}</h2>
        <span className="ds">{piece.cardSubtitle}</span>
        <span className="pr">{piece.cardPrice}</span>
        <span className="view">View piece</span>
      </Link>
    </div>
  );
}
