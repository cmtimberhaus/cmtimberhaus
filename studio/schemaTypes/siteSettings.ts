import { defineField, defineType } from "sanity";
import { paragraphsField, photoField, requiredText } from "./fields";
import { categoryOptions } from "./piece";

const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function categoryFields(title: string) {
  return [
    defineField({ name: "tileTitle", title: "Title on the home page tile", type: "string", validation: requiredText("tileTitle") }),
    photoField("tileImage", "Photo on the home page tile"),
    defineField({ name: "ctaEyebrow", title: `${title} page: small heading`, type: "string", validation: requiredText("ctaEyebrow") }),
    defineField({ name: "ctaHeading", title: `${title} page: heading`, type: "string", validation: requiredText("heading") }),
    defineField({ name: "ctaBody", title: `${title} page: text`, type: "text", rows: 3, validation: requiredText("ctaBody") }),
  ];
}

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  groups: [
    { name: "home", title: "Home page", default: true },
    { name: "categories", title: "Categories" },
    { name: "about", title: "About" },
    { name: "materials", title: "Materials page" },
    { name: "enquire", title: "Enquiries" },
    { name: "contact", title: "Contact" },
  ],
  fields: [
    defineField({
      name: "heroImage",
      title: "Home page photo",
      description: "The large photo behind the headline. It is decorative, so it has no description.",
      type: "image",
      group: "home",
      options: { hotspot: false },
      validation: (rule) => rule.required().error("A photo is required."),
    }),
    defineField({ name: "tagline", title: "Headline", type: "string", group: "home", validation: requiredText("tagline") }),
    defineField({ name: "sub", title: "Line under the headline", type: "string", group: "home", validation: requiredText("sub") }),
    defineField({ name: "location", title: "Location", type: "string", group: "home", validation: requiredText("location") }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "object",
      group: "categories",
      description: "The three categories are fixed. Edit their text and photos here.",
      fields: categoryOptions.map((category) =>
        defineField({
          name: category.value,
          title: category.title,
          type: "object",
          options: { collapsible: true, collapsed: false },
          fields: categoryFields(category.title),
        }),
      ),
    }),
    defineField({
      name: "about",
      title: "About page",
      type: "object",
      group: "about",
      fields: [
        photoField("photo", "Photo"),
        defineField({ name: "heading", title: "Heading", type: "string", validation: requiredText("heading") }),
        paragraphsField("paragraphs", "Paragraphs", "aboutParagraph"),
        defineField({ name: "signoff", title: "Sign-off", type: "string", validation: requiredText("signoff") }),
      ],
    }),
    defineField({
      name: "materialsIntro",
      title: "Materials page introduction",
      type: "object",
      group: "materials",
      fields: [
        defineField({ name: "heading", title: "Heading", type: "string", validation: requiredText("heading") }),
        paragraphsField("paragraphs", "Paragraphs", "introParagraph"),
      ],
    }),
    defineField({
      name: "enquireSection",
      title: "Start your piece (above the enquiry form)",
      type: "object",
      group: "enquire",
      fields: [
        defineField({ name: "heading", title: "Heading", type: "string", validation: requiredText("heading") }),
        defineField({ name: "body", title: "Text", type: "text", rows: 3, validation: requiredText("enquireBody") }),
      ],
    }),
    defineField({
      name: "pieceEnquiryNote",
      title: "Note on piece pages",
      type: "text",
      rows: 2,
      group: "enquire",
      validation: requiredText("pieceEnquiryNote"),
    }),
    defineField({
      name: "email",
      title: "Email address",
      type: "string",
      group: "contact",
      validation: (rule) => rule.required().regex(EMAIL, { name: "email", invert: false }).error("Enter a valid email address."),
    }),
    defineField({
      name: "instagram",
      title: "Instagram link",
      type: "url",
      group: "contact",
      description: "For example https://www.instagram.com/cmtimberhaus/",
      validation: (rule) =>
        rule
          .required()
          .uri({ scheme: ["https"] })
          .custom((value) => (!value || INSTAGRAM_URL.test(value) ? true : "Use an https://instagram.com/… or https://www.instagram.com/… link.")),
    }),
    defineField({
      name: "est",
      title: "Established (year)",
      type: "number",
      group: "contact",
      validation: (rule) => rule.required().integer().min(1900).max(2100),
    }),
  ],
  preview: { prepare: () => ({ title: "Site settings" }) },
});
