import { z } from "zod";
import { requirePermission } from "../../../lib/auth-server";
import { ensureHrDatabase, getHrState } from "../../../lib/hr";
import { payrollWorkbookBuffer } from "../../../lib/hr-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const monthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const authError = await requirePermission(request, "attendance");
    if (authError) return authError;

    const url = new URL(request.url);
    const parsedMonth = monthValue.safeParse(url.searchParams.get("month") || currentMonth());
    if (!parsedMonth.success) return Response.json({ error: "Invalid payroll month." }, { status: 400 });

    await ensureHrDatabase();
    const state = await getHrState(parsedMonth.data);
    const buffer = await payrollWorkbookBuffer(state);
    const fileName = `FMG-payroll-attendance-${parsedMonth.data}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate the payroll workbook.";
    return Response.json({ error: message }, { status: 500 });
  }
}
