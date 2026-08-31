import ExcelJS from "exceljs";
import type { AttendanceRecord, HrState, PayrollSummary } from "../types";

const COLORS = {
  ink: "FF111111",
  yellow: "FFFFDD00",
  yellowSoft: "FFFFF6B8",
  white: "FFFFFFFF",
  panel: "FFF5F5F5",
  line: "FFD9D9D9",
  green: "FF138A5B",
  greenSoft: "FFE8F6EF",
  red: "FFC73A3A",
  redSoft: "FFFCEAEA",
  muted: "FF666666",
};

const STATUS_LABELS: Record<AttendanceRecord["status"], string> = {
  present: "Present",
  incomplete: "Incomplete",
  absent: "Absent",
  friday: "Friday work",
  vacation: "Vacation",
  occasional_leave: "Religious / occasional holiday",
  resort_leave: "Resort leave",
  sick_leave: "Sick leave",
  urgent_leave: "Urgent leave",
  normal_leave: "Normal leave",
  assignment: "Assignment",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: COLORS.line } },
};

const denseTableBorder: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: COLORS.line } },
  right: { style: "thin", color: { argb: COLORS.line } },
};

function safeCurrency(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "EGP";
}

function moneyFormat(currency: string) {
  return `#,##0.00 \"${safeCurrency(currency)}\";[Red](#,##0.00) \"${safeCurrency(currency)}\";0.00 \"${safeCurrency(currency)}\"`;
}

function formula(formulaValue: string, result: number | string): ExcelJS.CellFormulaValue {
  return { formula: formulaValue, result };
}

