import { describe, expect, it } from "vitest";
import { formatDuration } from "./duration";

describe("formatDuration (time-to-quote)", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(0)).toBe("0 seg");
    expect(formatDuration(45)).toBe("45 seg");
  });
  it("shows minutes and seconds under an hour, dropping 0 seconds", () => {
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(252)).toBe("4 min 12 seg");
  });
  it("shows hours and minutes from an hour, dropping seconds", () => {
    expect(formatDuration(3600)).toBe("1 oras");
    expect(formatDuration(3900)).toBe("1 oras 5 min");
    expect(formatDuration(3959)).toBe("1 oras 5 min");
  });
});
