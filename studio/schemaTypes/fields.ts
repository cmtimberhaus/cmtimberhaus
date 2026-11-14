import { defineArrayMember, defineField } from "sanity";
import type { StringRule } from "sanity";
import { limits, type LimitKey } from "./limits";

/** Required, with a soft length limit that only warns. */
export function requiredText(limit: LimitKey) {
  return (rule: StringRule) => [
    rule.required(),
    rule.max(limits[limit]).warning(`Over ${limits[limit]} characters. It may not fit the layout.`),
  ];
}

/** Optional, with a soft length limit that only warns. */
export function optionalText(limit: LimitKey) {
  return (rule: StringRule) =>
    rule.max(limits[limit]).warning(`Over ${limits[limit]} characters. It may not fit the layout.`);
}

/** A photo that must have a description for screen readers. */
export function photoField(name: string, title: string, description?: string) {
  return defineField({
    name,
    title,
    type: "image",
    description,
    options: { hotspot: false },
    fields: [
      defineField({
        name: "alt",
        title: "Photo description",
        type: "string",
        description: "Read aloud by screen readers. Say what the photo shows.",
        validation: (rule) => [
          rule.required().error("Every photo needs a description."),
          rule.max(limits.photoAlt).warning(`Over ${limits.photoAlt} characters.`),
        ],
      }),
    ],
    validation: (rule) => rule.required().error("A photo is required."),
  });
}

/** A list of paragraphs, one list item each. */
export function paragraphsField(name: string, title: string, limit: LimitKey) {
  return defineField({
    name,
    title,
    type: "array",
    of: [
      defineArrayMember({
        type: "text",
        rows: 4,
        validation: (rule) => [
          rule.required(),
          rule.max(limits[limit]).warning(`Over ${limits[limit]} characters. It may not fit the layout.`),
        ],
      }),
    ],
    validation: (rule) => rule.required().min(1),
  });
}
