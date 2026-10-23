// The photo picker's state with nothing picked. Pure, so picker-state.test.ts covers it.
import type { CropRect, Size } from "./process-photo";

export type PickerState = {
  /** The picked file and its upright size; the full-size image is never decoded. */
  photo: { file: File; size: Size } | null;
  /** Preview-size decode of the photo. */
  bitmap: ImageBitmap | null;
  /** Crop box as fractions (0–1) of the photo. */
  box: CropRect | null;
  busy: boolean;
  error: string | null;
};

/** On opening, and on leaving the page: no photo, no crop box, no preview held in memory. */
export const freshPicker = (): PickerState => ({ photo: null, bitmap: null, box: null, busy: false, error: null });
