// Lambda ZipFile contains one module. Inline the same helpers used by local tests.
export function withGrants(code, grantsCode) {
  if (!code?.includes('from grants import ')) return code;
  if (!grantsCode) throw new Error('AWS release is missing the shared permission validator');
  return code.replace(/^from grants import [^\r\n]+/m, () => grantsCode);
}

export function withPrivateChat(code, chatCode) {
  if (!code?.includes('from private_chat import ')) return code;
  if (!chatCode) throw new Error('AWS release is missing the private chat handler');
  return code.replace(/^from private_chat import [^\r\n]+/m, () => chatCode);
}
