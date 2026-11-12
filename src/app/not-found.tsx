import Link from "next/link";
import { InnerLayout } from "@/components/InnerLayout";

export default function NotFound() {
  return (
    <InnerLayout>
      <div className="cream">
        <div className="wrap notfound">
          <span className="eyebrow">404</span>
          <h1>Page not found</h1>
          <Link className="dark-btn" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </InnerLayout>
  );
}
