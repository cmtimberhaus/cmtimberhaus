import type { Metadata } from "next";
import { EnquireSection } from "@/components/EnquireSection";
import { InnerLayout } from "@/components/InnerLayout";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Enquire",
  description:
    "Tell us what you have in mind and we will talk through timber, size and finish. Made to order in Torquay.",
  path: "/enquire",
});

export default function EnquirePage() {
  return (
    <InnerLayout>
      <EnquireSection headingLevel="h1" />
    </InnerLayout>
  );
}
