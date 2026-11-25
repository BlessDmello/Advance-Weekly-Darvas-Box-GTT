export function getApiOrigin(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:4000';
  try {
    const url = new URL(configured);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid origin');
    }
    return url.origin;
  } catch {
    throw new Error('API_INTERNAL_ORIGIN must be an HTTP(S) origin without credentials or a path.');
  }
}
