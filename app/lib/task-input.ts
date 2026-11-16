import { z } from "zod";
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);
export const httpUrl = z.string().trim().url().refine((value) => {
  try { const protocol = new URL(value).protocol; return protocol === "http:" || protocol === "https:"; } catch { return false; }
}, "Use an http or https link.");
const reference = z.object({
  label: z.string().trim().max(120).default(""),
  url: httpUrl,
});
export const taskData = z.object({
  title: z.string().trim().min(2).max(200),
  details: z.string().trim().min(3).max(10_000),
  brief: z.string().trim().max(10_000).default(""),
  notes: z.string().trim().max(10_000).default(""),
  gridNotes: z.string().trim().max(10_000).default(""),
  references: z.array(reference).max(20).default([]),
  startAt: localDateTime,
  deadlineAt: localDateTime,
  assignedUserId: z.number().int().positive(),
  assignments: z.array(z.object({userId:z.number().int().positive(),part:z.string().trim().max(300)})).max(50).default([]),
  additionalUserIds: z.array(z.number().int().positive()).max(49).default([]),
  gridPostNotes: z.array(z.string().trim().max(2000)).max(36).default([]),
  gridCells: z.array(z.enum(["design", "carousel", "video"])).max(36).default([]),
});
