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
      className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] dark:border-zinc-800 dark:bg-zinc-950"
    >
      <ul className="grid grid-cols-3">
        {TABS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-20 items-center justify-center px-2 text-center text-sm leading-tight font-semibold break-words ${
                  active
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : "text-zinc-600 active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-900"
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
