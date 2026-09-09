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