function quoteSheetName(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uniqueSheetName(name: string, used: Set<string>) {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Employee";
  let candidate = cleaned.slice(0, 31);
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const ending = ` (${suffix})`;
    candidate = `${cleaned.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function generatedAt() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function dayLabel(workDate: string) {
  const day = new Date(`${workDate}T12:00:00Z`).getUTCDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "N/A";
}

function dateValue(workDate: string) {
  const value = new Date(`${workDate}T12:00:00Z`);
  return Number.isNaN(value.getTime()) ? workDate : value;
}

function meaningfulText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, lastColumn: string) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  titleCell.font = { name: "Aptos Display", size: 20, bold: true, color: { argb: COLORS.white } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 38;

  sheet.mergeCells(`A2:${lastColumn}2`);
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellow } };
  subtitleCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.ink } };
  subtitleCell.alignment = { vertical: "middle" };
  sheet.getRow(2).height = 23;
}

function styleSection(sheet: ExcelJS.Worksheet, range: string, label: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = label;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } };
  cell.alignment = { vertical: "middle" };
}

function styleHeader(row: ExcelJS.Row, start: number, end: number) {
  row.height = 34;
  for (let index = start; index <= end; index += 1) {
    const cell = row.getCell(index);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellow } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.ink } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.ink } },
      bottom: { style: "thin", color: { argb: COLORS.ink } },
    };
  }
}

function styleDataRow(row: ExcelJS.Row, start: number, end: number) {
  row.height = 21;
  for (let index = start; index <= end; index += 1) {
    const cell = row.getCell(index);
    cell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
    cell.alignment = { vertical: "middle", wrapText: index === 5 || index === 6 || index === 8 || index >= 12 };
    cell.border = thinBorder;
  }
}

function styleTotalRow(row: ExcelJS.Row, start: number, end: number) {
  row.height = 23;
  for (let index = start; index <= end; index += 1) {
    const cell = row.getCell(index);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.alignment = { vertical: "middle" };
  }
}

function setSummaryWidths(sheet: ExcelJS.Worksheet) {
  const widths = [22, 22, 18, 14, 16, 18, 17, 15, 14, 19, 16, 17, 17, 17, 18, 14, 14, 16, 13, 14, 16, 17, 16, 16, 16, 19, 19, 18];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function setEmployeeWidths(sheet: ExcelJS.Worksheet) {
  const widths = [20, 17, 13, 13, 28, 16, 15, 21, 18, 18, 23, 18, 25, 18, 22];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

type EmployeeSheetResult = {
  payroll: PayrollSummary;
  sheetName: string;
};


function addCompactEmployeeSheet(workbook: ExcelJS.Workbook, state: HrState, payroll: PayrollSummary, sheetName: string): EmployeeSheetResult {
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 19 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddHeader: "&LFMG Agency&CEmployee payroll statement&R&P / &N", oddFooter: `&L${state.month}&CConfidential&R${safeCurrency(state.policy.currency)}` },
  });
  setEmployeeWidths(sheet);

  const employee = state.employees.find((item) => item.id === payroll.employeeId);
  const attendance = state.attendance
    .filter((record) => record.employeeId === payroll.employeeId)
    .sort((left, right) => left.workDate.localeCompare(right.workDate));
  const adjustments = state.adjustments
    .filter((adjustment) => adjustment.employeeId === payroll.employeeId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const attendanceRows = Math.max(1, attendance.length);
  const adjustmentStart = 10;
  const adjustmentEnd = adjustmentStart + Math.max(1, adjustments.length) - 1;
  const timeSectionRow = Math.max(24, adjustmentEnd + 3);
  const timeHeaderRow = timeSectionRow + 1;
  const timeStart = timeHeaderRow + 1;
  const timeEnd = timeStart + attendanceRows - 1;
  const timeTotalRow = timeEnd + 1;
  const impactSectionRow = timeTotalRow + 3;
  const impactHeaderRow = impactSectionRow + 1;
  const impactStart = impactHeaderRow + 1;
  const impactEnd = impactStart + attendanceRows - 1;
  const impactTotalRow = impactEnd + 1;
  const currencyFormat = moneyFormat(state.policy.currency);

  styleTitle(sheet, `FMG EMPLOYEE PAYROLL | ${payroll.employeeName}`, `Payroll month: ${state.month}  |  Currency: ${safeCurrency(state.policy.currency)}  |  Salary statement and attendance detail`, "O");
  sheet.views = [{ activeCell: `A${timeStart}`, showGridLines: false }];

  const identity = [
    ["Employee", meaningfulText(payroll.employeeName, "Employee name not set")],
    ["Job title", meaningfulText(payroll.title, "Title not set")],
    ["Department", meaningfulText(employee?.department, "Department not set")],
    ["Biometric ID", meaningfulText(employee?.biometricCode, "Biometric ID not set")],
    ["Email", meaningfulText(employee?.email, "Email not provided")],
    ["Phone", meaningfulText(employee?.phone, "Phone not provided")],
    ["Hire date", meaningfulText(employee?.hireDate, "Hire date not provided")],
    ["Status", employee ? (employee.active ? "Active" : "Inactive") : "Status not available"],
  ];
  const identityStarts = [1, 4, 7, 10];
  identity.forEach(([label, value], index) => {
    const rowNumber = index < 4 ? 4 : 5;
    const start = identityStarts[index % 4];
    sheet.mergeCells(rowNumber, start + 1, rowNumber, start + 2);
    const labelCell = sheet.getRow(rowNumber).getCell(start);
    const valueCell = sheet.getRow(rowNumber).getCell(start + 1);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.ink } };
    valueCell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
    labelCell.fill = valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.panel } };
    labelCell.border = valueCell.border = thinBorder;
    labelCell.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
    valueCell.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
  });
  sheet.getRow(4).height = 24;
  sheet.getRow(5).height = 24;

  sheet.mergeCells("A6:O6");
  const employeeNoteCell = sheet.getCell("A6");
  employeeNoteCell.value = `Employee notes: ${meaningfulText(employee?.notes, "No employee notes recorded.")}`;
  employeeNoteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellowSoft } };
  employeeNoteCell.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.ink } };
  employeeNoteCell.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(6).height = 22;

  const profileIssues: string[] = [];
  if (payroll.baseSalary <= 0) profileIssues.push(`base salary is 0.00 ${safeCurrency(state.policy.currency)}`);
  if (!payroll.title?.trim()) profileIssues.push("job title is missing");
  if (!employee?.department?.trim()) profileIssues.push("department is missing");
  if (!employee?.biometricCode?.trim()) profileIssues.push("biometric ID is missing");
  if (!employee?.email?.trim()) profileIssues.push("email is missing");
  if (!employee?.phone?.trim()) profileIssues.push("phone is missing");
  if (!employee?.hireDate?.trim()) profileIssues.push("hire date is missing");
  sheet.mergeCells("A7:O7");
  const profileCell = sheet.getCell("A7");
  profileCell.value = profileIssues.length
    ? `DATA CHECK — Employee profile is incomplete: ${profileIssues.join("; ")}. Update Employees before relying on payroll amounts.`
    : "DATA CHECK — Employee profile is complete for payroll calculation.";
  profileCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: profileIssues.length ? COLORS.redSoft : COLORS.greenSoft } };
  profileCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: profileIssues.length ? COLORS.red : COLORS.green } };
  profileCell.alignment = { vertical: "middle", wrapText: true };
  profileCell.border = thinBorder;
  sheet.getRow(7).height = profileIssues.length ? 34 : 24;

  styleSection(sheet, "A8:B8", "PAYROLL BREAKDOWN");
  sheet.getRow(9).getCell(1).value = "Component";
  sheet.getRow(9).getCell(2).value = "Amount";
  styleHeader(sheet.getRow(9), 1, 2);
  const components = ["Base salary", "Fixed commission", "Other additions", "Overtime pay", "Friday work pay", "Total additions", "Attendance deductions", "Fixed deduction", "Other deductions", "Total deductions", "NET SALARY"];
  components.forEach((label, index) => {
    const row = sheet.getRow(10 + index);
    row.getCell(1).value = label;
    styleDataRow(row, 1, 2);
  });

  sheet.getCell("B10").value = payroll.baseSalary;
  sheet.getCell("B11").value = payroll.monthlyCommission;
  sheet.getCell("B12").value = formula(`SUMIF(G${adjustmentStart}:G${adjustmentEnd},"<>Deduction",I${adjustmentStart}:I${adjustmentEnd})`, payroll.manualAdditions);
  sheet.getCell("B13").value = formula(`SUM(E${impactStart}:E${impactEnd})`, payroll.overtimePay);
  sheet.getCell("B14").value = formula(`SUM(F${impactStart}:F${impactEnd})`, payroll.fridayPay);
  sheet.getCell("B15").value = formula("SUM(B11:B14)", payroll.monthlyCommission + payroll.manualAdditions + payroll.overtimePay + payroll.fridayPay);
  sheet.getCell("B16").value = formula(`SUM(B${impactStart}:D${impactEnd})`, payroll.attendanceDeduction);
  sheet.getCell("B17").value = payroll.monthlyDeduction;
  sheet.getCell("B18").value = formula(`SUMIF(G${adjustmentStart}:G${adjustmentEnd},"Deduction",I${adjustmentStart}:I${adjustmentEnd})`, payroll.manualDeductions);
  sheet.getCell("B19").value = formula("SUM(B16:B18)", payroll.attendanceDeduction + payroll.monthlyDeduction + payroll.manualDeductions);
  sheet.getCell("B20").value = formula("B10+B15-B19", payroll.netSalary);
  for (let row = 10; row <= 20; row += 1) sheet.getCell(`B${row}`).numFmt = currencyFormat;
  for (const row of [15, 19, 20]) {
    const fill = row === 15 ? COLORS.greenSoft : row === 19 ? COLORS.redSoft : COLORS.yellow;
    const fontColor = row === 15 ? COLORS.green : row === 19 ? COLORS.red : COLORS.ink;
    for (let column = 1; column <= 2; column += 1) {
      const cell = sheet.getRow(row).getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.font = { name: "Aptos", size: row === 20 ? 13 : 10, bold: true, color: { argb: fontColor } };
    }
  }

  styleSection(sheet, "D8:E8", "ATTENDANCE KPIs");
  sheet.getRow(9).getCell(4).value = "Metric";
  sheet.getRow(9).getCell(5).value = "Total";
  styleHeader(sheet.getRow(9), 4, 5);
  const metrics = ["Present days", "Absent days", "Incomplete days", "Late days", "Late minutes", "Early-leave days", "Unpaid-leave days", "Normal OT minutes", "Early OT minutes", "Total OT minutes", `Normal Mission Time (OT ×${state.policy.overtimeMultiplier})`, `Early Mission Time (Early OT ×${state.policy.earlyOvertimeMultiplier})`, "Total Mission Time"];
  metrics.forEach((label, index) => {
    const row = sheet.getRow(10 + index);
    row.getCell(4).value = label;
    styleDataRow(row, 4, 5);
    row.height = 30;
    row.getCell(4).alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "right" };
  });
  sheet.getCell("E10").value = formula(`COUNTIF(F${timeStart}:F${timeEnd},"Present")`, payroll.presentDays);
  sheet.getCell("E11").value = formula(`COUNTIF(F${timeStart}:F${timeEnd},"Absent")`, payroll.absentDays);
  sheet.getCell("E12").value = formula(`COUNTIF(F${timeStart}:F${timeEnd},"Incomplete")`, payroll.incompleteDays);
  sheet.getCell("E13").value = formula(`COUNTIF(G${timeStart}:G${timeEnd},">0")`, payroll.lateDays);
  sheet.getCell("E14").value = formula(`SUM(G${timeStart}:G${timeEnd})`, payroll.lateMinutes);
  sheet.getCell("E15").value = payroll.earlyLeaveDays;
  sheet.getCell("E16").value = payroll.unpaidLeaveDays;
  sheet.getCell("E17").value = formula(`SUM(J${timeStart}:J${timeEnd})`, payroll.normalOvertimeMinutes);
  sheet.getCell("E18").value = formula(`SUM(L${timeStart}:L${timeEnd})`, payroll.earlyOvertimeMinutes);
  sheet.getCell("E19").value = formula(`SUM(N${timeStart}:N${timeEnd})`, payroll.overtimeMinutes);
  sheet.getCell("E20").value = formula(`SUM(K${timeStart}:K${timeEnd})`, payroll.normalMissionMinutes);
  sheet.getCell("E21").value = formula(`SUM(M${timeStart}:M${timeEnd})`, payroll.earlyMissionMinutes);
  sheet.getCell("E22").value = formula(`SUM(O${timeStart}:O${timeEnd})`, payroll.totalMissionMinutes);
  for (let row = 10; row <= 22; row += 1) sheet.getCell(`E${row}`).numFmt = "#,##0;[Red](#,##0);0";
  for (let row = 20; row <= 22; row += 1) sheet.getCell(`E${row}`).numFmt = "#,##0.0;[Red](#,##0.0);0.0";

  styleSection(sheet, "G8:J8", "MONTHLY ADJUSTMENTS");
  ["Type", "Label", "Amount", "Notes"].forEach((label, index) => { sheet.getRow(9).getCell(7 + index).value = label; });
  styleHeader(sheet.getRow(9), 7, 10);
  if (adjustments.length) {
    adjustments.forEach((adjustment, index) => {
      const row = sheet.getRow(adjustmentStart + index);
      row.getCell(7).value = adjustment.type === "deduction" ? "Deduction" : adjustment.type[0].toUpperCase() + adjustment.type.slice(1);
      row.getCell(8).value = meaningfulText(adjustment.label, "Adjustment label not provided");
      row.getCell(9).value = adjustment.amount;
      row.getCell(10).value = meaningfulText(adjustment.notes, "No adjustment note");
      styleDataRow(row, 7, 10);
      for (let column = 7; column <= 10; column += 1) row.getCell(column).border = denseTableBorder;
      row.getCell(9).numFmt = currencyFormat;
      row.getCell(9).alignment = { vertical: "middle", horizontal: "right" };
      row.getCell(10).alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
      row.height = 30;
    });
  } else {
    const row = sheet.getRow(adjustmentStart);
    row.getCell(7).value = "No adjustment";
    row.getCell(8).value = "No monthly adjustments";
    row.getCell(9).value = 0;
    row.getCell(10).value = "Nothing recorded for this month";
    styleDataRow(row, 7, 10);
    for (let column = 7; column <= 10; column += 1) row.getCell(column).border = denseTableBorder;
    row.getCell(9).numFmt = currencyFormat;
    row.getCell(9).alignment = { vertical: "middle", horizontal: "right" };
    row.getCell(10).alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
    row.height = 30;
  }

  styleSection(sheet, `A${timeSectionRow}:O${timeSectionRow}`, "DAILY ATTENDANCE & TIME DETAIL");
  const timeHeaders = ["Date", "Day", "First in", "Last out", "All punches", "Status", "Late Time (min)", `Penalty Time (min)\nLate Time ×${state.policy.minutePenaltyMultiplier}`, "Early Leave Time (min)", "Normal OT Time (min)", `Normal Mission Time (min)\nNormal OT ×${state.policy.overtimeMultiplier}`, "Early OT Time (min)", `Early Mission Time (min)\nEarly OT ×${state.policy.earlyOvertimeMultiplier}`, "Total OT Time (min)", "Total Mission Time (min)"];
  timeHeaders.forEach((label, index) => { sheet.getRow(timeHeaderRow).getCell(index + 1).value = label; });
  styleHeader(sheet.getRow(timeHeaderRow), 1, 15);
  sheet.getRow(timeHeaderRow).height = 56;

  const writeTimeRow = (row: ExcelJS.Row, record?: AttendanceRecord) => {
    const lateMinutes = record?.lateMinutes ?? 0;
    const normalOvertimeMinutes = record?.normalOvertimeMinutes ?? 0;
    const earlyOvertimeMinutes = record?.earlyOvertimeMinutes ?? 0;
    const calculatedPenaltyTime = formula(`G${row.number}*${state.policy.minutePenaltyMultiplier}`, lateMinutes * state.policy.minutePenaltyMultiplier);
    const calculatedNormalMissionTime = formula(`J${row.number}*${state.policy.overtimeMultiplier}`, record?.normalMissionMinutes ?? 0);
    const calculatedEarlyMissionTime = formula(`L${row.number}*${state.policy.earlyOvertimeMultiplier}`, record?.earlyMissionMinutes ?? 0);
    const calculatedTotalOvertime = formula(`J${row.number}+L${row.number}`, record?.overtimeMinutes ?? 0);
    const calculatedTotalMissionTime = formula(`K${row.number}+M${row.number}`, record?.totalMissionMinutes ?? 0);
    row.values = record
      ? [dateValue(record.workDate), dayLabel(record.workDate), meaningfulText(record.firstIn, "Not recorded"), meaningfulText(record.lastOut, "Not recorded"), record.punches.length ? record.punches.join(" | ") : "No punches recorded", STATUS_LABELS[record.status], lateMinutes, calculatedPenaltyTime, record.earlyLeaveMinutes, normalOvertimeMinutes, calculatedNormalMissionTime, earlyOvertimeMinutes, calculatedEarlyMissionTime, calculatedTotalOvertime, calculatedTotalMissionTime]
      : ["No attendance date", "N/A", "Not recorded", "Not recorded", "No punches recorded", "No attendance record", lateMinutes, calculatedPenaltyTime, 0, normalOvertimeMinutes, calculatedNormalMissionTime, earlyOvertimeMinutes, calculatedEarlyMissionTime, calculatedTotalOvertime, calculatedTotalMissionTime];
    styleDataRow(row, 1, 15);
    if (record) row.getCell(1).numFmt = "yyyy-mm-dd";
    for (let column = 1; column <= 15; column += 1) {
      const cell = row.getCell(column);
      cell.border = denseTableBorder;
      cell.alignment = { vertical: "middle", wrapText: column === 5, horizontal: column === 5 ? "left" : column >= 7 ? "right" : "center" };
    }
    for (let column = 7; column <= 15; column += 1) row.getCell(column).numFmt = "#,##0;[Red](#,##0);0";
    for (const column of [11, 13, 15]) row.getCell(column).numFmt = "#,##0.0;[Red](#,##0.0);0.0";
  };
  if (attendance.length) attendance.forEach((record, index) => writeTimeRow(sheet.getRow(timeStart + index), record));
  else writeTimeRow(sheet.getRow(timeStart));

  sheet.mergeCells(`A${timeTotalRow}:F${timeTotalRow}`);
  sheet.getCell(`A${timeTotalRow}`).value = "MONTH TIME TOTAL";
  const timeTotals: Array<[number, string, number]> = [
    [7, `SUM(G${timeStart}:G${timeEnd})`, payroll.lateMinutes],
    [8, `SUM(H${timeStart}:H${timeEnd})`, payroll.lateMinutes * state.policy.minutePenaltyMultiplier],
    [9, `SUM(I${timeStart}:I${timeEnd})`, attendance.reduce((sum, record) => sum + record.earlyLeaveMinutes, 0)],
    [10, `SUM(J${timeStart}:J${timeEnd})`, payroll.normalOvertimeMinutes],
    [11, `SUM(K${timeStart}:K${timeEnd})`, payroll.normalMissionMinutes],
    [12, `SUM(L${timeStart}:L${timeEnd})`, payroll.earlyOvertimeMinutes],
    [13, `SUM(M${timeStart}:M${timeEnd})`, payroll.earlyMissionMinutes],
    [14, `SUM(N${timeStart}:N${timeEnd})`, payroll.overtimeMinutes],
    [15, `SUM(O${timeStart}:O${timeEnd})`, payroll.totalMissionMinutes],
  ];
  timeTotals.forEach(([column, formulaValue, result]) => { sheet.getRow(timeTotalRow).getCell(column).value = formula(formulaValue, result); });
  styleTotalRow(sheet.getRow(timeTotalRow), 1, 15);
  for (let column = 7; column <= 15; column += 1) sheet.getRow(timeTotalRow).getCell(column).numFmt = "#,##0;[Red](#,##0);0";
  for (const column of [11, 13, 15]) sheet.getRow(timeTotalRow).getCell(column).numFmt = "#,##0.0;[Red](#,##0.0);0.0";

  styleSection(sheet, `A${impactSectionRow}:O${impactSectionRow}`, "DAILY PAYROLL IMPACT & APPROVALS");
  const impactHeaders = ["Date", "Late deduction", "Early-leave deduction", "Unpaid-leave deduction", "OT pay", "Friday pay", "Late excused", "Early leave excused", "Leave paid", "Normal OT allowed", "Early OT allowed", "Reason / manager note"];
  impactHeaders.forEach((label, index) => { sheet.getRow(impactHeaderRow).getCell(index + 1).value = label; });
  sheet.mergeCells(impactHeaderRow, 12, impactHeaderRow, 15);
  styleHeader(sheet.getRow(impactHeaderRow), 1, 15);
  sheet.getRow(impactHeaderRow).height = 42;

  const writeImpactRow = (row: ExcelJS.Row, record?: AttendanceRecord) => {
    row.values = record
      ? [dateValue(record.workDate), record.lateDeduction, record.earlyLeaveDeduction, record.leaveDeduction, record.overtimePay, record.fridayPay, record.lateExcused ? "Yes" : "No", record.earlyLeaveExcused ? "Yes" : "No", record.leavePaid ? "Yes" : "No", record.overtimeApproved ? "Yes" : "No", record.earlyOvertimeApproved ? "Yes" : "No", meaningfulText(record.notes, "No manager note")]
      : ["No attendance date", 0, 0, 0, 0, 0, "No", "No", "No", "No", "No", "No manager note - no attendance record"];
    sheet.mergeCells(row.number, 12, row.number, 15);
    styleDataRow(row, 1, 15);
    if (record) row.getCell(1).numFmt = "yyyy-mm-dd";
    for (let column = 1; column <= 15; column += 1) {
      const cell = row.getCell(column);
      cell.border = denseTableBorder;
      cell.alignment = { vertical: "middle", wrapText: column === 12, horizontal: column === 12 ? "left" : column >= 2 && column <= 6 ? "right" : "center" };
    }
    for (let column = 2; column <= 6; column += 1) row.getCell(column).numFmt = currencyFormat;
    row.height = 38;
  };
  if (attendance.length) attendance.forEach((record, index) => writeImpactRow(sheet.getRow(impactStart + index), record));
  else writeImpactRow(sheet.getRow(impactStart));

  sheet.getCell(`A${impactTotalRow}`).value = "MONTH PAYROLL TOTAL";
  const impactTotals: Array<[number, string, number]> = [
    [2, `SUM(B${impactStart}:B${impactEnd})`, payroll.lateDeduction],
    [3, `SUM(C${impactStart}:C${impactEnd})`, payroll.earlyLeaveDeduction],
    [4, `SUM(D${impactStart}:D${impactEnd})`, payroll.leaveDeduction],
    [5, `SUM(E${impactStart}:E${impactEnd})`, payroll.overtimePay],
    [6, `SUM(F${impactStart}:F${impactEnd})`, payroll.fridayPay],
  ];
  impactTotals.forEach(([column, formulaValue, result]) => { sheet.getRow(impactTotalRow).getCell(column).value = formula(formulaValue, result); });
  for (let column = 7; column <= 11; column += 1) sheet.getRow(impactTotalRow).getCell(column).value = "N/A";
  sheet.mergeCells(impactTotalRow, 12, impactTotalRow, 15);
  sheet.getRow(impactTotalRow).getCell(12).value = "N/A";
  styleTotalRow(sheet.getRow(impactTotalRow), 1, 15);
  for (let column = 2; column <= 6; column += 1) sheet.getRow(impactTotalRow).getCell(column).numFmt = currencyFormat;

  const noteRow = impactTotalRow + 2;
  sheet.mergeCells(`A${noteRow}:O${noteRow + 1}`);
  const noteCell = sheet.getCell(`A${noteRow}`);
  noteCell.value = `Policy v${state.policy.policyVersion}: only days explicitly allowed with a written reason are included in overtime; Penalty Time = Late Time ×${state.policy.minutePenaltyMultiplier}; Normal Mission Time = allowed Normal OT ×${state.policy.overtimeMultiplier}; Early Mission Time = allowed Early OT ×${state.policy.earlyOvertimeMultiplier}; Total Mission Time = Normal Mission + Early Mission; free arrival through ${state.policy.freeArrivalUntil}; on days 1–16 the ${state.policy.overtimeArrivalCutoff} arrival cutoff is waived, while from day 17 arrival must be by the cutoff; early leave ×${state.policy.earlyLeaveDayMultiplier} day; unpaid leave ×${state.policy.unpaidLeaveDayMultiplier} day; Friday counts as ${state.policy.fridayMultiplier} days; salary divisor ${state.policy.salaryDivisor}.`;
  noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellowSoft } };
  noteCell.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.ink } };
  noteCell.alignment = { wrapText: true, vertical: "middle" };
  noteCell.border = { top: { style: "thin", color: { argb: COLORS.yellow } }, bottom: { style: "thin", color: { argb: COLORS.yellow } } };
  sheet.getRow(noteRow).height = 32;
  sheet.getRow(noteRow + 1).height = 32;
  sheet.pageSetup.printArea = `A1:O${noteRow + 1}`;

  return { payroll, sheetName };
}

export async function buildPayrollWorkbook(state: HrState) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FMG Agency";
  workbook.lastModifiedBy = "FMG Invoice System";
  workbook.company = "FMG Agency";
  workbook.title = `FMG payroll and attendance ${state.month}`;
  workbook.subject = "Monthly payroll, adjustments, and biometric attendance";
  workbook.keywords = "FMG payroll attendance overtime commission deductions";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet("Payroll Summary", {
    properties: { defaultRowHeight: 19 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddHeader: "&LFMG Agency&CPayroll summary&R&P / &N", oddFooter: `&L${state.month}&CConfidential&R${safeCurrency(state.policy.currency)}` },
  });
  setSummaryWidths(summary);
  summary.views = [{ state: "frozen", ySplit: 8, xSplit: 2, activeCell: "C9", showGridLines: false }];
  styleTitle(summary, "FMG PAYROLL & ATTENDANCE", `Payroll month: ${state.month}  |  Currency: ${safeCurrency(state.policy.currency)}  |  Generated: ${generatedAt()} Cairo`, "AB");

  const usedNames = new Set(["payroll summary"]);
  const employeeSheets = state.payroll.map((payroll) => addCompactEmployeeSheet(workbook, state, payroll, uniqueSheetName(payroll.employeeName, usedNames)));
  const dataStart = 9;
  const dataRows = Math.max(1, employeeSheets.length);
  const dataEnd = dataStart + dataRows - 1;
  const totalRow = dataEnd + 1;
  const currencyFormat = moneyFormat(state.policy.currency);
  const totalNet = state.payroll.reduce((sum, record) => sum + record.netSalary, 0);
  const totalAdditions = state.payroll.reduce((sum, record) => sum + record.monthlyCommission + record.manualAdditions + record.overtimePay + record.fridayPay, 0);
  const totalDeductions = state.payroll.reduce((sum, record) => sum + record.attendanceDeduction + record.monthlyDeduction + record.manualDeductions, 0);
  const totalBase = state.payroll.reduce((sum, record) => sum + record.baseSalary, 0);

  const cards = [
    { range: "A4:D4", valueRange: "A5:D6", label: "PROJECTED NET PAYROLL", cell: `O${totalRow}`, value: totalNet, color: COLORS.ink, valueColor: COLORS.white },
    { range: "F4:I4", valueRange: "F5:I6", label: "TOTAL ADDITIONS", cell: `M${totalRow}`, value: totalAdditions, color: COLORS.greenSoft, valueColor: COLORS.green },
    { range: "K4:N4", valueRange: "K5:N6", label: "TOTAL DEDUCTIONS", cell: `N${totalRow}`, value: totalDeductions, color: COLORS.redSoft, valueColor: COLORS.red },
  ];
  cards.forEach((card, index) => {
    summary.mergeCells(card.range);
    summary.mergeCells(card.valueRange);
    const labelCell = summary.getCell(card.range.split(":")[0]);
    const valueCell = summary.getCell(card.valueRange.split(":")[0]);
    labelCell.value = card.label;
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 0 ? COLORS.yellow : card.color } };
    labelCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: index === 0 ? COLORS.ink : card.valueColor } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.value = formula(card.cell, card.value);
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 0 ? COLORS.ink : COLORS.white } };
    valueCell.font = { name: "Aptos Display", size: 17, bold: true, color: { argb: card.valueColor } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.numFmt = currencyFormat;
  });

  summary.mergeCells("P4:AB4");
  summary.mergeCells("P5:AB6");
  summary.getCell("P4").value = "EMPLOYEES IN WORKBOOK";
  summary.getCell("P5").value = employeeSheets.length;
  summary.getCell("P4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.panel } };
  summary.getCell("P5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellowSoft } };
  summary.getCell("P4").font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.muted } };
  summary.getCell("P5").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: COLORS.ink } };
  summary.getCell("P4").alignment = summary.getCell("P5").alignment = { horizontal: "center", vertical: "middle" };

  const headers = ["Employee", "Title", "Department", "Biometric ID", "Base salary", "Fixed commission", "Other additions", "Overtime pay", "Friday pay", "Attendance deduction", "Fixed deduction", "Other deductions", "Total additions", "Total deductions", "Net salary", "Present days", "Absent days", "Incomplete days", "Late days", "Late minutes", "Early-leave days", "Unpaid-leave days", "Normal OT minutes", "Early OT minutes", "Total OT minutes", `Normal Mission Time ×${state.policy.overtimeMultiplier}`, `Early Mission Time ×${state.policy.earlyOvertimeMultiplier}`, "Total Mission Time"];
  headers.forEach((header, index) => { summary.getRow(8).getCell(index + 1).value = header; });
  styleHeader(summary.getRow(8), 1, 28);

  if (employeeSheets.length) {
    employeeSheets.forEach(({ payroll, sheetName }, index) => {
      const row = summary.getRow(dataStart + index);
      const employee = state.employees.find((item) => item.id === payroll.employeeId);
      row.getCell(1).value = payroll.employeeName;
      row.getCell(2).value = payroll.title || "Title not set";
      row.getCell(3).value = employee?.department || "Department not set";
      row.getCell(4).value = meaningfulText(employee?.biometricCode, "Biometric ID not set");
      const quoted = quoteSheetName(sheetName);
      const references: Array<[number, string, number]> = [
        [5, `${quoted}!B10`, payroll.baseSalary], [6, `${quoted}!B11`, payroll.monthlyCommission], [7, `${quoted}!B12`, payroll.manualAdditions],
        [8, `${quoted}!B13`, payroll.overtimePay], [9, `${quoted}!B14`, payroll.fridayPay], [10, `${quoted}!B16`, payroll.attendanceDeduction],
        [11, `${quoted}!B17`, payroll.monthlyDeduction], [12, `${quoted}!B18`, payroll.manualDeductions],
        [13, `${quoted}!B15`, payroll.monthlyCommission + payroll.manualAdditions + payroll.overtimePay + payroll.fridayPay],
        [14, `${quoted}!B19`, payroll.attendanceDeduction + payroll.monthlyDeduction + payroll.manualDeductions], [15, `${quoted}!B20`, payroll.netSalary],
        [16, `${quoted}!E10`, payroll.presentDays], [17, `${quoted}!E11`, payroll.absentDays], [18, `${quoted}!E12`, payroll.incompleteDays],
        [19, `${quoted}!E13`, payroll.lateDays], [20, `${quoted}!E14`, payroll.lateMinutes], [21, `${quoted}!E15`, payroll.earlyLeaveDays],
        [22, `${quoted}!E16`, payroll.unpaidLeaveDays], [23, `${quoted}!E17`, payroll.normalOvertimeMinutes], [24, `${quoted}!E18`, payroll.earlyOvertimeMinutes],
        [25, `${quoted}!E19`, payroll.overtimeMinutes], [26, `${quoted}!E20`, payroll.normalMissionMinutes], [27, `${quoted}!E21`, payroll.earlyMissionMinutes], [28, `${quoted}!E22`, payroll.totalMissionMinutes],
      ];
      references.forEach(([column, formulaValue, result]) => { row.getCell(column).value = formula(formulaValue, result); });
      styleDataRow(row, 1, 28);
      for (let column = 5; column <= 15; column += 1) row.getCell(column).numFmt = currencyFormat;
      for (let column = 16; column <= 28; column += 1) row.getCell(column).numFmt = "#,##0;[Red](#,##0);0";
      for (let column = 26; column <= 28; column += 1) row.getCell(column).numFmt = "#,##0.0;[Red](#,##0.0);0.0";
    });
  } else {
    const row = summary.getRow(dataStart);
    row.getCell(1).value = "No active employees";
    row.getCell(2).value = "Title not available";
    row.getCell(3).value = "Department not available";
    row.getCell(4).value = "Biometric ID not available";
    for (let column = 5; column <= 28; column += 1) row.getCell(column).value = 0;
    styleDataRow(row, 1, 28);
  }

  summary.mergeCells(`A${totalRow}:D${totalRow}`);
  summary.getCell(`A${totalRow}`).value = "COMPANY TOTAL";
  const companyTotals = new Map<number, number>([
    [5, totalBase],
    [6, state.payroll.reduce((sum, record) => sum + record.monthlyCommission, 0)],
    [7, state.payroll.reduce((sum, record) => sum + record.manualAdditions, 0)],
    [8, state.payroll.reduce((sum, record) => sum + record.overtimePay, 0)],
    [9, state.payroll.reduce((sum, record) => sum + record.fridayPay, 0)],
    [10, state.payroll.reduce((sum, record) => sum + record.attendanceDeduction, 0)],
    [11, state.payroll.reduce((sum, record) => sum + record.monthlyDeduction, 0)],
    [12, state.payroll.reduce((sum, record) => sum + record.manualDeductions, 0)],
    [13, totalAdditions],
    [14, totalDeductions],
    [15, totalNet],
    [16, state.payroll.reduce((sum, record) => sum + record.presentDays, 0)],
    [17, state.payroll.reduce((sum, record) => sum + record.absentDays, 0)],
    [18, state.payroll.reduce((sum, record) => sum + record.incompleteDays, 0)],
    [19, state.payroll.reduce((sum, record) => sum + record.lateDays, 0)],
    [20, state.payroll.reduce((sum, record) => sum + record.lateMinutes, 0)],
    [21, state.payroll.reduce((sum, record) => sum + record.earlyLeaveDays, 0)],
    [22, state.payroll.reduce((sum, record) => sum + record.unpaidLeaveDays, 0)],
    [23, state.payroll.reduce((sum, record) => sum + record.normalOvertimeMinutes, 0)],
    [24, state.payroll.reduce((sum, record) => sum + record.earlyOvertimeMinutes, 0)],
    [25, state.payroll.reduce((sum, record) => sum + record.overtimeMinutes, 0)],
    [26, state.payroll.reduce((sum, record) => sum + record.normalMissionMinutes, 0)],
    [27, state.payroll.reduce((sum, record) => sum + record.earlyMissionMinutes, 0)],
    [28, state.payroll.reduce((sum, record) => sum + record.totalMissionMinutes, 0)],
  ]);
  for (let column = 5; column <= 28; column += 1) {
    const letter = summary.getColumn(column).letter;
    const result = companyTotals.get(column) ?? 0;
    summary.getRow(totalRow).getCell(column).value = formula(`SUM(${letter}${dataStart}:${letter}${dataEnd})`, result);
  }
  styleTotalRow(summary.getRow(totalRow), 1, 28);
  for (let column = 5; column <= 15; column += 1) summary.getRow(totalRow).getCell(column).numFmt = currencyFormat;
  for (let column = 16; column <= 28; column += 1) summary.getRow(totalRow).getCell(column).numFmt = "#,##0;[Red](#,##0);0";
  for (let column = 26; column <= 28; column += 1) summary.getRow(totalRow).getCell(column).numFmt = "#,##0.0;[Red](#,##0.0);0.0";
  summary.autoFilter = { from: { row: 8, column: 1 }, to: { row: dataEnd, column: 28 } };

  const checkRow = totalRow + 2;
  summary.mergeCells(`A${checkRow}:C${checkRow}`);
  summary.mergeCells(`D${checkRow}:F${checkRow}`);
  summary.getCell(`A${checkRow}`).value = "MODEL STATUS";
  summary.getCell(`D${checkRow}`).value = formula(`IF(ABS(O${totalRow}-(E${totalRow}+M${totalRow}-N${totalRow}))<0.01,\"PASS\",\"FAIL\")`, "PASS");
  summary.getCell(`A${checkRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.panel } };
  summary.getCell(`D${checkRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenSoft } };
  summary.getCell(`A${checkRow}`).font = { name: "Aptos", bold: true, color: { argb: COLORS.muted } };
  summary.getCell(`D${checkRow}`).font = { name: "Aptos", bold: true, color: { argb: COLORS.green } };
  summary.getCell(`A${checkRow}`).alignment = summary.getCell(`D${checkRow}`).alignment = { horizontal: "center", vertical: "middle" };

  const sourceRow = checkRow + 2;
  summary.mergeCells(`A${sourceRow}:AB${sourceRow}`);
  summary.mergeCells(`A${sourceRow + 1}:AB${sourceRow + 1}`);
  summary.getCell(`A${sourceRow}`).value = `Policy: only explicitly allowed overtime days are counted; Penalty Time = Late Time ×${state.policy.minutePenaltyMultiplier}; Normal Mission Time = allowed Normal OT ×${state.policy.overtimeMultiplier}; Early Mission Time = allowed Early OT ×${state.policy.earlyOvertimeMultiplier}; Total Mission Time is the sum of both weighted values; days 1–16 waive the ${state.policy.overtimeArrivalCutoff} arrival cutoff, while from day 17 arrival must be by the cutoff; early leave ×${state.policy.earlyLeaveDayMultiplier} day; unpaid leave ×${state.policy.unpaidLeaveDayMultiplier} day; Friday counts as ${state.policy.fridayMultiplier} days; salary divisor ${state.policy.salaryDivisor}.`;
  summary.getCell(`A${sourceRow + 1}`).value = state.imports.length
    ? `Biometric source: ${state.imports.map((item) => item.fileName).join(", ")}`
    : "Biometric source: no Excel import recorded for this month.";
  for (const row of [sourceRow, sourceRow + 1]) {
    const cell = summary.getCell(`A${row}`);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === sourceRow ? COLORS.yellowSoft : COLORS.panel } };
    cell.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.ink } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  }
  summary.pageSetup.printArea = `A1:AB${sourceRow + 1}`;

  return workbook;
}

export async function payrollWorkbookBuffer(state: HrState) {
  const workbook = await buildPayrollWorkbook(state);
  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}
