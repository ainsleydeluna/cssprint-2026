import { describe, expect, it } from "vitest";
import { freshPicker } from "./picker-state";

describe("freshPicker (the picker with nothing picked)", () => {
  it("holds no photo, no preview, no crop box, no error, and isn't busy", () => {
    expect(freshPicker()).toEqual({ photo: null, bitmap: null, box: null, busy: false, error: null });
  });
  it("is a new object each time, so a reset never shares state", () => {
    expect(freshPicker()).not.toBe(freshPicker());
  });
});
