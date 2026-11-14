import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";
import type { StructureResolver } from "sanity/structure";
import { categoryOptions } from "./schemaTypes/piece";

export const singletonTypes = ["siteSettings"] as const;

export const structure: StructureResolver = (S, context) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site settings")
        .id("siteSettings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings").title("Site settings")),
      S.divider(),
      orderableDocumentListDeskItem({ type: "material", S, context, id: "materials", title: "Timbers" }),
      S.divider(),
      S.listItem()
        .title("Pieces")
        .id("pieces")
        .child(
          S.list()
            .title("Pieces")
            .items(
              categoryOptions.map((category) =>
                orderableDocumentListDeskItem({
                  type: "piece",
                  S,
                  context,
                  id: `pieces-${category.value}`,
                  title: category.title,
                  filter: "_type == $type && category == $category",
                  params: { type: "piece", category: category.value },
                }),
              ),
            ),
        ),
    ]);
