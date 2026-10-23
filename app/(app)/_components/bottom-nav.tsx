"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/quotes/new", label: "Bagong quote" },
  { href: "/scan", label: "I-scan ang resibo" },
  { href: "/quotes", label: "Mga quote" },
] as const;

export function BottomNav() {
  return <BottomNavBar pathname={usePathname()} />;
}

/** The bar itself. `pathname` null (while the URL is still loading) highlights no tab. */
export function BottomNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Pangunahing menu"
      className="fixed inset-x-0 bottom-0 border-t border-dashed border-ink/30 bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      {/* Height stays 5rem (py-2 + h-16) so the layout padding still matches. */}
      <ul className="grid grid-cols-3 gap-2 px-2 py-2">
        {TABS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`btn h-16 w-full px-2 text-center text-sm leading-tight break-words ${
                  active ? "btn-primary" : "btn-quiet"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
