import siteJson from "../../content/site.json";

/** Timber names come from the site's materials list, so there is one source of truth. */
export const materialNames: string[] = siteJson.materials.map((material) => material.name);
