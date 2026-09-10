'use strict';
// Shared permission metadata contract for the CLI and dev installer.
function s3Read(value) {
  if (value === undefined || value === null) return null;
  const match = typeof value === 'string' && value.match(/^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\/([A-Za-z0-9_][A-Za-z0-9_.\/-]{0,199})$/);
  if (!match || /^\d+\.\d+\.\d+\.\d+$/.test(match[1]) || match[1].includes('..') ||
      match[2].includes('//') || match[2].split('/').some((p) => p === '.' || p === '..')) {
    throw new Error('S3 read access needs one literal folder, e.g. s3://my-bucket/reports/ (no wildcards)');
  }
  return value.endsWith('/') ? value : value + '/';
}

function accessMap(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid S3 access metadata');
  const result = {};
  for (const name of Object.keys(value).sort()) {
    if (!/^[a-z0-9-]{1,40}$/.test(name) || typeof value[name] !== 'string') throw new Error('Invalid S3 app permission');
    result[name] = s3Read(value[name]);
  }
  // Leave room for the existing Lambda environment within AWS's 4 KB limit.
  if (JSON.stringify(result).length > 1500) throw new Error('S3 permission metadata exceeds this preview’s limit');
  return result;
}

module.exports = { s3Read, accessMap };
