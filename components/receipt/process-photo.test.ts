import { describe, expect, it } from "vitest";
import { fitWithin, outputPlan, stepDownSizes } from "./process-photo";

// A 12 MP phone photo, upright landscape.
const PHOTO = { width: 4000, height: 3000 };

describe("fitWithin", () => {
  it("shrinks the long edge to the limit and keeps the shape", () => {
    expect(fitWithin(PHOTO, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges and never reaches 0", () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: 10000, height: 1 }, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("outputPlan", () => {
  it("decodes the whole photo straight at MAX_PHOTO_PX, never at full size", () => {
    expect(outputPlan(PHOTO, null, 1600, 3200)).toEqual({
      decode: { width: 1600, height: 1200 },
      crop: { x: 0, y: 0, width: 1600, height: 1200 },
      out: { width: 1600, height: 1200 },
    });
  });
  it("decodes just big enough for the crop to come out at MAX_PHOTO_PX", () => {
    const half = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }; // 2000 × 1500 of the photo
    expect(outputPlan(PHOTO, half, 1600, 3200)).toEqual({
      decode: { width: 3200, height: 2400 },
      crop: { x: 800, y: 600, width: 1600, height: 1200 },
      out: { width: 1600, height: 1200 },
    });
  });
  it("caps the decode for a small crop, which then comes out smaller instead", () => {
    const small = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }; // 400 × 300 of the photo
    const plan = outputPlan(PHOTO, small, 1600, 3200);
    expect(plan.decode).toEqual({ width: 3200, height: 2400 });
    expect(plan.crop).toEqual({ x: 1600, y: 1200, width: 320, height: 240 });
    expect(plan.out).toEqual({ width: 320, height: 240 });
  });
  it("keeps a small photo at its own size", () => {
    expect(outputPlan({ width: 800, height: 600 }, null, 1600, 3200).out).toEqual({ width: 800, height: 600 });
  });
  it("keeps the crop inside the decoded photo after rounding", () => {
    const edge = { x: 0.999, y: 0.999, width: 0.001, height: 0.001 };
    const { decode, crop } = outputPlan({ width: 4001, height: 2999 }, edge, 1600, 3200);
    expect(crop.width).toBeGreaterThanOrEqual(1);
    expect(crop.x + crop.width).toBeLessThanOrEqual(decode.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(decode.height);
  });
});

describe("stepDownSizes (fallback when the browser can't resize while decoding)", () => {
  it("halves until the next half would be smaller than the target, then lands on it", () => {
    expect(stepDownSizes(PHOTO, { width: 1600, height: 1200 })).toEqual([
      { width: 2000, height: 1500 },
      { width: 1600, height: 1200 },
    ]);
    expect(stepDownSizes({ width: 8000, height: 6000 }, { width: 1600, height: 1200 })).toEqual([
      { width: 4000, height: 3000 },
      { width: 2000, height: 1500 },
      { width: 1600, height: 1200 },
    ]);
  });
  it("is one step when the photo is already close to the target", () => {
    expect(stepDownSizes({ width: 2000, height: 1500 }, { width: 1600, height: 1200 })).toEqual([
      { width: 1600, height: 1200 },
    ]);
  });
});
