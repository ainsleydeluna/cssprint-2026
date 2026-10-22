// Quote rules the routes share (docs/spec.md decisions 5, 15 and section 4):
// Manila dates, expiry, the first copy, labels and time-to-quote.

import { describe, expect, test } from "vitest";
import { manilaToday, nextInquiryLabel, statusOn, validUntilOnSend } from "./quote-rules";

describe("manilaToday", () => {
  test("is the calendar date in Manila, eight hours ahead of UTC", () => {
    expect(manilaToday(new Date("2026-10-22T15:59:59Z"))).toBe("2026-10-22");
    expect(manilaToday(new Date("2026-10-22T16:00:00Z"))).toBe("2026-10-23");
  });
});

describe("statusOn", () => {
  test("a sent quote holds through its valid-until date and expires the day after", () => {
    const sent = { status: "sent", validUntil: "2026-10-25" } as const;
    expect(statusOn(sent, "2026-10-25")).toBe("sent");
    expect(statusOn(sent, "2026-10-26")).toBe("expired");
  });

  test("an expired quote whose valid-until date moved later is sent again", () => {
    expect(statusOn({ status: "expired", validUntil: "2026-10-30" }, "2026-10-26")).toBe("sent");
  });

  test("a draft never expires, even with a valid-until date in the past", () => {
    expect(statusOn({ status: "draft", validUntil: "2026-10-01" }, "2026-10-26")).toBe("draft");
  });
});

describe("validUntilOnSend", () => {
  test("is the sent date plus the shop's valid-for days", () => {
    expect(validUntilOnSend(null, "2026-10-23", 2)).toBe("2026-10-25");
  });

  test("carries over into the next month", () => {
    expect(validUntilOnSend(null, "2026-10-31", 2)).toBe("2026-11-02");
  });

  test("keeps a date the florist set on the draft, if it has not passed", () => {
    expect(validUntilOnSend("2026-10-28", "2026-10-23", 2)).toBe("2026-10-28");
    expect(validUntilOnSend("2026-10-23", "2026-10-23", 2)).toBe("2026-10-23");
  });

  test("replaces a date the florist set that has already passed", () => {
    expect(validUntilOnSend("2026-10-20", "2026-10-23", 2)).toBe("2026-10-25");
  });
});

describe("nextInquiryLabel", () => {
  test("the shop's first quote is Inquiry 1", () => {
    expect(nextInquiryLabel([])).toBe("Inquiry 1");
  });

  test("counts renamed quotes too", () => {
    expect(nextInquiryLabel(["Inquiry 1", "Debut, Oct 25"])).toBe("Inquiry 3");
  });

  test("never repeats a number still in use after a quote is deleted", () => {
    // Inquiry 2 was deleted: two quotes left, but 3 is taken.
    expect(nextInquiryLabel(["Inquiry 1", "Inquiry 3"])).toBe("Inquiry 4");
  });
});
