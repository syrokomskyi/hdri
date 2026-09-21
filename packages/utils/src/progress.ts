/*
<MODULE_CONTRACT>
<purpose>Logs progress at regular intervals during a loop, providing real-time feedback on processing status.</purpose>
<non-goals>
  <item>Does not handle logging to external files or systems.</item>
  <item>Does not manage or modify the loop's execution flow.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of progress logging functionality.</item>
  <item>Fix isFinal: always treat current===total as final so 100% line and newline are printed.</item>
</CHANGE_SUMMARY>
*/

/**
 * Logs progress at regular intervals during a loop.
 * @param gogolId - The gogol identifier for log prefix
 * @param current - Current counter value
 * @param total - Total number of items to process
 * @param interval - Interval at which to log progress (default: 1000)
 * @param singleLine - When true, overwrites the same terminal line with \r instead of printing new lines
 */
export function logProgress(
  gogolId: string,
  current: number,
  total: number,
  interval: number = 1000,
  singleLine: boolean = false,
): void {
  const shouldLog = current > 0 && current % interval === 0;
  const isFinal = current === total;

  if (shouldLog || isFinal) {
    const line = `[${gogolId}] Progress: ${current}/${total} (${Math.round((current / total) * 100)}%)`;
    const output = singleLine ? `\r${line.padEnd(60, " ")}` : `${line}\n`;
    process.stdout.write(output);
  }

  if (isFinal && singleLine) {
    process.stdout.write("\n");
  }
}
