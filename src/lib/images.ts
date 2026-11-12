import imageDimensions from "../../content/images.json";

interface ImageRecord {
  width: number;
  height: number;
  format: "webp" | "png";
}

interface ImageSource {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
}

const records: Record<string, ImageRecord> = imageDimensions as Record<string, ImageRecord>;

export const LOGO_IMAGE = "logo";

const SMALL = 800;
const LARGE = 1600;

function scaled(record: ImageRecord, longEdge: number): { width: number; height: number } {
  const ratio = Math.min(1, longEdge / Math.max(record.width, record.height));
  return { width: Math.round(record.width * ratio), height: Math.round(record.height * ratio) };
}

export function getImage(name: string): ImageSource {
  const record = records[name];
  if (!record) {
    throw new Error(`Unknown image "${name}". Check content/images.json and public/images.`);
  }

  if (record.format === "png") {
    return { src: `/images/${name}.png`, width: record.width, height: record.height };
  }

  const small = scaled(record, SMALL);
  const large = scaled(record, LARGE);
  return {
    src: `/images/${name}-${LARGE}.webp`,
    srcSet: `/images/${name}-${SMALL}.webp ${small.width}w, /images/${name}-${LARGE}.webp ${large.width}w`,
    width: large.width,
    height: large.height,
  };
}
