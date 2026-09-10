import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTemplate } from '../template.mjs';

const template = makeTemplate({ apiCode: readFileSync(new URL('../api.py', import.meta.url), 'utf8'),
  signerCode: readFileSync(new URL('../signer.py', import.meta.url), 'utf8'), installationId: 'a'.repeat(32), externalId: 'b'.repeat(64),
  workspace: 'example-com', owner: 'owner@example.com', jobName: 'cpu-job',
  platformPrincipal: 'arn:aws:iam::123456789012:user/small-byoc-dev', platformOrigin: 'https://small.example.test' });

test('hosted connection can invoke only the signer and describe its own stack', () => {
  const statements = template.Resources.ConnectionRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(statements.map((s) => s.Action), ['lambda:InvokeFunction', 'cloudformation:DescribeStacks']);
  assert.deepEqual(statements[0].Resource, { 'Fn::GetAtt': ['SignerFunction', 'Arn'] });
  assert.deepEqual(statements[1].Resource, { Ref: 'AWS::StackId' });
  assert.equal(template.Resources.ConnectionRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals['sts:ExternalId'], 'b'.repeat(64));
});
test('jobs cannot write other runs, API records, or read signing secrets', () => {
  assert.equal(template.Resources.TaskRole.Properties.Policies, undefined);
  assert.ok(!JSON.stringify(template.Resources.ExecutionRole).includes('secretsmanager'));
  assert.ok(!JSON.stringify(template.Resources.BuildRole).includes('SigningSecret'));
});
test('job subnet has no public IP, internet gateway, or NAT route', () => {
  assert.equal(template.Resources.Subnet.Properties.MapPublicIpOnLaunch, false);
  assert.ok(!Object.values(template.Resources).some((r) => ['AWS::EC2::NatGateway', 'AWS::EC2::InternetGateway', 'AWS::EC2::Route'].includes(r.Type)));
  assert.equal(template.Resources.S3Endpoint.Properties.VpcEndpointType, 'Gateway');
  assert.equal(template.Resources.EcrDockerEndpoint.Properties.PrivateDnsEnabled, true);
});
test('every CF reference resolves and install template fits the S3 template limit', () => {
  const names = new Set([...Object.keys(template.Resources), 'AWS::Region', 'AWS::AccountId', 'AWS::StackId', 'AWS::Partition']);
  const visit = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.Ref) assert.ok(names.has(o.Ref), o.Ref);
    if (o['Fn::GetAtt']) assert.ok(names.has(o['Fn::GetAtt'][0]), o['Fn::GetAtt'][0]);
    for (const value of Object.values(o)) visit(value);
  };
  visit(template);
  assert.ok(Buffer.byteLength(JSON.stringify(template)) < 1024 * 1024);
});

test('S3 grants are separate app roles scoped to one folder, account and region', () => {
  const next = makeTemplate({ apiCode: 'api', signerCode: 'signer', installationId: 'a'.repeat(32), externalId: 'b'.repeat(64),
    workspace: 'example-com', owner: 'owner@example.com', jobName: 'cpu-job', platformPrincipal: 'arn:aws:iam::123456789012:user/small-byoc-dev',
    platformOrigin: 'https://small.example.test', s3Access: { 'csv-report': 's3://company-data/reports/', other: 's3://company-data/other/' } });
  const roles = Object.entries(next.Resources).filter(([id]) => id.startsWith('S3Task'));
  assert.equal(roles.length, 2);
  assert.equal(new Set(roles.map(([, r]) => r.Properties.RoleName)).size, 2);
  for (const [id, r] of roles) {
    const isReport = r.Properties.RoleName.endsWith('-csv-report');
    const statements = r.Properties.Policies[0].PolicyDocument.Statement;
    assert.deepEqual(statements, [{ Effect: 'Allow', Action: 's3:GetObject', Resource: `arn:aws:s3:::company-data/${isReport ? 'reports' : 'other'}/*`,
      Condition: { StringEquals: { 's3:ResourceAccount': { Ref: 'AWS::AccountId' }, 'aws:RequestedRegion': { Ref: 'AWS::Region' } } } }]);
    const pass = next.Resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.find((s) => s.Action === 'iam:PassRole');
    assert.ok(pass.Resource.some((ref) => ref['Fn::GetAtt'][0] === id));
    assert.equal(pass.Condition.StringEquals['iam:PassedToService'], 'ecs-tasks.amazonaws.com');
  }
  for (const key of ['Vpc', 'Subnet', 'DataBucket', 'TaskRole', 'ConnectionRole', 'BuildRole', 'ExecutionRole']) {
    assert.deepEqual(next.Resources[key], template.Resources[key], key);
  }
});

test('one-time upgrade delegates only bounded app role management and preserves existing resources', () => {
  const next = makeTemplate({ apiCode: 'api', signerCode: 'signer', permissionsCode: 'permissions',
    installationId: 'a'.repeat(32), externalId: 'b'.repeat(64), workspace: 'example-com', owner: 'owner@example.com',
    jobName: 'cpu-job', platformPrincipal: 'arn:aws:iam::123456789012:user/small-byoc-dev', platformOrigin: 'https://small.example.test' });
  const statements = next.Resources.AccessRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(statements.flatMap((s) => s.Action), ['iam:CreateRole', 'iam:GetRole', 'iam:PutRolePolicy', 'dynamodb:GetItem', 'dynamodb:PutItem', 'logs:CreateLogStream', 'logs:PutLogEvents']);
  for (const action of ['iam:CreateRole', 'iam:PutRolePolicy']) {
    const s = statements.find((s) => s.Action === action);
    assert.deepEqual(s.Condition.StringEquals['iam:PermissionsBoundary'], { Ref: 'AccessBoundary' });
    assert.ok(s.Resource['Fn::Sub'].endsWith('role/small-s3-aaaaaaaaaaaa-*'));
  }
  const boundary = next.Resources.AccessBoundary.Properties.PolicyDocument.Statement;
  assert.deepEqual(boundary[1], { Effect: 'Deny', NotAction: 's3:GetObject', Resource: '*' });
  assert.deepEqual(boundary[2].Condition.StringNotEquals['s3:ResourceAccount'], { Ref: 'AWS::AccountId' });
  assert.deepEqual(boundary[3].Condition.StringNotEquals['aws:RequestedRegion'], { Ref: 'AWS::Region' });
  const connection = next.Resources.ConnectionRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(connection[0].Resource, [{ 'Fn::GetAtt': ['SignerFunction', 'Arn'] }, { 'Fn::GetAtt': ['AccessFunction', 'Arn'] }]);
  assert.equal(connection[1].Action, 'cloudformation:DescribeStacks');
  assert.equal(next.Resources.AccessFunction.Properties.ReservedConcurrentExecutions, 1);
  for (const key of ['Vpc', 'Subnet', 'DataBucket', 'TaskRole', 'BuildRole', 'ExecutionRole']) assert.deepEqual(next.Resources[key], template.Resources[key], key);
});
