import { getViewer } from "@/server/auth";

// Blank templates for the two tracker files, with example rows to copy: the Uploading team's video tracker CSV and the
// Recording team's curriculum tracker JSON (the Legacy catalog's backup format).
const CSV = [
  ["row", "title", "grade", "subject", "unit", "part", "status", "owner", "notes", "duplicate", "updated"],
  ["1", "Grade 9 Biology Unit 1 Part 1 What is biology", "9", "Biology", "1", "1", "Verified", "Abel", "Live on YouTube", "", "2026-11-01"],
  ["2", "Grade 9 Biology Unit 1 Part 2 The scientific method", "9", "Biology", "1", "2", "Completed", "Abel", "Uploaded, waiting for publication", "", "2026-11-02"],
  ["3", "Grade 9 Biology Unit 1 Part 3 Tools of a biologist", "9", "Biology", "1", "3", "Not Started", "Abel", "Edited file received", "", "2026-11-03"],
  ["4", "Grade 9 Biology Unit 1 Part 4 Safety in the lab", "9", "Biology", "1", "4", "Missing", "", "Edited file not received yet", "", ""],
];

const JSON_TEMPLATE = {
  "grade-9": {
    name: "Grade 9",
    type: "Secondary School",
    subjects: [
      {
        id: "g9-bio",
        name: "Biology",
        units: [
          {
            id: "g9-bio-u1",
            title: "Unit 1: Introduction to Biology",
            parts: [
              { id: "g9-bio-u1-p1", title: "Part 1: What is biology?", videos: [{ id: "g9-bio-u1-p1-v1", cameraCode: "C0001", title: "What is biology?", description: "Studio 1. Presenter: Ato Kebede" }] },
              { id: "g9-bio-u1-p2", title: "Part 2: The scientific method", videos: [{ id: "g9-bio-u1-p2-v1", cameraCode: "C0002 & C0003", title: "The scientific method", description: "One video cut in two" }] },
              { id: "g9-bio-u1-p3", title: "Part 3: Tools of a biologist", videos: [] },
            ],
          },
        ],
      },
    ],
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await getViewer())) return new Response("Sign in required", { status: 401 });
  const { kind } = await params;
  if (kind === "video-tracker")
    return new Response(`﻿${CSV.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n")}\r\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="video-tracker-template.csv"' },
    });
  if (kind === "curriculum-tracker")
    return new Response(JSON.stringify(JSON_TEMPLATE, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="curriculum-tracker-template.json"' },
    });
  return new Response("Not found", { status: 404 });
}
