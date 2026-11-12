import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function InnerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header variant="solid" />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
