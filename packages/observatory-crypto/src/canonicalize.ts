/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * Rules applied:
 *  - Object keys sorted by their UTF-16 code unit sequence (JS default sort).
 *  - No insignificant whitespace.
 *  - Strings: standard JSON string encoding (JSON.stringify).
 *  - Numbers: ES6 Number.toString() (rejects NaN / ±Infinity).
 *  - Arrays: order preserved.
 *  - null / boolean: literal tokens.
 *
 * Spec: https://www.rfc-editor.org/rfc/rfc8785
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';

  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new TypeError(
        `RFC 8785: non-finite numbers (NaN, Infinity) are not allowed — got ${value}`,
      );
    }
    return String(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }

  if (typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => {
        const v = (value as Record<string, unknown>)[key];
        return JSON.stringify(key) + ':' + canonicalize(v);
      });
    return '{' + entries.join(',') + '}';
  }

  throw new TypeError(`RFC 8785: cannot canonicalize value of type ${typeof value}`);
}
