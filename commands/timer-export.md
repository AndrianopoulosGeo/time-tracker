---
description: "Export timelog to Excel (.xlsx) file"
---

# Timer Export

Export the time log data from `docs/timelog.md` to an Excel file at `docs/timelog.xlsx`.

## Usage

```
/timer-export                     (export all entries)
/timer-export week                (current week only)
/timer-export 2026-03 2026-04    (date range)
```

## Steps

1. **Check for exceljs dependency.** Run:
   ```bash
   node -e "try{require('$PLUGIN_ROOT/node_modules/exceljs');console.log('ok')}catch{console.log('missing')}"
   ```
   
   Where `$PLUGIN_ROOT` is the time-tracker plugin directory: `~/.claude/local-plugins/time-tracker`.
   
   If missing, install it:
   ```bash
   cd <plugin-root> && npm install
   ```

2. **Read and parse `docs/timelog.md`.** Parse all date sections, table rows, and daily totals. Build a data structure:
   ```
   entries = [
     { date: "2026-04-02", start: "12:29", end: "12:30", hours: 0.02, branch: "develop", task: "..." },
     ...
   ]
   ```

3. **Apply date filter** (if arguments provided):
   - `week` → filter to entries from the current week (Monday to Sunday)
   - Two dates → filter to entries within that range (inclusive)
   - No args → include all entries

4. **Generate Excel file.** Run a Node.js script via Bash that creates the workbook:

   ```bash
   node -e "
   const ExcelJS = require('<plugin-root>/node_modules/exceljs');
   const entries = JSON.parse(process.argv[1]);
   
   async function generate() {
     const wb = new ExcelJS.Workbook();
     wb.creator = 'Time Tracker v3.0';
     wb.created = new Date();
     
     // Sheet 1: Time Log
     const ws = wb.addWorksheet('Time Log');
     ws.columns = [
       { header: 'Date', key: 'date', width: 12 },
       { header: 'Start', key: 'start', width: 8 },
       { header: 'End', key: 'end', width: 8 },
       { header: 'Hours', key: 'hours', width: 8 },
       { header: 'Branch', key: 'branch', width: 18 },
       { header: 'Task', key: 'task', width: 60 },
     ];
     
     // Header styling
     ws.getRow(1).font = { bold: true };
     ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
     ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
     
     for (const e of entries) {
       const row = ws.addRow(e);
       row.getCell('hours').numFmt = '0.00';
     }
     
     // Alternating row colors
     for (let i = 2; i <= ws.rowCount; i++) {
       if (i % 2 === 0) {
         ws.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
       }
     }
     
     // Sheet 2: Summary
     const summary = wb.addWorksheet('Summary');
     summary.columns = [
       { header: 'Date', key: 'date', width: 12 },
       { header: 'Hours', key: 'hours', width: 10 },
       { header: 'Sessions', key: 'sessions', width: 10 },
     ];
     summary.getRow(1).font = { bold: true };
     summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
     summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
     
     // Group by date
     const byDate = {};
     for (const e of entries) {
       if (!byDate[e.date]) byDate[e.date] = { hours: 0, count: 0 };
       byDate[e.date].hours += e.hours;
       byDate[e.date].count++;
     }
     for (const [date, d] of Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))) {
       const row = summary.addRow({ date, hours: parseFloat(d.hours.toFixed(2)), sessions: d.count });
       row.getCell('hours').numFmt = '0.00';
     }
     
     // Total row
     const totalHours = entries.reduce((s, e) => s + e.hours, 0);
     const totalRow = summary.addRow({ date: 'TOTAL', hours: parseFloat(totalHours.toFixed(2)), sessions: entries.length });
     totalRow.font = { bold: true };
     totalRow.getCell('hours').numFmt = '0.00';
     
     await wb.xlsx.writeFile(process.argv[2]);
     console.log('ok');
   }
   generate().catch(e => { console.error(e.message); process.exit(1); });
   " '<entries-json>' 'docs/timelog.xlsx'
   ```

   Replace `<entries-json>` with the JSON-stringified entries array and `<plugin-root>` with the actual plugin path.

5. **Confirm to user:**
   ```
   Exported N entries (X.Xh total) to docs/timelog.xlsx
   ```
   
   If a date filter was applied:
   ```
   Exported N entries (X.Xh total) for [filter description] to docs/timelog.xlsx
   ```
