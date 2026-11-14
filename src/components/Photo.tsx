import type { ImageSource } from "@/lib/images";

interface PhotoProps {
  image: ImageSource;
  alt: string;
  sizes: string;
  className?: string;
  /** Above-the-fold hero image: eager and high fetch priority. */
  priority?: boolean;
  /** Small chrome image (logo): loads up front, even when hidden, at low priority so it is never preloaded or competes with content. */
  eager?: boolean;
}

export function Photo({ image, alt, sizes, className, priority = false, eager = false }: PhotoProps) {
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.srcSet ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={alt}
      className={className}
      loading={priority || eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : eager ? "low" : undefined}
      decoding="async"
    />
  );
}
