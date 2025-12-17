export const stringifyError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
