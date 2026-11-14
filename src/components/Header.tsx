"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LOGO_IMAGE, getImage } from "@/lib/images";
import { Photo } from "./Photo";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/materials", label: "Materials" },
  { href: "/about", label: "About" },
] as const;

const MENU_ID = "mobile-menu";
const DESKTOP_QUERY = "(min-width: 960px)";

interface HeaderProps {
  variant: "fixed" | "solid";
}

/** Makes everything outside the menu unreachable (focus and screen readers) and locks page scroll while it is open. */
function lockPageBehind(menu: HTMLElement): () => void {
  const inerted = Array.from(document.body.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element !== menu && !element.hasAttribute("inert"),
  );
  inerted.forEach((element) => element.setAttribute("inert", ""));
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    inerted.forEach((element) => element.removeAttribute("inert"));
    document.body.style.overflow = previousOverflow;
  };
}

export function Header({ variant }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant !== "fixed") return;
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [variant]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menuOpen || !menu) return;

    const release = lockPageBehind(menu);
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
      release();
      burgerRef.current?.focus();
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const headerClass = variant === "fixed" ? `fixed${scrolled ? " scrolled" : ""}` : "solid";

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={headerClass}>
        <div className="hbar">
          <Link className="logo" href="/" aria-label="CM Timberhaus home">
            <Photo image={getImage(LOGO_IMAGE)} alt="CM. Timberhaus" sizes="74px" eager />
          </Link>
          <div className="hnav">
            <nav className="nav" aria-label="Main">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <Link className="btn-enq" href="/enquire">
              Enquire
            </Link>
          </div>
          <button
            ref={burgerRef}
            type="button"
            className="burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>
      <div
        ref={menuRef}
        id={MENU_ID}
        className={menuOpen ? "menu open" : "menu"}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!menuOpen}
      >
        <div className="top">
          <Photo image={getImage(LOGO_IMAGE)} alt="CM. Timberhaus" sizes="44px" className="menu-logo" eager />
          <button ref={closeRef} type="button" className="close" aria-label="Close menu" onClick={closeMenu}>
            &times;
          </button>
        </div>
        <nav aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
        </nav>
        <Link className="enq" href="/enquire" onClick={closeMenu}>
          Enquire
        </Link>
      </div>
    </>
  );
}
