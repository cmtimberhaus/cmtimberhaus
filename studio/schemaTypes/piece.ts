import { defineArrayMember, defineField, defineType } from "sanity";
import { orderRankField } from "@sanity/orderable-document-list";
import { optionalText, requiredText } from "./fields";
import { limits } from "./limits";

export const categoryOptions = [
  { title: "Dining", value: "dining" },
  { title: "Living", value: "living" },
  { title: "Bathroom", value: "bathroom" },
] as const;

export const layoutOptions = [
  { title: "Automatic", value: "auto" },
  { title: "Large first photo, rest in a grid", value: "lead" },
  { title: "Wide photos, one per row", value: "wide" },
] as const;

export const piece = defineType({
  name: "piece",
  title: "Piece",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: requiredText("pieceName"),
    }),
    defineField({
      name: "slug",
      title: "Web address",
      type: "slug",
      description: "Changing this after the piece is live breaks existing links to it.",
      options: { source: "name", maxLength: 80 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: { list: [...categoryOptions], layout: "radio" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "cardSubtitle",
      title: "Subtitle on the card",
      type: "string",
      validation: requiredText("pieceSubtitle"),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle on the piece page",
      type: "string",
      validation: requiredText("pieceSubtitle"),
    }),
    defineField({
      name: "cardPrice",
      title: "Price on the card",
      type: "string",
      description: 'Plain text, for example "From $4,300".',
      validation: requiredText("piecePrice"),
    }),
    defineField({
      name: "pagePrice",
      title: "Price on the piece page",
      type: "string",
      validation: requiredText("piecePrice"),
    }),
    defineField({
      name: "priceNote",
      title: "Price note (optional)",
      type: "string",
      validation: optionalText("piecePriceNote"),
    }),
    defineField({
      name: "note",
      title: "Note under the price (optional)",
      type: "string",
      validation: optionalText("pieceNote"),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 6,
      description: "Leave a blank line between paragraphs.",
      validation: requiredText("pieceDescription"),
    }),
    defineField({
      name: "specs",
      title: "Specifications",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "spec",
          fields: [
            defineField({ name: "label", title: "Label", type: "string", validation: requiredText("specLabel") }),
            defineField({ name: "value", title: "Value", type: "string", validation: requiredText("specValue") }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
    }),
    defineField({
      name: "availableTimbers",
      title: "Available timbers",
      type: "array",
      description: "Drag to reorder. The order here is the order on the piece page. Timbers are added and edited under Timbers.",
      of: [defineArrayMember({ type: "reference", to: [{ type: "material" }] })],
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: "images",
      title: "Photos",
      description: "The first photo leads the piece page. Drag to reorder.",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "pieceImage",
          fields: [
            defineField({ name: "image", title: "Photo", type: "image", validation: (rule) => rule.required() }),
            defineField({
              name: "alt",
              title: "Photo description (optional)",
              type: "string",
              description: "Read aloud by screen readers. If empty, the site writes one from the piece name.",
              validation: (rule) =>
                rule.max(limits.photoAlt).warning(`Over ${limits.photoAlt} characters.`),
            }),
          ],
          preview: { select: { title: "alt", media: "image" }, prepare: ({ title, media }) => ({ title: title ?? "Photo", media }) },
        }),
      ],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "cardCover",
      title: "Different photo for the card (optional)",
      description: "Replaces the first photo on the category page card only.",
      type: "image",
    }),
    defineField({
      name: "galleryLayout",
      title: "Photo layout on the piece page",
      type: "string",
      options: { list: [...layoutOptions], layout: "radio" },
      initialValue: "auto",
      validation: (rule) => rule.required(),
    }),
    orderRankField({ type: "piece" }),
  ],
  preview: {
    select: { title: "name", subtitle: "category", media: "images.0.image" },
  },
});
