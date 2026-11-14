import { defineArrayMember, defineField, defineType } from "sanity";
import { orderRankField } from "@sanity/orderable-document-list";
import { materialNames } from "./materials";

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
      validation: (rule) => rule.required(),
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
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle on the piece page",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "cardPrice",
      title: "Price on the card",
      type: "string",
      description: 'Plain text, for example "From $4,300".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "pagePrice",
      title: "Price on the piece page",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({ name: "priceNote", title: "Price note (optional)", type: "string" }),
    defineField({ name: "note", title: "Note under the price (optional)", type: "string" }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 6,
      description: "Leave a blank line between paragraphs.",
      validation: (rule) => rule.required(),
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
            defineField({ name: "label", title: "Label", type: "string", validation: (rule) => rule.required() }),
            defineField({ name: "value", title: "Value", type: "string", validation: (rule) => rule.required() }),
          ],
          preview: { select: { title: "label", subtitle: "value" } },
        }),
      ],
    }),
    defineField({
      name: "availableTimbers",
      title: "Available timbers",
      type: "array",
      of: [defineArrayMember({ type: "string" })],
      options: { list: materialNames.map((name) => ({ title: name, value: name })), layout: "grid" },
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
