// Quote rules the routes share (docs/spec.md decisions 5, 15 and section 4):
// Manila dates, expiry, the first copy, labels and time-to-quote.

import { describe, expect, test } from "vitest";
import {
  averageTimeToQuote,
  copyChanges,
  manilaToday,
  nextInquiryLabel,
  statusOn,
  timeToQuoteSeconds,
  validUntilOnSend,
} from "./quote-rules";

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

describe("time-to-quote", () => {
  const created = "2026-10-23T02:00:00.000Z";

  test("runs from the photo upload to the first copy, in seconds", () => {
    expect(timeToQuoteSeconds({ createdAt: created, sentAt: "2026-10-23T02:03:30.400Z" })).toBe(210);
  });

  test("is null until the reply is copied", () => {
    expect(timeToQuoteSeconds({ createdAt: created, sentAt: null })).toBeNull();
  });

  test("the shop's average is over sent quotes only", () => {
    expect(averageTimeToQuote([120, null, 300, null])).toBe(210);
  });

  test("the shop's average is null with no sent quotes", () => {
    expect(averageTimeToQuote([null, null])).toBeNull();
  });
});

describe("copyChanges", () => {
  const now = new Date("2026-10-23T02:05:00.000Z");
  const complete = [{ stemId: "rose", count: 12 }, { stemId: "gypsophila", count: 1 }];
  const draft = { status: "draft", validUntil: null, sentAt: null } as const;

  test("the first copy sends the quote: sent time, valid-until two days on, and the text", () => {
    expect(copyChanges(draft, complete, "Hi po!", now, 2)).toEqual({
      ok: true,
      changes: { status: "sent", sentAt: "2026-10-23T02:05:00.000Z", validUntil: "2026-10-25", replyText: "Hi po!" },
    });
  });

  test("a later copy saves only the text: the sent time and valid-until stay", () => {
    const sent = { status: "sent", validUntil: "2026-10-25", sentAt: "2026-10-23T02:05:00.000Z" } as const;
    expect(copyChanges(sent, complete, "Hi po! Updated", new Date("2026-10-24T09:00:00Z"), 2)).toEqual({
      ok: true,
      changes: { replyText: "Hi po! Updated" },
    });
  });

  test("copying an expired quote's reply does not reopen it", () => {
    const expired = { status: "expired", validUntil: "2026-10-20", sentAt: "2026-10-18T02:05:00.000Z" } as const;
    expect(copyChanges(expired, complete, "Hi po!", now, 2)).toEqual({ ok: true, changes: { replyText: "Hi po!" } });
  });

  test.each([
    ["a blank count", [{ stemId: "rose", count: null }]],
    ['a "pick a flower" line', [{ stemId: null, count: 3 }]],
  ])("refuses a quote with %s as incomplete_quote", (_case, lines) => {
    expect(copyChanges(draft, lines, "Hi po!", now, 2)).toEqual({ ok: false, code: "incomplete_quote" });
  });
});
