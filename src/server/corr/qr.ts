// The QR code printed on issued letters: it opens the public verification page for the letter's code.
export async function qrDataUrl(origin: string, code: string) {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(`${origin}/verify/${code}`, { errorCorrectionLevel: "M", margin: 1, width: 240 });
}
