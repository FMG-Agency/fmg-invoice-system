import ExcelJS from "exceljs";
import { requirePermission } from "../../../lib/auth-server";
import { database } from "../../../lib/database";
import { ensureHrDatabase, getHrState } from "../../../lib/hr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParsedEmployee = {
  biometricCode: string;
  name: string;
  department: string;
  days: Array<{ date: string; punches: string[]; firstIn: string; lastOut: string; status: "present" | "incomplete" | "absent" | "friday" }>;
};

function cellText(row: ExcelJS.Row, column: number) {
  try {
    return row.getCell(column).text.trim();
  } catch {
    return "";
  }
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parsePunches(value: string) {
  return (value.match(/(?:[01]\d|2[0-3]):[0-5]\d/g) ?? []).sort((left, right) => timeMinutes(left) - timeMinutes(right));
}

function isFriday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay() === 5;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWorksheet(worksheet: ExcelJS.Worksheet) {
  let periodStart = "";
  let periodEnd = "";
  let dayRowNumber = 0;
  const dayColumns = new Map<number, number>();

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowText = Array.from({ length: Math.max(worksheet.columnCount, row.cellCount) }, (_, index) => cellText(row, index + 1)).join(" ");
    const period = /(20\d{2}-\d{2}-\d{2})\s*[~–-]\s*(20\d{2}-\d{2}-\d{2})/.exec(rowText);
    if (period) [periodStart, periodEnd] = [period[1], period[2]];

    const firstTen = Array.from({ length: 10 }, (_, index) => Number(cellText(row, index + 1)));
    if (!dayRowNumber && firstTen.every((value, index) => value === index + 1)) {
      dayRowNumber = rowNumber;
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        const day = Number(cellText(row, column));
        if (Number.isInteger(day) && day >= 1 && day <= 31) dayColumns.set(column, day);
      }
    }
  }

  if (!periodStart || !periodEnd || !dayRowNumber || !dayColumns.size) {
    throw new Error("The workbook does not match the FMG biometric Attendance Record Report format.");
  }

  const year = Number(periodStart.slice(0, 4));
  const month = Number(periodStart.slice(5, 7));
  const employees: ParsedEmployee[] = [];

  for (let rowNumber = dayRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const header = worksheet.getRow(rowNumber);
    if (!/^ID\s*:?$/i.test(cellText(header, 1))) continue;

    let biometricCode = "";
    for (let column = 2; column <= Math.min(8, worksheet.columnCount); column += 1) {
      const value = cellText(header, column);
      if (value) { biometricCode = value; break; }
    }

    let name = "";
    let department = "";
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      if (/^Name\s*:?$/i.test(cellText(header, column))) {
        for (let valueColumn = column + 1; valueColumn <= worksheet.columnCount; valueColumn += 1) {
          const value = cellText(header, valueColumn);
          if (value) { name = value; break; }
        }
      }
      if (/^Dept\.?\s*:?$/i.test(cellText(header, column))) {
        for (let valueColumn = column + 1; valueColumn <= worksheet.columnCount; valueColumn += 1) {
          const value = cellText(header, valueColumn);
          if (value) { department = value; break; }
        }
      }
    }
    if (!name) continue;

    const dataRows: ExcelJS.Row[] = [];
    for (let nextRow = rowNumber + 1; nextRow <= worksheet.rowCount; nextRow += 1) {
      const candidate = worksheet.getRow(nextRow);
      if (/^ID\s*:?$/i.test(cellText(candidate, 1))) break;
      dataRows.push(candidate);
    }

    const days = Array.from(dayColumns.entries()).map(([column, day]) => {
      const date = isoDate(year, month, day);
      if (!date || date < periodStart || date > periodEnd) return null;
      const punches = dataRows.flatMap((row) => parsePunches(cellText(row, column))).sort((left, right) => timeMinutes(left) - timeMinutes(right));
      const distinctPunches = punches.filter((punch, index) => punch !== punches[index - 1]);
      let firstIn = "";
      let lastOut = "";
      if (distinctPunches.length >= 2) {
        const earliest = distinctPunches[0];
        const latest = distinctPunches[distinctPunches.length - 1];
        if (timeMinutes(earliest) <= 14 * 60 && timeMinutes(latest) > 14 * 60) {
          firstIn = earliest;
          lastOut = latest;
        } else if (timeMinutes(latest) <= 14 * 60) {
          firstIn = earliest;
        } else {
          lastOut = latest;
        }
      } else if (distinctPunches.length === 1) {
        if (timeMinutes(distinctPunches[0]) <= 14 * 60) firstIn = distinctPunches[0]; else lastOut = distinctPunches[0];
      }
      const status = distinctPunches.length === 0 ? (isFriday(date) ? "friday" : "absent") : firstIn && lastOut ? "present" : "incomplete";
      return { date, punches, firstIn, lastOut, status };
    }).filter((day): day is ParsedEmployee["days"][number] => Boolean(day));

    employees.push({ biometricCode, name, department, days });
  }

  if (!employees.length) throw new Error("No employee attendance rows were found in this workbook.");
  return { periodStart, periodEnd, employees };
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not import this attendance workbook.";
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const authError = await requirePermission(request, "attendance");
    if (authError) return authError;
    await ensureHrDatabase();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose an .xlsx attendance file first.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only Excel .xlsx attendance files are supported.");
    if (file.size > 10 * 1024 * 1024) throw new Error("The attendance file must be smaller than 10 MB.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const parsed = parseWorksheet(workbook.worksheets[0]);

    const insertImport = await database.prepare(`INSERT INTO attendance_imports
      (file_name, period_start, period_end, employee_count, record_count, created_employees)
      VALUES (?, ?, ?, ?, 0, 0)`).bind(file.name, parsed.periodStart, parsed.periodEnd, parsed.employees.length).run();
    const importId = Number(insertImport.meta.last_row_id ?? 0);
    let createdEmployees = 0;
    let recordCount = 0;
    const attendanceStatements = [];

    for (const parsedEmployee of parsed.employees) {
      let employee = parsedEmployee.biometricCode
        ? await database.prepare("SELECT id, biometric_code AS biometricCode FROM employees WHERE biometric_code = ?").bind(parsedEmployee.biometricCode).first<{ id: number; biometricCode: string }>()
        : null;
      if (!employee) {
        employee = await database.prepare("SELECT id, biometric_code AS biometricCode FROM employees WHERE lower(trim(name)) = lower(trim(?)) ORDER BY active DESC LIMIT 1").bind(parsedEmployee.name).first<{ id: number; biometricCode: string }>();
      }
      if (!employee) {
        const inserted = await database.prepare(`INSERT INTO employees (biometric_code, name, department)
          VALUES (?, ?, ?)`).bind(parsedEmployee.biometricCode, parsedEmployee.name, parsedEmployee.department).run();
        employee = { id: Number(inserted.meta.last_row_id ?? 0), biometricCode: parsedEmployee.biometricCode };
        createdEmployees += 1;
      } else if (parsedEmployee.biometricCode && !employee.biometricCode) {
        await database.prepare("UPDATE employees SET biometric_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(parsedEmployee.biometricCode, employee.id).run();
      }

      for (const day of parsedEmployee.days) {
        attendanceStatements.push(database.prepare(`INSERT INTO attendance_records
          (import_id, employee_id, work_date, first_in, last_out, punches_json, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(employee_id, work_date) DO UPDATE SET
            import_id = excluded.import_id,
            first_in = excluded.first_in,
            last_out = excluded.last_out,
            punches_json = excluded.punches_json,
            status = CASE WHEN attendance_records.status IN ('vacation','sick_leave','urgent_leave','normal_leave','assignment')
              THEN attendance_records.status ELSE excluded.status END,
            updated_at = CURRENT_TIMESTAMP`).bind(
              importId, employee.id, day.date, day.firstIn, day.lastOut, JSON.stringify(day.punches), day.status,
            ));
        recordCount += 1;
      }
    }

    for (let index = 0; index < attendanceStatements.length; index += 75) {
      await database.batch(attendanceStatements.slice(index, index + 75));
    }
    await database.prepare(`UPDATE attendance_imports SET record_count = ?, created_employees = ? WHERE id = ?`).bind(recordCount, createdEmployees, importId).run();

    return Response.json(await getHrState(parsed.periodStart.slice(0, 7)));
  } catch (error) {
    return responseError(error);
  }
}
