import { ImageResponse } from "next/og";

// Placeholder icon until the real logo lands. Served at /icon/192 and /icon/512.
const SIZES = [192, 512];

export function generateImageMetadata() {
  return SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id);
  return new ImageResponse(
    (
      // Full-bleed background with the letter inside the maskable safe zone (center 80%).
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#166534",
          color: "#ffffff",
          fontSize: px * 0.5,
          fontWeight: 700,
        }}
      >
        T
      </div>
    ),
    { width: px, height: px },
  );
}
