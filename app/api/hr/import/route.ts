import {adjacentDate,normalizeBiometricDay,type BiometricDay} from "../../../lib/biometric-days";
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
  days: BiometricDay[];
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
      return {date,punches};
    }).filter((day): day is {date:string;punches:string[]} => Boolean(day));
    const raw = new Map(days.map(day=>[day.date,day.punches]));
    const normalized = days.map(day=>normalizeBiometricDay(day.date,day.punches,raw.get(adjacentDate(day.date,1)) || []));

    employees.push({ biometricCode, name, department, days:normalized });
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
        ? await database.prepare("SELECT id, biometric_code AS biometricCode, hire_date AS hireDate FROM employees WHERE biometric_code = ?").bind(parsedEmployee.biometricCode).first<{ id: number; biometricCode: string; hireDate: string }>()
        : null;
      if (!employee) {
        employee = await database.prepare("SELECT id, biometric_code AS biometricCode, hire_date AS hireDate FROM employees WHERE lower(trim(name)) = lower(trim(?)) ORDER BY active DESC LIMIT 1").bind(parsedEmployee.name).first<{ id: number; biometricCode: string; hireDate: string }>();
      }
      if (!employee) {
        const inserted = await database.prepare(`INSERT INTO employees (biometric_code, name, department)
          VALUES (?, ?, ?)`).bind(parsedEmployee.biometricCode, parsedEmployee.name, parsedEmployee.department).run();
        employee = { id: Number(inserted.meta.last_row_id ?? 0), biometricCode: parsedEmployee.biometricCode, hireDate: "" };
        createdEmployees += 1;
      } else if (parsedEmployee.biometricCode && !employee.biometricCode) {
        await database.prepare("UPDATE employees SET biometric_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(parsedEmployee.biometricCode, employee.id).run();
      }

      const previousDate=adjacentDate(parsed.periodStart,-1),nextDate=adjacentDate(parsed.periodEnd,1);
      const stored=await database.prepare("SELECT work_date,raw_punches_json,punches_json,first_in,last_out,last_out_next_day FROM attendance_records WHERE employee_id=? AND work_date IN (?,?)").bind(employee.id,previousDate,nextDate).all();
      const raw=new Map(parsedEmployee.days.map(day=>[day.date,day.rawPunches]));
      for(const row of stored.results) {
        let punches=JSON.parse(String(row.raw_punches_json ?? row.punches_json)).filter((p:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(p));
        if(row.raw_punches_json===null && !punches.length) punches=[row.first_in,...(row.last_out_next_day?[]:[row.last_out])].filter(Boolean);
        raw.set(String(row.work_date),punches);
      }
      const targets=[...parsedEmployee.days.map(day=>day.date)];
      if(stored.results.some(row=>row.work_date===previousDate && row.last_out_next_day) || (raw.get(parsed.periodStart)||[]).some(p=>p<="06:00")) targets.unshift(previousDate);
      for (const date of targets) {
        const day=normalizeBiometricDay(date,raw.get(date)||[],raw.get(adjacentDate(date,1))||[]);
        if (employee.hireDate && day.date < employee.hireDate) continue;
        attendanceStatements.push(database.prepare(`INSERT INTO attendance_records
          (import_id, employee_id, work_date, first_in, last_out, punches_json, status, last_out_next_day, raw_punches_json, overtime_approved, early_overtime_approved)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
          ON CONFLICT(employee_id, work_date) DO UPDATE SET manual_seed=0,
            import_id = excluded.import_id,
            first_in = excluded.first_in,
            last_out = excluded.last_out,
            last_out_next_day = excluded.last_out_next_day,
            raw_punches_json = excluded.raw_punches_json,
            punches_json = excluded.punches_json,
            status = CASE WHEN attendance_records.status IN ('vacation','occasional_leave','resort_leave','sick_leave','urgent_leave','normal_leave','assignment')
              THEN attendance_records.status ELSE excluded.status END,
            updated_at = CURRENT_TIMESTAMP`).bind(
              importId, employee.id, day.date, day.firstIn, day.lastOut, JSON.stringify(day.punches), day.status, day.lastOutNextDay?1:0, JSON.stringify(day.rawPunches),
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
