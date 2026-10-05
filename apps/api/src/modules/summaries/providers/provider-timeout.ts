export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  return name.includes("timeout")
    || name === "aborterror"
    || message.includes("timed out")
    || message.includes("timeout");
}
