// No "use client" here: onPhoto is a function, so the picker must be rendered
// from a Client Component (like the scan page), which makes it client code too.
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/strings";
import { Button } from "./kit";
import { type CropRect, decodePreview, processPhoto, readSize, type Size } from "./process-photo";

// The on-screen preview only needs to be sharp, not full size.
const PREVIEW_LONG_EDGE_PX = 1600;
// A drag smaller than this share of the photo counts as a tap, not a box.
const MIN_BOX_FRACTION = 0.03;

type Source = "camera" | "gallery";

type Props = {
  onPhoto: (photo: File) => void;
  /**
   * "camera" opens the back camera on phones; "gallery" lets the user pick an existing photo;
   * "both" shows a button for each.
   */
  source?: Source | "both";
  /** Button text when there is one source. */
  label?: string;
};

type Point = { x: number; y: number };

// Spec decision 26: the crop screen opens with the whole photo selected, so one tap accepts it.
const WHOLE: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export function PhotoPicker({ onPhoto, source = "camera", label }: Props) {
  const sources: Source[] = source === "both" ? ["camera", "gallery"] : [source];
  const inputs = useRef<Partial<Record<Source, HTMLInputElement | null>>>({});
  const previewRef = useRef<HTMLCanvasElement>(null);
  // Where the current drag started, and the box before it (restored if the drag was just a tap).
  const drag = useRef<{ start: Point; before: CropRect | null } | null>(null);
  // The picked file and its upright size; the full-size image is never decoded.
  const [photo, setPhoto] = useState<{ file: File; size: Size } | null>(null);
  // Preview-size decode, at most PREVIEW_LONG_EDGE_PX on its long edge.
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  // Crop box as fractions (0–1) of the photo, so it survives layout changes.
  const [box, setBox] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draw the decoded photo into the preview canvas; free its memory when replaced.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!bitmap || !canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    return () => bitmap.close();
  }, [bitmap]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const size = await readSize(file);
      setBitmap(await decodePreview(file, size, PREVIEW_LONG_EDGE_PX));
      setPhoto({ file, size });
      setBox(WHOLE);
    } catch (e) {
      console.error("Photo could not be decoded", e);
      setError(t("photo", "unreadable"));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const processed = await processPhoto(photo.file, photo.size, box && box !== WHOLE ? box : null);
      setBitmap(null);
      setPhoto(null);
      setBox(null);
      onPhoto(processed);
    } catch (e) {
      console.error("Photo could not be prepared", e);
      setError(t("photo", "failed"));
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
      {sources.map((s) => (
        <input
          key={s}
          ref={(el) => {
            inputs.current[s] = el;
          }}
          type="file"
          accept="image/*"
          capture={s === "camera" ? "environment" : undefined}
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      ))}

      {bitmap && (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("photo", "dragHint")}
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
              {t("photo", "use")}
            </Button>
            <Button variant="secondary" disabled={busy || box === WHOLE} onClick={() => setBox(WHOLE)}>
              {t("photo", "whole")}
            </Button>
          </div>
        </>
      )}

      {sources.map((s, i) => (
        <Button
          key={s}
          variant={bitmap || i > 0 ? "secondary" : "primary"}
          disabled={busy}
          onClick={() => inputs.current[s]?.click()}
        >
          {sources.length > 1 ? t("photo", s) : bitmap ? t("photo", "another") : (label ?? t("photo", "take"))}
        </Button>
      ))}

      <p role="status" className="text-sm">
        {busy && t("photo", "preparing")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
