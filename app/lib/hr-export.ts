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
  sick_leave: "Sick leave",
  urgent_leave: "Urgent leave",
  normal_leave: "Normal leave",
  assignment: "Assignment",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: COLORS.line } },
};

function safeCurrency(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "EGP";
}

function moneyFormat(currency: string) {
  return `#,##0.00 \"${safeCurrency(currency)}\";[Red](#,##0.00) \"${safeCurrency(currency)}\";-`;
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
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "";
}

function dateValue(workDate: string) {
  const value = new Date(`${workDate}T12:00:00Z`);
  return Number.isNaN(value.getTime()) ? workDate : value;
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
    cell.alignment = { vertical: "middle", wrapText: index === 5 || index >= 13 };
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
  const widths = [22, 22, 18, 14, 16, 18, 17, 15, 14, 19, 16, 17, 17, 17, 18, 14, 14, 16, 14, 14];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function setEmployeeWidths(sheet: ExcelJS.Worksheet) {
  const widths = [22, 17, 11, 11, 25, 16, 12, 14, 20, 18, 25, 15, 14, 14, 32];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

type EmployeeSheetResult = {
  payroll: PayrollSummary;
  sheetName: string;
};

function addEmployeeSheet(workbook: ExcelJS.Workbook, state: HrState, payroll: PayrollSummary, sheetName: string): EmployeeSheetResult {
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
  const adjustmentRows = Math.max(1, adjustments.length);
  const adjustmentStart = 8;
  const adjustmentEnd = adjustmentStart + adjustmentRows - 1;
  const attendanceSectionRow = Math.max(22, adjustmentEnd + 3);
  const attendanceHeaderRow = attendanceSectionRow + 1;
  const attendanceStart = attendanceHeaderRow + 1;
  const attendanceRows = Math.max(1, attendance.length);
  const attendanceEnd = attendanceStart + attendanceRows - 1;
  const attendanceTotalRow = attendanceEnd + 1;
  const currencyFormat = moneyFormat(state.policy.currency);

  styleTitle(sheet, `FMG EMPLOYEE PAYROLL | ${payroll.employeeName}`, `Payroll month: ${state.month}  |  Currency: ${safeCurrency(state.policy.currency)}  |  Salary statement and attendance detail`, "O");
  sheet.views = [{ state: "frozen", ySplit: attendanceHeaderRow, xSplit: 2, activeCell: `C${attendanceStart}`, showGridLines: false }];

  const identity = [
    ["Employee", payroll.employeeName],
    ["Job title", payroll.title || "Title not set"],
    ["Department", employee?.department || "Department not set"],
    ["Biometric ID", employee?.biometricCode || "—"],
  ];
  const identityStarts = [1, 4, 7, 10];
  identity.forEach(([label, value], index) => {
    const start = identityStarts[index];
    const labelCell = sheet.getRow(4).getCell(start);
    const valueCell = sheet.getRow(4).getCell(start + 1);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.ink } };
    valueCell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
    labelCell.fill = valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.panel } };
    labelCell.border = valueCell.border = thinBorder;
  });
  sheet.getRow(4).height = 24;

  styleSection(sheet, "A6:B6", "PAYROLL BREAKDOWN");
  sheet.getRow(7).values = ["Component", "Amount"];
  styleHeader(sheet.getRow(7), 1, 2);
  const components = ["Base salary", "Fixed commission", "Other additions", "Overtime pay", "Friday work pay", "Total additions", "Attendance deductions", "Fixed deduction", "Other deductions", "Total deductions", "NET SALARY"];
  components.forEach((label, index) => {
    const row = sheet.getRow(8 + index);
    row.getCell(1).value = label;
    styleDataRow(row, 1, 2);
  });

  sheet.getCell("B8").value = payroll.baseSalary;
  sheet.getCell("B9").value = payroll.monthlyCommission;
  sheet.getCell("B10").value = formula(`SUMIF(H${adjustmentStart}:H${adjustmentEnd},\"<>Deduction\",J${adjustmentStart}:J${adjustmentEnd})`, payroll.manualAdditions);
  sheet.getCell("B11").value = formula(`SUM(K${attendanceStart}:K${attendanceEnd})`, payroll.overtimePay);
  sheet.getCell("B12").value = formula(`SUM(L${attendanceStart}:L${attendanceEnd})`, payroll.fridayPay);
  sheet.getCell("B13").value = formula("SUM(B9:B12)", payroll.monthlyCommission + payroll.manualAdditions + payroll.overtimePay + payroll.fridayPay);
  sheet.getCell("B14").value = formula(`SUM(J${attendanceStart}:J${attendanceEnd})`, payroll.lateDeduction);
  sheet.getCell("B15").value = payroll.monthlyDeduction;
  sheet.getCell("B16").value = formula(`SUMIF(H${adjustmentStart}:H${adjustmentEnd},\"Deduction\",J${adjustmentStart}:J${adjustmentEnd})`, payroll.manualDeductions);
  sheet.getCell("B17").value = formula("SUM(B14:B16)", payroll.lateDeduction + payroll.monthlyDeduction + payroll.manualDeductions);
  sheet.getCell("B18").value = formula("B8+B13-B17", payroll.netSalary);
  for (let row = 8; row <= 18; row += 1) sheet.getCell(`B${row}`).numFmt = currencyFormat;
  for (const row of [13, 17, 18]) {
    const fill = row === 13 ? COLORS.greenSoft : row === 17 ? COLORS.redSoft : COLORS.yellow;
    const fontColor = row === 13 ? COLORS.green : row === 17 ? COLORS.red : COLORS.ink;
    for (let column = 1; column <= 2; column += 1) {
      const cell = sheet.getRow(row).getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.font = { name: "Aptos", size: row === 18 ? 13 : 10, bold: true, color: { argb: fontColor } };
    }
  }

  styleSection(sheet, "E6:F6", "ATTENDANCE KPIs");
  sheet.getRow(7).getCell(5).value = "Metric";
  sheet.getRow(7).getCell(6).value = "Total";
  styleHeader(sheet.getRow(7), 5, 6);
  const metrics = ["Present days", "Absent days", "Incomplete days", "Late days", "Late minutes", "Overtime minutes"];
  metrics.forEach((label, index) => {
    const row = sheet.getRow(8 + index);
    row.getCell(5).value = label;
    styleDataRow(row, 5, 6);
  });
  sheet.getCell("F8").value = formula(`COUNTIF(F${attendanceStart}:F${attendanceEnd},\"Present\")`, payroll.presentDays);
  sheet.getCell("F9").value = formula(`COUNTIF(F${attendanceStart}:F${attendanceEnd},\"Absent\")`, payroll.absentDays);
  sheet.getCell("F10").value = formula(`COUNTIF(F${attendanceStart}:F${attendanceEnd},\"Incomplete\")`, payroll.incompleteDays);
  sheet.getCell("F11").value = formula(`COUNTIF(G${attendanceStart}:G${attendanceEnd},\">0\")`, payroll.lateDays);
  sheet.getCell("F12").value = formula(`SUM(G${attendanceStart}:G${attendanceEnd})`, payroll.lateMinutes);
  sheet.getCell("F13").value = formula(`SUM(I${attendanceStart}:I${attendanceEnd})`, payroll.overtimeMinutes);
  sheet.getColumn(6).numFmt = "#,##0;[Red](#,##0);-";

  styleSection(sheet, "H6:K6", "MONTHLY ADJUSTMENTS");
  ["Type", "Label", "Amount", "Notes"].forEach((label, index) => { sheet.getRow(7).getCell(8 + index).value = label; });
  styleHeader(sheet.getRow(7), 8, 11);
  if (adjustments.length) {
    adjustments.forEach((adjustment, index) => {
      const row = sheet.getRow(adjustmentStart + index);
      row.getCell(8).value = adjustment.type === "deduction" ? "Deduction" : adjustment.type[0].toUpperCase() + adjustment.type.slice(1);
      row.getCell(9).value = adjustment.label;
      row.getCell(10).value = adjustment.amount;
      row.getCell(11).value = adjustment.notes;
      styleDataRow(row, 8, 11);
      row.getCell(10).numFmt = currencyFormat;
    });
  } else {
    const row = sheet.getRow(adjustmentStart);
    row.getCell(8).value = "—";
    row.getCell(9).value = "No monthly adjustments";
    row.getCell(10).value = 0;
    row.getCell(11).value = "";
    styleDataRow(row, 8, 11);
    row.getCell(10).numFmt = currencyFormat;
  }

  styleSection(sheet, `A${attendanceSectionRow}:O${attendanceSectionRow}`, "DAILY ATTENDANCE & PAYROLL IMPACT");
  const attendanceHeaders = ["Date", "Day", "First in", "Last out", "All punches", "Status", "Late min", "Penalty min", "OT min", "Late deduction", "OT pay", "Friday pay", "Late excused", "OT approved", "Manager note"];
  attendanceHeaders.forEach((label, index) => { sheet.getRow(attendanceHeaderRow).getCell(index + 1).value = label; });
  styleHeader(sheet.getRow(attendanceHeaderRow), 1, 15);

  if (attendance.length) {
    attendance.forEach((record, index) => {
      const row = sheet.getRow(attendanceStart + index);
      row.values = [dateValue(record.workDate), dayLabel(record.workDate), record.firstIn || "", record.lastOut || "", record.punches.join(" | "), STATUS_LABELS[record.status], record.lateMinutes, record.penaltyMinutes, record.overtimeMinutes, record.lateDeduction, record.overtimePay, record.fridayPay, record.lateExcused ? "Yes" : "No", record.overtimeApproved ? "Yes" : "No", record.notes || "—"];
      styleDataRow(row, 1, 15);
      row.getCell(1).numFmt = "yyyy-mm-dd";
      for (let column = 7; column <= 9; column += 1) row.getCell(column).numFmt = "#,##0;[Red](#,##0);-";
      for (let column = 10; column <= 12; column += 1) row.getCell(column).numFmt = currencyFormat;
    });
  } else {
    const row = sheet.getRow(attendanceStart);
    row.getCell(1).value = "";
    row.getCell(5).value = "No attendance records for this month";
    for (let column = 7; column <= 12; column += 1) row.getCell(column).value = 0;
    styleDataRow(row, 1, 15);
  }

  sheet.mergeCells(`A${attendanceTotalRow}:F${attendanceTotalRow}`);
  sheet.getCell(`A${attendanceTotalRow}`).value = "MONTH TOTAL";
  const totalValues: Array<[number, string, number]> = [
    [7, `SUM(G${attendanceStart}:G${attendanceEnd})`, payroll.lateMinutes],
    [8, `SUM(H${attendanceStart}:H${attendanceEnd})`, attendance.reduce((sum, record) => sum + record.penaltyMinutes, 0)],
    [9, `SUM(I${attendanceStart}:I${attendanceEnd})`, payroll.overtimeMinutes],
    [10, `SUM(J${attendanceStart}:J${attendanceEnd})`, payroll.lateDeduction],
    [11, `SUM(K${attendanceStart}:K${attendanceEnd})`, payroll.overtimePay],
    [12, `SUM(L${attendanceStart}:L${attendanceEnd})`, payroll.fridayPay],
  ];
  totalValues.forEach(([column, formulaValue, result]) => { sheet.getRow(attendanceTotalRow).getCell(column).value = formula(formulaValue, result); });
  styleTotalRow(sheet.getRow(attendanceTotalRow), 1, 15);
  for (let column = 7; column <= 9; column += 1) sheet.getRow(attendanceTotalRow).getCell(column).numFmt = "#,##0;[Red](#,##0);-";
  for (let column = 10; column <= 12; column += 1) sheet.getRow(attendanceTotalRow).getCell(column).numFmt = currencyFormat;
  const noteRow = attendanceTotalRow + 2;
  sheet.mergeCells(`A${noteRow}:O${noteRow + 1}`);
  const noteCell = sheet.getCell(`A${noteRow}`);
  noteCell.value = `Policy: free arrival through ${state.policy.freeArrivalUntil}; overtime after ${state.policy.overtimeStartsAt} when arrival is by ${state.policy.overtimeArrivalCutoff}; late minute ×${state.policy.minutePenaltyMultiplier}; OT ×${state.policy.overtimeMultiplier}; Friday ×${state.policy.fridayMultiplier}; salary divisor ${state.policy.salaryDivisor}.`;
  noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellowSoft } };
  noteCell.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.ink } };
  noteCell.alignment = { wrapText: true, vertical: "middle" };
  noteCell.border = { top: { style: "thin", color: { argb: COLORS.yellow } }, bottom: { style: "thin", color: { argb: COLORS.yellow } } };
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
  styleTitle(summary, "FMG PAYROLL & ATTENDANCE", `Payroll month: ${state.month}  |  Currency: ${safeCurrency(state.policy.currency)}  |  Generated: ${generatedAt()} Cairo`, "T");

  const usedNames = new Set(["payroll summary"]);
  const employeeSheets = state.payroll.map((payroll) => addEmployeeSheet(workbook, state, payroll, uniqueSheetName(payroll.employeeName, usedNames)));
  const dataStart = 9;
  const dataRows = Math.max(1, employeeSheets.length);
  const dataEnd = dataStart + dataRows - 1;
  const totalRow = dataEnd + 1;
  const currencyFormat = moneyFormat(state.policy.currency);
  const totalNet = state.payroll.reduce((sum, record) => sum + record.netSalary, 0);
  const totalAdditions = state.payroll.reduce((sum, record) => sum + record.monthlyCommission + record.manualAdditions + record.overtimePay + record.fridayPay, 0);
  const totalDeductions = state.payroll.reduce((sum, record) => sum + record.lateDeduction + record.monthlyDeduction + record.manualDeductions, 0);
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

  summary.mergeCells("P4:T4");
  summary.mergeCells("P5:T6");
  summary.getCell("P4").value = "EMPLOYEES IN WORKBOOK";
  summary.getCell("P5").value = employeeSheets.length;
  summary.getCell("P4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.panel } };
  summary.getCell("P5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellowSoft } };
  summary.getCell("P4").font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.muted } };
  summary.getCell("P5").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: COLORS.ink } };
  summary.getCell("P4").alignment = summary.getCell("P5").alignment = { horizontal: "center", vertical: "middle" };

  const headers = ["Employee", "Title", "Department", "Biometric ID", "Base salary", "Fixed commission", "Other additions", "Overtime pay", "Friday pay", "Attendance deduction", "Fixed deduction", "Other deductions", "Total additions", "Total deductions", "Net salary", "Present days", "Absent days", "Incomplete days", "Late minutes", "OT minutes"];
  headers.forEach((header, index) => { summary.getRow(8).getCell(index + 1).value = header; });
  styleHeader(summary.getRow(8), 1, 20);

  if (employeeSheets.length) {
    employeeSheets.forEach(({ payroll, sheetName }, index) => {
      const row = summary.getRow(dataStart + index);
      const employee = state.employees.find((item) => item.id === payroll.employeeId);
      row.getCell(1).value = payroll.employeeName;
      row.getCell(2).value = payroll.title || "Title not set";
      row.getCell(3).value = employee?.department || "Department not set";
      row.getCell(4).value = employee?.biometricCode || "—";
      const quoted = quoteSheetName(sheetName);
      const references: Array<[number, string, number]> = [
        [5, `${quoted}!B8`, payroll.baseSalary], [6, `${quoted}!B9`, payroll.monthlyCommission], [7, `${quoted}!B10`, payroll.manualAdditions],
        [8, `${quoted}!B11`, payroll.overtimePay], [9, `${quoted}!B12`, payroll.fridayPay], [10, `${quoted}!B14`, payroll.lateDeduction],
        [11, `${quoted}!B15`, payroll.monthlyDeduction], [12, `${quoted}!B16`, payroll.manualDeductions],
        [13, `${quoted}!B13`, payroll.monthlyCommission + payroll.manualAdditions + payroll.overtimePay + payroll.fridayPay],
        [14, `${quoted}!B17`, payroll.lateDeduction + payroll.monthlyDeduction + payroll.manualDeductions], [15, `${quoted}!B18`, payroll.netSalary],
        [16, `${quoted}!F8`, payroll.presentDays], [17, `${quoted}!F9`, payroll.absentDays], [18, `${quoted}!F10`, payroll.incompleteDays],
        [19, `${quoted}!F12`, payroll.lateMinutes], [20, `${quoted}!F13`, payroll.overtimeMinutes],
      ];
      references.forEach(([column, formulaValue, result]) => { row.getCell(column).value = formula(formulaValue, result); });
      styleDataRow(row, 1, 20);
      for (let column = 5; column <= 15; column += 1) row.getCell(column).numFmt = currencyFormat;
      for (let column = 16; column <= 20; column += 1) row.getCell(column).numFmt = "#,##0;[Red](#,##0);-";
    });
  } else {
    const row = summary.getRow(dataStart);
    row.getCell(1).value = "No active employees";
    for (let column = 5; column <= 20; column += 1) row.getCell(column).value = 0;
    styleDataRow(row, 1, 20);
  }

  summary.mergeCells(`A${totalRow}:D${totalRow}`);
  summary.getCell(`A${totalRow}`).value = "COMPANY TOTAL";
  for (let column = 5; column <= 20; column += 1) {
    const letter = summary.getColumn(column).letter;
    const result = column === 5 ? totalBase
      : column === 13 ? totalAdditions
        : column === 14 ? totalDeductions
          : column === 15 ? totalNet
            : state.payroll.reduce((sum, record) => {
              const values = [record.monthlyCommission, record.manualAdditions, record.overtimePay, record.fridayPay, record.lateDeduction, record.monthlyDeduction, record.manualDeductions, 0, 0, 0, record.presentDays, record.absentDays, record.incompleteDays, record.lateMinutes, record.overtimeMinutes];
              return sum + (values[column - 6] ?? 0);
            }, 0);
    summary.getRow(totalRow).getCell(column).value = formula(`SUM(${letter}${dataStart}:${letter}${dataEnd})`, result);
  }
  styleTotalRow(summary.getRow(totalRow), 1, 20);
  for (let column = 5; column <= 15; column += 1) summary.getRow(totalRow).getCell(column).numFmt = currencyFormat;
  for (let column = 16; column <= 20; column += 1) summary.getRow(totalRow).getCell(column).numFmt = "#,##0;[Red](#,##0);-";
  summary.autoFilter = { from: { row: 8, column: 1 }, to: { row: dataEnd, column: 20 } };

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
  summary.mergeCells(`A${sourceRow}:T${sourceRow}`);
  summary.mergeCells(`A${sourceRow + 1}:T${sourceRow + 1}`);
  summary.getCell(`A${sourceRow}`).value = `Policy: free arrival through ${state.policy.freeArrivalUntil}; overtime after ${state.policy.overtimeStartsAt} when arrival is by ${state.policy.overtimeArrivalCutoff}; late minute ×${state.policy.minutePenaltyMultiplier}; OT ×${state.policy.overtimeMultiplier}; Friday ×${state.policy.fridayMultiplier}; salary divisor ${state.policy.salaryDivisor}.`;
  summary.getCell(`A${sourceRow + 1}`).value = state.imports.length
    ? `Biometric source: ${state.imports.map((item) => item.fileName).join(", ")}`
    : "Biometric source: no Excel import recorded for this month.";
  for (const row of [sourceRow, sourceRow + 1]) {
    const cell = summary.getCell(`A${row}`);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === sourceRow ? COLORS.yellowSoft : COLORS.panel } };
    cell.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.ink } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  }
  summary.pageSetup.printArea = `A1:T${sourceRow + 1}`;

  return workbook;
}

export async function payrollWorkbookBuffer(state: HrState) {
  const workbook = await buildPayrollWorkbook(state);
  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}
