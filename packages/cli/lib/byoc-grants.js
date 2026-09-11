'use strict';

// Syntax is generic; each customer installation supplies its permitted actions.
function grants(value, connection = {}) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Use at most 20 [aws] grants');
  const result = new Map();
  for (const grant of value) {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant) || Object.keys(grant).sort().join(',') !== 'action,resource') throw new Error('Each AWS grant needs only action and resource');
    const { action, resource } = grant;
    if (typeof action !== 'string' || !/^[a-z0-9-]+:[A-Za-z][A-Za-z0-9]{0,99}$/.test(action) || /^(iam|sts|organizations|account|cloudformation):/.test(action)
        || typeof resource !== 'string' || resource.length > 512) throw new Error('Unsupported AWS action or resource');
    if (connection.allowed_actions && !connection.allowed_actions.includes(action)) throw new Error(`${action} is not enabled. Ask the AWS administrator to update AppGrantActions in the installation stack; no new Small release is needed.`);
    const arn = resource.match(/^arn:aws:([a-z0-9-]+):([^:]*):([^:]*):(.+)$/);
    if (!arn || arn[1] !== action.split(':')[0]) throw new Error('Use an exact ARN for the requested AWS service');
    const [, service, region, account, key] = arn;
    if (service === 's3') {
      const match = key.match(/^([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.+))?$/);
      if (region || account || !match || match[1].includes('..') || /^\d+\.\d+\.\d+\.\d+$/.test(match[1])) throw new Error('Use an exact S3 bucket ARN');
      const object = match[2];
      if ((['s3:GetObject', 's3:PutObject'].includes(action) && !object) || (action === 's3:ListBucket' && object)) throw new Error('Use an object ARN for object access and a bucket ARN for listing');
      if (object) {
        const literal = object.endsWith('*') ? object.slice(0, -1) : object;
        if (!/^[A-Za-z0-9_./-]*$/.test(literal) || (object.includes('*') && object !== '*' && !object.endsWith('/*'))
            || literal.includes('//') || (literal && literal.replace(/\/$/, '').split('/').some((p) => ['', '.', '..'].includes(p)))) throw new Error('Use an exact object or folder/* ARN');
      }
    } else {
      if (region !== (connection.region || 'us-east-1') || !/^\d{12}$/.test(account) || (connection.account_id && account !== connection.account_id)) throw new Error('AWS grants must use this installation’s account and region');
      if (!/^[A-Za-z0-9_./:$-]+\*?$/.test(key) || key.includes('//') || key.split('/').includes('..')) throw new Error('Use an exact resource ARN');
      if (key.includes('*') && !(action === 'ecs:DescribeTasks' && /^task\/[A-Za-z0-9_-]{1,255}\/\*$/.test(key))) throw new Error('Use an exact resource ARN or a named ECS cluster’s task/* ARN');
      if (service === 'lambda' && !/^function:[A-Za-z0-9_-]{1,64}(?::(?:[A-Za-z0-9_-]{1,128}|\$LATEST))?$/.test(key)) throw new Error('Use an exact Lambda function ARN');
      if (action === 'ecs:DescribeTasks' && !/^task\/[A-Za-z0-9_-]{1,255}\/(?:[A-Za-z0-9-]+|\*)$/.test(key)) throw new Error('Use a named ECS cluster’s task ARN');
    }
    result.set(action + '\n' + resource, { action, resource });
  }
  return [...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, grant]) => grant);
}

module.exports = { grants };
