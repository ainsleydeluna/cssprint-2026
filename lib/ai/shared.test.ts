import { describe, expect, test } from "vitest";
import { shortDate } from "./shared";

describe("shortDate", () => {
  test("writes a Manila date as the reply does", () => {
    expect(shortDate("2026-10-25")).toBe("Oct 25");
    expect(shortDate("2027-01-03")).toBe("Jan 3");
  });

  test.each(["Oct 25", "2026-10-25T00:00:00Z", "2026-13-01", "2026-02-30", ""])("throws on %j", (date) => {
    expect(() => shortDate(date)).toThrow(`shortDate needs a "YYYY-MM-DD" date, got "${date}"`);
  });
});
