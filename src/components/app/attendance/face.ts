"use client";

// Face reading in the browser (kiosk and HR enrolment). The models are served by the app itself (public/models/face),
// so no face ever goes to an outside service. A face becomes a face code of 128 numbers; pictures are never kept.

type FaceApi = typeof import("@vladmandic/face-api");
let loading: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  loading ??= (async () => {
    const f = await import("@vladmandic/face-api");
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri("/models/face"), f.nets.faceLandmark68Net.loadFromUri("/models/face"), f.nets.faceRecognitionNet.loadFromUri("/models/face")]);
    return f;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

type Point = { x: number; y: number };
const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Eye openness (eye aspect ratio): about 0.3 open, under 0.2 closed.
function eyeOpen(p: Point[]) {
  const ear = (i: number) => (d(p[i + 1]!, p[i + 5]!) + d(p[i + 2]!, p[i + 4]!)) / (2 * d(p[i]!, p[i + 3]!));
  return (ear(36) + ear(42)) / 2;
}

export type FaceRead = { code: number[]; eyes: number; size: number; centered: boolean };

// One face in view: its code, how open the eyes are, and how big and centred it is. Null with no face or several.
export async function readFace(f: FaceApi, video: HTMLVideoElement): Promise<FaceRead | null> {
  const all = await f.detectAllFaces(video, new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptors();
  if (all.length !== 1) return null;
  const r = all[0]!;
  const box = r.detection.box;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  return {
    code: Array.from(r.descriptor),
    eyes: eyeOpen(r.landmarks.positions),
    size: box.width / w,
    centered: Math.abs(box.x + box.width / 2 - w / 2) < w * 0.2 && Math.abs(box.y + box.height / 2 - h / 2) < h * 0.25,
  };
}

// Liveness: the eyes close and open again (a blink) while the face stays in view; a photo cannot blink.
export function blinkWatcher() {
  let wasOpen = false;
  let closed = false;
  return (eyes: number) => {
    if (eyes > 0.26) {
      if (closed && wasOpen) return true;
      wasOpen = true;
    } else if (eyes < 0.2 && wasOpen) closed = true;
    return false;
  };
}
