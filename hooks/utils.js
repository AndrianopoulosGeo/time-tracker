// Shared utilities for time-tracker hooks

const fs = require("fs");
const path = require("path");

function formatISO(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function formatDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function formatTime(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function readState(stateFile) {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    }
  } catch {}
  return { sessions: {} };
}

function writeState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
}

function writeTimelogEntry(timelogFile, dateStr, startTime, endTime, hours, branchName, task) {
  const docsDir = path.dirname(timelogFile);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  if (!fs.existsSync(timelogFile)) {
    fs.writeFileSync(timelogFile, "# Time Log\n");
  }

  let content = fs.readFileSync(timelogFile, "utf8");
  const row = `| ${startTime} \u2013 ${endTime} | ${hours}  | ${branchName} | ${task} |`;

  if (content.includes(`## ${dateStr}`)) {
    const lines = content.split("\n");
    const dateIdx = lines.findIndex((l) => l.trim() === `## ${dateStr}`);
    let totalIdx = -1;

    for (let i = dateIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("**Daily Total:")) {
        totalIdx = i;
        break;
      }
      if (lines[i].startsWith("## ") && i !== dateIdx) break;
    }

    if (totalIdx !== -1) {
      lines.splice(totalIdx, 0, row);

      let total = 0;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith("**Daily Total:")) {
          lines[i] = `**Daily Total: ${total.toFixed(2)}h**`;
          break;
        }
        if (lines[i].startsWith("## ") && i !== dateIdx) break;
        if (lines[i].startsWith("|") && !lines[i].startsWith("| Time") && !lines[i].startsWith("|---")) {
          const cols = lines[i].split("|").filter((c) => c.trim());
          if (cols.length >= 2) {
            const h = parseFloat(cols[1].trim());
            if (!isNaN(h)) total += h;
          }
        }
      }
    }

    content = lines.join("\n");
  } else {
    const header = `## ${dateStr}\n\n| Time          | Hours | Branch              | Action / Task                          |\n|---------------|-------|---------------------|----------------------------------------|\n${row}\n\n**Daily Total: ${hours}h**\n`;

    const headerIdx = content.indexOf("# Time Log");
    if (headerIdx !== -1) {
      const insertPos = content.indexOf("\n", headerIdx) + 1;
      content = content.slice(0, insertPos) + "\n" + header + "\n" + content.slice(insertPos);
    } else {
      content = "# Time Log\n\n" + header + "\n" + content;
    }
  }

  fs.writeFileSync(timelogFile, content);
}

function closeSession(session, timelogFile, projectDir, autoClose) {
  const { execSync } = require("child_process");

  const now = new Date();
  const startDate = new Date(session.start);
  const lastActivity = session.last_activity ? new Date(session.last_activity) : null;

  let sessionEnd;
  if (lastActivity) {
    sessionEnd = lastActivity;
  } else if (autoClose) {
    sessionEnd = now;
    const rawMinutes = Math.floor((now - startDate) / 60000);
    if (rawMinutes > 720) {
      sessionEnd = new Date(startDate.getTime() + 120 * 60000);
    }
  } else {
    sessionEnd = now;
  }

  let diffMinutes = Math.floor((sessionEnd - startDate) / 60000);
  if (diffMinutes < 1) return null; // Skip very short sessions

  const hours = (diffMinutes / 60).toFixed(2);
  const startTime = formatTime(startDate);
  const endTime = formatTime(sessionEnd) + (autoClose ? "*" : "");
  const startDateStr = formatDate(startDate);
  const branchName = session.branch || "unknown";

  let task = session.task || null;
  if (!task) {
    try {
      const commits = execSync(
        `git log --oneline -3 --since="${session.start}"`,
        { cwd: projectDir, encoding: "utf8" }
      ).trim();
      const firstLine = commits.split("\n")[0];
      task = firstLine ? firstLine.substring(8).trim() : null;
    } catch {}
  }
  if (!task) {
    task = autoClose ? "Session auto-closed" : "Development session";
  }

  writeTimelogEntry(timelogFile, startDateStr, startTime, endTime, hours, branchName, task);
  return { dateStr: startDateStr, hours };
}

module.exports = {
  formatISO, formatDate, formatTime, pad,
  readState, writeState, writeTimelogEntry, closeSession,
};
