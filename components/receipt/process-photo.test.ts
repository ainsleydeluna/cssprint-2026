import { describe, expect, it } from "vitest";
import { cropInPixels, fitWithin, outputPlan, readOrientation, stepDownSizes, withOrientation } from "./process-photo";

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

describe("cropInPixels (crop-based decode: the crop at full detail, upright pixels)", () => {
  it("turns the crop box into pixels of the upright photo", () => {
    expect(cropInPixels(PHOTO, { x: 0.5, y: 0.5, width: 0.1, height: 0.1 })).toEqual({ x: 2000, y: 1500, width: 400, height: 300 });
  });
  it("keeps the rectangle inside the photo after rounding, at least 1 px", () => {
    const r = cropInPixels({ width: 4001, height: 2999 }, { x: 0.9999, y: 0.9999, width: 0.0001, height: 0.0001 });
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.x + r.width).toBeLessThanOrEqual(4001);
    expect(r.y + r.height).toBeLessThanOrEqual(2999);
  });
  it("lets a crop come out at full detail up to MAX_PHOTO_PX, instead of the capped decode's", () => {
    const quarterWidth = { x: 0, y: 0, width: 0.25, height: 0.25 }; // 1000 × 750 of the photo
    expect(fitWithin(cropInPixels(PHOTO, quarterWidth), 1600)).toEqual({ width: 1000, height: 750 });
    expect(outputPlan(PHOTO, quarterWidth, 1600, 3200).out).toEqual({ width: 800, height: 600 }); // before
    const half = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }; // 2000 × 1500: reaches the limit
    expect(fitWithin(cropInPixels(PHOTO, half), 1600)).toEqual({ width: 1600, height: 1200 });
  });
});

describe("withOrientation (the tiny probe photo for the crop-order check)", () => {
  // SOI, then a stand-in for the rest of a JPEG.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02]);

  it("puts an EXIF segment with the orientation right after the start marker", () => {
    const out = withOrientation(jpeg, 6);
    expect([...out.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    const length = (out[4] << 8) | out[5];
    expect(new TextDecoder("latin1").decode(out.slice(6, 12))).toBe("Exif\0\0");
    // Big-endian TIFF: one IFD entry, tag 0x0112 (Orientation), type SHORT, value 6.
    const tiff = out.slice(12, 4 + length);
    expect([...tiff.slice(0, 4)]).toEqual([0x4d, 0x4d, 0x00, 0x2a]);
    expect([...tiff.slice(10, 12)]).toEqual([0x01, 0x12]);
    expect((tiff[18] << 8) | tiff[19]).toBe(6);
  });
  it("keeps the rest of the photo unchanged after the segment", () => {
    const out = withOrientation(jpeg, 6);
    const length = (out[4] << 8) | out[5];
    expect([...out.slice(4 + length)]).toEqual([...jpeg.slice(2)]);
  });
});

describe("readOrientation (whether the photo carries a rotation flag)", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);

  it("reads the flag from a big-endian EXIF segment", () => {
    expect(readOrientation(withOrientation(jpeg, 6))).toBe(6);
    expect(readOrientation(withOrientation(jpeg, 3))).toBe(3);
  });
  it("reads the flag from a little-endian one (most phone cameras), after other segments", () => {
    const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0];
    const app1 = [0xff, 0xe1, 0, 6 + tiff.length + 2, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]; // a JFIF stand-in before the EXIF
    expect(readOrientation(new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...jpeg.slice(2)]))).toBe(8);
  });
  it("is 1 (upright) with no EXIF, a cut-off header, or not a JPEG", () => {
    expect(readOrientation(jpeg)).toBe(1);
    expect(readOrientation(withOrientation(jpeg, 6).slice(0, 20))).toBe(1);
    expect(readOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
  });
});
