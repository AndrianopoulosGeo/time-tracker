#!/bin/bash
# Time Tracker — SessionEnd hook
# Runs on graceful session exit (NOT on Ctrl+C).
# Closes the active session and writes a timelog entry.
# Note: If the user Ctrl+C's, the orphaned session will be
# auto-closed by session-start.sh on the next session.

set -e

# Read hook input from stdin
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

PROJECT_DIR="${CWD:-$CLAUDE_PROJECT_DIR}"
if [ -z "$PROJECT_DIR" ]; then
  exit 0
fi

STATE_FILE="$PROJECT_DIR/.timelog-state.json"
TIMELOG="$PROJECT_DIR/docs/timelog.md"

# Check if there's an active session
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

ACTIVE=$(jq -r '.active_session // empty' "$STATE_FILE" 2>/dev/null)
if [ -z "$ACTIVE" ] || [ "$ACTIVE" = "null" ]; then
  exit 0
fi

START_ISO=$(jq -r '.active_session.start' "$STATE_FILE" 2>/dev/null)
OLD_BRANCH=$(jq -r '.active_session.branch // "unknown"' "$STATE_FILE" 2>/dev/null)
OLD_TASK=$(jq -r '.active_session.task // empty' "$STATE_FILE" 2>/dev/null)

if [ -z "$START_ISO" ] || [ "$START_ISO" = "null" ]; then
  exit 0
fi

NOW=$(date "+%Y-%m-%dT%H:%M:%S")
NOW_TIME=$(date "+%H:%M")
START_TIME=$(echo "$START_ISO" | sed 's/T/ /' | cut -d' ' -f2 | cut -c1-5)
START_DATE=$(echo "$START_ISO" | cut -dT -f1)

# Calculate duration
START_EPOCH=$(date -d "$START_ISO" "+%s" 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$START_ISO" "+%s" 2>/dev/null || echo "0")
NOW_EPOCH=$(date "+%s")

if [ "$START_EPOCH" = "0" ]; then
  exit 0
fi

DIFF_MINUTES=$(( (NOW_EPOCH - START_EPOCH) / 60 ))

# Skip sessions shorter than 1 minute
if [ "$DIFF_MINUTES" -lt 1 ]; then
  # Clear state even for very short sessions
  echo '{"active_session": null}' > "$STATE_FILE"
  exit 0
fi

HOURS=$(awk "BEGIN {printf \"%.2f\", $DIFF_MINUTES / 60}")

# Determine task
if [ -n "$OLD_TASK" ] && [ "$OLD_TASK" != "null" ]; then
  TASK="$OLD_TASK"
else
  # Try to infer from recent git commits
  TASK=$(git -C "$PROJECT_DIR" log --oneline -3 --since="$START_ISO" 2>/dev/null | head -1 | cut -c9- || echo "")
  if [ -z "$TASK" ]; then
    TASK="Development session"
  fi
fi

# ── Write to timelog ──────────────────────────────────────────
mkdir -p "$(dirname "$TIMELOG")"

if [ ! -f "$TIMELOG" ]; then
  echo "# Time Log" > "$TIMELOG"
  echo "" >> "$TIMELOG"
fi

ROW="| ${START_TIME} \u2013 ${NOW_TIME} | ${HOURS}  | ${OLD_BRANCH} | ${TASK} |"

if grep -q "## ${START_DATE}" "$TIMELOG" 2>/dev/null; then
  sed -i "s/\*\*Daily Total:.*/**PLACEHOLDER_TOTAL**/" "$TIMELOG"
  sed -i "/\*\*PLACEHOLDER_TOTAL\*\*/ i\\${ROW}" "$TIMELOG"
  OLD_TOTAL=$(grep -A 100 "## ${START_DATE}" "$TIMELOG" | grep "Daily Total" | head -1 | grep -oP '[\d.]+' || echo "0")
  NEW_TOTAL=$(awk "BEGIN {printf \"%.2f\", $OLD_TOTAL + $HOURS}")
  sed -i "s/\*\*PLACEHOLDER_TOTAL\*\*/**Daily Total: ${NEW_TOTAL}h**/" "$TIMELOG"
else
  SECTION="\n## ${START_DATE}\n\n| Time          | Hours | Branch              | Action / Task                          |\n|---------------|-------|---------------------|----------------------------------------|\n${ROW}\n\n**Daily Total: ${HOURS}h**\n"
  sed -i "/^# Time Log$/a\\${SECTION}" "$TIMELOG"
fi

# ── Clear state ──────────────────────────────────────────────
echo '{"active_session": null}' > "$STATE_FILE"

exit 0
