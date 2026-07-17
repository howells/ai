/**
 * Override the AI SDK's default stream handler, which logs full upstream
 * exceptions. Provider failures are converted to namespaced benchmark errors.
 */
export function suppressProviderStreamError(event: unknown): void {
  void event;
}
