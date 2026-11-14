import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";
import { singletonTypes, structure } from "./structure";

const singletons: readonly string[] = singletonTypes;
const singletonActions = new Set(["publish", "discardChanges", "restore"]);

export default defineConfig({
  name: "default",
  title: "CM Timberhaus",
  projectId: "ka21otlh",
  dataset: "production",
  plugins: [structureTool({ structure })],
  schema: {
    types: schemaTypes,
    // Site settings is a single document: it cannot be created from the "New" menu.
    templates: (templates) => templates.filter(({ schemaType }) => !singletons.includes(schemaType)),
  },
  document: {
    // No delete, duplicate or unpublish on site settings.
    actions: (input, { schemaType }) =>
      singletons.includes(schemaType) ? input.filter(({ action }) => action && singletonActions.has(action)) : input,
    newDocumentOptions: (prev, { creationContext }) =>
      creationContext.type === "global" ? prev.filter((item) => !singletons.includes(item.templateId)) : prev,
  },
});
