// Shared by CLI and browser: only metadata visits the API; bytes go to customer S3.
export async function uploadInputs(aws, deployId, files, expectedBucket, digest = (data) => globalThis.crypto.subtle.digest('SHA-256', data)) {
  const entries = Object.entries(files).filter(([, file]) => file);
  if (!entries.length) return undefined;
  if (entries.length > 5) throw new Error('Upload at most five files');
  const metadata = {}, content = {};
  for (const [name, file] of entries) {
    if (!Number.isInteger(file.size) || file.size < 0 || file.size > 10 * 1024 * 1024) throw new Error('File inputs are limited to 10 MB per file');
    content[name] = await file.arrayBuffer();
    if (content[name].byteLength !== file.size) throw new Error('File changed while preparing the upload');
    const sha256 = btoa(String.fromCharCode(...new Uint8Array(await digest(content[name]))));
    metadata[name] = { filename: file.name, size: file.size, sha256 };
  }
  const upload = await aws('/uploads', { method: 'POST', body: { deploy_id: deployId, files: metadata } });
  if (!upload.data_bucket || (expectedBucket && upload.data_bucket !== expectedBucket)) throw new Error('AWS returned another upload bucket');
  for (const [name] of entries) {
    const target = upload.files?.[name];
    const url = new URL(target?.url);
    if (url.protocol !== 'https:' || url.host !== upload.data_bucket + '.s3.us-east-1.amazonaws.com' || url.username || url.password || url.hash) throw new Error('Invalid customer upload destination');
    const headers = { 'content-type': 'application/octet-stream', 'x-amz-checksum-sha256': metadata[name].sha256 };
    if (Object.keys(target.headers || {}).length !== 2 || Object.entries(headers).some(([key, value]) => target.headers[key] !== value)) throw new Error('Invalid upload signature headers');
    const response = await fetch(url.href, { method: 'PUT', headers, body: content[name], redirect: 'error' });
    if (!response.ok) throw new Error(`AWS file upload failed (${response.status}); select the file and retry`);
  }
  return upload.upload_id;
}
