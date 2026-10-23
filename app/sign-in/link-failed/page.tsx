import { SignInScreen } from "../sign-in-screen";

// /auth/confirm sends a magic link that did not work here (expired, already used, or opened wrong).
export default function LinkFailedPage() {
  return <SignInScreen linkFailed />;
}
