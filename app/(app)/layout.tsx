import { Suspense } from "react";
import { BottomNav, BottomNavBar } from "./_components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Bottom padding = bar height (5rem + 1px border) + home-indicator inset, so the bar never covers content. */}
      <main className="flex flex-1 flex-col pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5rem+1px+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
        {children}
      </main>
      {/* usePathname() waits for the URL on pages like /receipts/[id]; the fallback is the same bar, no tab highlighted. */}
      <Suspense fallback={<BottomNavBar pathname={null} />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
