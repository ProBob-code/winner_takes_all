"use client";

/**
 * The bottom bar, and the sheet behind it.
 *
 * A bar can hold about five things before they stop being tappable, and the
 * app has eleven destinations. It used to simply show six and drop the rest,
 * which left Venues, Live Screening, Games, Rankings and the organiser account
 * unreachable on a phone — not a decision anyone made, just two hand-written
 * lists drifting apart. Both lists are now one, in lib/nav.ts.
 *
 * Four primary destinations take slots; "More" opens everything else. Nothing
 * is unreachable.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navFor, isActivePath, type NavItem } from "@/lib/nav";

export function MobileNav({ user }: { user: any }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = navFor(!!user);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const rest = items.filter((i) => !primary.includes(i));

  // A navigation closes the sheet; leaving it open over the new page is the
  // classic way a bottom sheet becomes a trap.
  useEffect(() => setSheetOpen(false), [pathname]);

  // While the sheet is open the page behind it should not scroll.
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href as any}
      className={`mobile-nav-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
    >
      <span className="mobile-nav-icon">{item.icon}</span>
      <span className="mobile-nav-label">{item.short ?? item.label}</span>
    </Link>
  );

  return (
    <>
      {sheetOpen && (
        <div
          className="mobile-sheet-backdrop"
          onClick={() => setSheetOpen(false)}
          role="presentation"
        />
      )}

      <div className={`mobile-sheet ${sheetOpen ? "open" : ""}`} aria-hidden={!sheetOpen}>
        <div className="mobile-sheet-grip" />
        <div className="mobile-sheet-grid">
          {rest.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              className={`mobile-sheet-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
              tabIndex={sheetOpen ? 0 : -1}
            >
              <span className="mobile-sheet-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <nav className="mobile-nav">
        {primary.map(link)}
        <button
          type="button"
          className={`mobile-nav-link ${sheetOpen ? "active" : ""}`}
          onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? "Close the menu" : "More destinations"}
        >
          <span className="mobile-nav-icon">{sheetOpen ? "✕" : "⋯"}</span>
          <span className="mobile-nav-label">{sheetOpen ? "Close" : "More"}</span>
        </button>
      </nav>
    </>
  );
}
