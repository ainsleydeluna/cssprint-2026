import { SignInForm } from "./sign-in-form";

/** The sign-in page. Outside app/(app): no bottom nav, and proxy.ts lets signed-out visitors in. */
export function SignInScreen({ linkFailed }: { linkFailed: boolean }) {
  return (
    <main className="flex flex-1 flex-col justify-center pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
      <SignInForm linkFailed={linkFailed} />
    </main>
  );
}
