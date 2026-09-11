// Lambda ZipFile contains one module. Inline the same helpers used by local tests.
export function withGrants(code, grantsCode) {
  if (!code?.includes('from grants import ')) return code;
  if (!grantsCode) throw new Error('AWS release is missing the shared permission validator');
  return code.replace(/^from grants import [^\r\n]+/m, () => grantsCode);
}
