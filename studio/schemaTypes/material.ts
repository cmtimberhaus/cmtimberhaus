import { defineField, defineType } from "sanity";
import { orderRankField } from "@sanity/orderable-document-list";
import { photoField, requiredText } from "./fields";

export const material = defineType({
  name: "material",
  title: "Timber",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: requiredText("materialName") }),
    defineField({
      name: "slug",
      title: "Web address",
      type: "slug",
      description: "Used for the link to this timber on the Materials page. Changing it breaks existing links.",
      options: { source: "name", maxLength: 80 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      description: 'For example "Australian hardwood".',
      validation: requiredText("materialKind"),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 5,
      validation: requiredText("materialDescription"),
    }),
    defineField({
      name: "summary",
      title: "One-line summary",
      type: "text",
      rows: 3,
      validation: requiredText("materialSummary"),
    }),
    photoField("image", "Photo"),
    orderRankField({ type: "material" }),
  ],
  preview: { select: { title: "name", subtitle: "kind", media: "image" } },
});
