import Image from "next/image";
import { Suspense } from "react";
import { BottomNav, BottomNavBar } from "./_components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Slim top bar: 44 px under the notch's safe area, the logo and the app name on the left. */}
      <header className="border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-11 items-center gap-2">
          <Image src="/logo.png" alt="" width={32} height={32} preload className="size-8 rounded-lg" />
          <span className="text-lg font-semibold">Tangkay</span>
        </div>
      </header>
      {/* Bottom padding = bar height (5rem + 1px border) + home-indicator inset, so the bar never covers content. */}
      <main className="flex flex-1 flex-col pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5rem+1px+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
        {children}
      </main>
      {/* usePathname() waits for the URL on pages like /receipts/[id]; the fallback is the same bar, no tab highlighted. */}
      <Suspense fallback={<BottomNavBar pathname={null} />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
