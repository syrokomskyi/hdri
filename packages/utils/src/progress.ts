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
  const isFinal = current === total && total % interval !== 0;
  
  if (shouldLog || isFinal) {
    const line = `[${gogolId}] Progress: ${current}/${total} (${Math.round((current / total) * 100)}%)`;
    const output = singleLine ? `\r${line.padEnd(60, ' ')}` : `${line}\n`;
    process.stdout.write(output);
  }

  if (isFinal && singleLine) {
    process.stdout.write("\n");
  }
}
