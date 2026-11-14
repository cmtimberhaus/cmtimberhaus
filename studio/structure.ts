import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";
import type { StructureResolver } from "sanity/structure";
import { categoryOptions } from "./schemaTypes/piece";

export const structure: StructureResolver = (S, context) =>
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
    );
