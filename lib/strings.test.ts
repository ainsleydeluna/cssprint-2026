import { expect, test } from "vitest";
import { t } from "./strings";

test("returns a screen's label", () => {
  expect(t("nav", "quotes")).toBe("Mga quote");
});

test("fills placeholders", () => {
  expect(t("quote", "inquiryLabel", { n: 3 })).toBe("Inquiry 3");
});

test("a missing key fails the type check, and shows the key instead of crashing", () => {
  // @ts-expect-error: "nope" is not a key of the nav screen.
  expect(t("nav", "nope")).toBe("nav.nope");
});

test("an unknown screen shows the key instead of crashing", () => {
  // @ts-expect-error: "nope" is not a screen.
  expect(t("nope", "title")).toBe("nope.title");
});
