"use client";

// A scanned signature or stamp: white and near-white made see-through, kept as PNG.
export async function clearWhite(src: string): Promise<string> {
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => ((img.onload = () => ok()), (img.onerror = () => bad(new Error("img"))), (img.src = src)));
    const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const data = ctx.getImageData(0, 0, cv.width, cv.height);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      const lum = 0.299 * p[i]! + 0.587 * p[i + 1]! + 0.114 * p[i + 2]!;
      if (lum > 235) p[i + 3] = 0;
      else if (lum > 200) p[i + 3] = Math.round(((235 - lum) / 35) * p[i + 3]!);
    }
    ctx.putImageData(data, 0, 0);
    return cv.toDataURL("image/png");
  } catch {
    return src;
  }
}
