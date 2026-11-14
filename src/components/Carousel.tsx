"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageSource } from "@/lib/images";
import { Photo } from "./Photo";

interface CarouselImage {
  image: ImageSource;
  alt: string;
}

interface CarouselProps {
  images: CarouselImage[];
  href: string;
  sizes: string;
  label: string;
}

export function Carousel({ images, href, sizes, label }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const count = images.length;

  const syncCurrent = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCurrent(Math.round(track.scrollLeft / (track.clientWidth || 1)));
  }, []);

  useEffect(() => {
    window.addEventListener("resize", syncCurrent);
    return () => window.removeEventListener("resize", syncCurrent);
  }, [syncCurrent]);

  // Smooth scrolling is applied in CSS so prefers-reduced-motion can switch it off.
  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth });
  };

  return (
    <div className="ss" role="group" aria-roledescription="carousel" aria-label={label}>
      <div className="track" ref={trackRef} onScroll={syncCurrent} tabIndex={-1}>
        {images.map((image, index) => (
          <div
            key={index}
            className="slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            <Link href={href} tabIndex={-1}>
              <Photo image={image.image} alt={image.alt} sizes={sizes} />
            </Link>
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button
            className="arr prev"
            type="button"
            aria-label="Previous photo"
            disabled={current <= 0}
            onClick={() => goTo(current - 1)}
          >
            &#8249;
          </button>
          <button
            className="arr next"
            type="button"
            aria-label="Next photo"
            disabled={current >= count - 1}
            onClick={() => goTo(current + 1)}
          >
            &#8250;
          </button>
          <div className="dots">
            {images.map((image, index) => (
              <button
                key={index}
                type="button"
                tabIndex={-1}
                className={index === current ? "on" : undefined}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === current ? "true" : undefined}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
