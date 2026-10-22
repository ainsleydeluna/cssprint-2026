"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoPicker } from "@/components/receipt/PhotoPicker";

type Result = { url: string; kb: number; width?: number; height?: number };

export default function ScanReceiptPage() {
  const [result, setResult] = useState<Result | null>(null);
  const urlRef = useRef<string | null>(null);

  // Free the preview URL when leaving the page.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  function handlePhoto(photo: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(photo);
    setResult({ url: urlRef.current, kb: Math.round(photo.size / 1024) });
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">I-scan ang resibo</h1>
      <PhotoPicker source="camera" label="Kunan ang resibo" onPhoto={handlePhoto} />

      {/* Try-out preview until the receipt reader is built. */}
      {result && (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, next/image can't optimize it */}
          <img
            src={result.url}
            alt="Na-crop na resibo"
            className="h-auto w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
            onLoad={(e) => {
              // Read now: React clears e.currentTarget before the updater below runs.
              const { naturalWidth: width, naturalHeight: height, src } = e.currentTarget;
              setResult((r) => (r && r.url === src ? { ...r, width, height } : r));
            }}
          />
          <figcaption className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="result-info">
            {result.width ? `${result.width} × ${result.height} px · ` : ""}
            {result.kb} KB · JPEG
          </figcaption>
        </figure>
      )}
    </section>
  );
}
