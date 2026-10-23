// The shop page's sign-out: a confirm step before the form posts, with no
// browser dialog, that works before the page's JavaScript loads.

import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SignOut } from "./SignOut";

const html = renderToStaticMarkup(<SignOut />);

test("starts closed: the first tap only opens the confirm step", () => {
  expect(html).toMatch(/^<details(?![^>]*\bopen\b)[^>]*>/);
  expect(html).toMatch(/<summary[^>]*>Mag-sign out<\/summary>/);
});

test("the confirm step asks, and only its yes button posts the form to /auth/sign-out", () => {
  const form = html.match(/<form[^>]*>/)![0];
  expect(form).toContain('action="/auth/sign-out"');
  expect(form).toContain('method="post"');
  expect(html).toContain(">Mag-sign out?<");
  expect(html).toMatch(/<button type="submit"[^>]*>Oo, mag-sign out<\/button>/);
  expect(html).toMatch(/<button type="button"[^>]*>Huwag na<\/button>/);
});
