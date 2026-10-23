import { describe, expect, it } from "vitest";
import { peso } from "./format";

describe("peso (quote screens: whole pesos)", () => {
  it("shows whole pesos with a thousands comma and no centavos", () => {
    expect(peso(3780)).toBe("₱3,780");
    expect(peso(0)).toBe("₱0");
    expect(peso(1234567)).toBe("₱1,234,567");
  });
});
