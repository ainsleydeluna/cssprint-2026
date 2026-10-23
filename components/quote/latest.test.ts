import { describe, expect, it } from "vitest";
import { createTickets } from "./latest";

describe("createTickets (ignore an answer once the florist has left)", () => {
  it("keeps the newest ticket current", () => {
    const tickets = createTickets();
    const first = tickets.next();
    expect(tickets.isCurrent(first)).toBe(true);
    const second = tickets.next();
    expect(tickets.isCurrent(first)).toBe(false);
    expect(tickets.isCurrent(second)).toBe(true);
  });
  it("makes every ticket stale on cancel (leaving the page)", () => {
    const tickets = createTickets();
    const ticket = tickets.next();
    tickets.cancel();
    expect(tickets.isCurrent(ticket)).toBe(false);
  });
});
