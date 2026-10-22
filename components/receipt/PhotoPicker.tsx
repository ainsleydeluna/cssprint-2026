// No "use client" here: onPhoto is a function, so the picker must be rendered
// from a Client Component (like the scan page), which makes it client code too.
import { useEffect, useRef, useState } from "react";
import { Button } from "./kit";
import { type CropRect, decodePhoto, processPhoto } from "./process-photo";

// The on-screen preview only needs to be sharp, not full size.
const PREVIEW_LONG_EDGE_PX = 1600;
// A drag smaller than this share of the photo counts as a tap, not a box.
const MIN_BOX_FRACTION = 0.03;

type Props = {
  onPhoto: (photo: File) => void;
  /** "camera" opens the back camera on phones; "gallery" lets the user pick an existing photo. */
  source?: "camera" | "gallery";
  label?: string;
};

type Point = { x: number; y: number };

// Spec decision 26: the crop screen opens with the whole photo selected, so one tap accepts it.
const WHOLE: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export function PhotoPicker({ onPhoto, source = "camera", label = "Kumuha ng photo" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  // Where the current drag started, and the box before it (restored if the drag was just a tap).
  const drag = useRef<{ start: Point; before: CropRect | null } | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  // Crop box as fractions (0–1) of the photo, so it survives layout changes.
  const [box, setBox] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draw the decoded photo into the preview canvas; free its memory when replaced.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!bitmap || !canvas) return;
    const scale = Math.min(1, PREVIEW_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return () => bitmap.close();
  }, [bitmap]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setBitmap(await decodePhoto(file));
      setBox(WHOLE);
    } catch {
      setError("Hindi mabasa ang photo na ito. Subukan ang JPG o PNG.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!bitmap) return;
    setBusy(true);
    setError(null);
    try {
      const crop =
        box && box !== WHOLE
          ? {
              x: Math.round(box.x * bitmap.width),
              y: Math.round(box.y * bitmap.height),
              width: Math.max(1, Math.round(box.width * bitmap.width)),
              height: Math.max(1, Math.round(box.height * bitmap.height)),
            }
          : null;
      const photo = await processPhoto(bitmap, crop);
      setBitmap(null);
      setBox(null);
      onPhoto(photo);
    } catch {
      setError("Hindi naihanda ang photo. Subukan ulit.");
    } finally {
      setBusy(false);
    }
  }

  function pointAt(e: React.PointerEvent<HTMLElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: pointAt(e), before: box };
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const start = drag.current?.start;
    if (!start) return;
    const p = pointAt(e);
    setBox({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    });
  }

  function onPointerUp() {
    const before = drag.current?.before ?? WHOLE;
    drag.current = null;
    setBox((b) => (b && b.width > MIN_BOX_FRACTION && b.height > MIN_BOX_FRACTION ? b : before));
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={source === "camera" ? "environment" : undefined}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = ""; // allow picking the same file again
        }}
      />

      {bitmap && (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            I-drag sa photo para piliin lang ang resibo o bouquet.
          </p>
          <div
            className="relative touch-none overflow-hidden rounded-xl select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={previewRef} className="block h-auto w-full" />
            {box && (
              <div
                className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={finish}>
              Gamitin ang photo
            </Button>
            <Button variant="secondary" disabled={busy || box === WHOLE} onClick={() => setBox(WHOLE)}>
              Buong photo
            </Button>
          </div>
        </>
      )}

      <Button
        variant={bitmap ? "secondary" : "primary"}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {bitmap ? "Ibang photo" : label}
      </Button>

      <p role="status" className="text-sm">
        {busy && "Inihahanda ang photo…"}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
