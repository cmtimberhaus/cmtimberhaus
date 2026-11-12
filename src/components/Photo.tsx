import { getImage } from "@/lib/images";

interface PhotoProps {
  name: string;
  alt: string;
  sizes: string;
  className?: string;
  /** Above-the-fold hero image: eager and high fetch priority. */
  priority?: boolean;
  /** Small chrome image (logo): loads up front, even when hidden, at low priority so it is never preloaded or competes with content. */
  eager?: boolean;
}

export function Photo({ name, alt, sizes, className, priority = false, eager = false }: PhotoProps) {
  const image = getImage(name);
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
