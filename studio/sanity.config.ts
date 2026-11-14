import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";

export default defineConfig({
  name: "default",
  title: "CM Timberhaus",
  projectId: "ka21otlh",
  dataset: "production",
  plugins: [structureTool({ structure })],
  schema: { types: schemaTypes },
});
