import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tangkay",
    short_name: "Tangkay",
    description: "Sagot agad sa \"hm po?\": quotes for small florists.",
    lang: "fil",
    start_url: "/quotes/new",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#166534",
    // The logo at 76% on its own sage background, so Android's maskable crop (centre 80%) keeps it whole.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
