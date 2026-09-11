import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { makePrivateTemplate } from '../private-template.mjs';

const args = { poolId: 'us-east-1_TestPool', clientId: 'client123',
  cognitoDomain: 'https://small-test.auth.us-east-1.amazoncognito.com', apiCode: 'def handler(event, context): pass' };
const template = makePrivateTemplate(args), r = template.Resources;

test('image retirement has its own scoped role, schedule and private API guard', () => {
  const resources = makePrivateTemplate({ ...args, jobCode: 'job', cleanupCode: 'cleanup',
    ownerEmail: 'owner@example.test', installationId: 'b'.repeat(32), jobName: 'proof' }).Resources;
  assert.equal(resources.JobApiFunction.Properties.Environment.Variables.IMAGE_RETENTION, 'current');
  assert.equal(resources.ImageCleanupFunction.Properties.ReservedConcurrentExecutions, 1);
  assert.ok(resources.ImageCleanupFunction.DependsOn.includes('JobApiFunction'));
  assert.equal(resources.ImageCleanupSchedule.Properties.ScheduleExpression, 'rate(5 minutes)');
  const statements = resources.ImageCleanupRole.Properties.Policies[0].PolicyDocument.Statement;
  const deletion = statements.find(s => [].concat(s.Action).includes('ecr:BatchDeleteImage'));
  assert.deepEqual(deletion.Resource, { 'Fn::GetAtt': ['Repository', 'Arn'] });
  assert.ok(!statements.some(s => [].concat(s.Action).some(a => a.startsWith('iam:') || a === 's3:DeleteObject')));
  const write = statements.find(s => s.Action === 's3:PutObject');
  assert.deepEqual(write.Resource, { 'Fn::Sub': '${DataBucket.Arn}/_image_cleanup/activation.json' });
  assert.equal(resources.Repository.Properties.LifecyclePolicy, undefined);
  assert.equal(resources.ImageCleanupInvoke.Properties.Principal, 'events.amazonaws.com');
  assert.deepEqual(resources.ImageCleanupInvoke.Properties.SourceAccount, { Ref: 'AWS::AccountId' });
});

test('a dev installation reserves the explicitly protected live resources at approval and IAM boundaries', () => {
  const protectedResourceArns = ['arn:aws:s3:::live-small-data', 'arn:aws:s3:::live-small-data/*',
    'arn:aws:lambda:us-east-1:234567890123:function:live-small-*'];
  const resources = makePrivateTemplate({ ...args, jobCode: 'job', permissionsCode: 'permissions',
    ownerEmail: 'owner@example.test', installationId: 'b'.repeat(32), jobName: 'dev-proof', protectedResourceArns }).Resources;
  for (const name of ['ApiFunction', 'JobApiFunction', 'AccessFunction']) {
    assert.deepEqual(JSON.parse(resources[name].Properties.Environment.Variables.SMALL_PROTECTED_RESOURCE_ARNS), protectedResourceArns);
  }
  for (const name of ['AppAccessBoundary', 'AccessBoundary']) {
    assert.ok(resources[name].Properties.PolicyDocument.Statement.some(s => s.Effect === 'Deny'
      && s.Action === '*' && JSON.stringify(s.Resource) === JSON.stringify(protectedResourceArns)));
  }
  for (const value of ['*', ['*'], ['arn:aws:*:*:*:*']]) {
    assert.throws(() => makePrivateTemplate({ ...args, protectedResourceArns: value }), /Invalid protected/);
  }
});

test('private stack grants no external account trust or public Lambda invocation', () => {
  assert.equal(Object.values(r).filter((x) => x.Type === 'AWS::Lambda::Url').length, 0);
  const principals = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.Effect === 'Allow' && value.Principal) principals.push(value.Principal);
    for (const child of Object.values(value)) visit(child);
  };
  visit(r);
  assert.deepEqual(principals, [{ Service: 'lambda.amazonaws.com' }, { Service: 'cloudfront.amazonaws.com' }]);
  assert.equal(r.ApiInvoke.Properties.Principal, 'apigateway.amazonaws.com');
  assert.deepEqual(r.ApiInvoke.Properties.SourceAccount, { Ref: 'AWS::AccountId' });
  assert.match(r.ApiInvoke.Properties.SourceArn['Fn::Sub'], /\$\{Api\}/);
  assert.doesNotMatch(JSON.stringify(template), /637423432890|small-cp|sts:AssumeRole.*arn:aws:iam|ConnectionRole|SignerFunction/);
});

test('all application APIs require scoped Cognito access tokens', () => {
  assert.equal(r.ProtectedRoute.Properties.AuthorizationType, 'JWT');
  assert.deepEqual(r.ProtectedRoute.Properties.AuthorizationScopes, ['openid']);
  assert.deepEqual(r.Authorizer.Properties.JwtConfiguration.Audience, ['client123']);
  const publicRoutes = Object.values(r).filter((x) => x.Type === 'AWS::ApiGatewayV2::Route' && x.Properties.AuthorizationType === 'NONE');
  assert.deepEqual(publicRoutes.map((x) => x.Properties.RouteKey), ['GET /api/auth/config']);
});

test('API caching is disabled and authorization is forwarded without viewer Host', () => {
  const policy = r.ApiCache.Properties.CachePolicyConfig;
  assert.equal(policy.MinTTL + policy.DefaultTTL + policy.MaxTTL, 0);
  assert.deepEqual(r.ApiForward.Properties.OriginRequestPolicyConfig.HeadersConfig, { HeaderBehavior: 'allExcept', Headers: ['host'] });
  assert.equal(r.Distribution.Properties.DistributionConfig.CacheBehaviors[0].ViewerProtocolPolicy, 'https-only');
});

test('Cognito and data survive installation changes; runtime has read-only metadata access', () => {
  assert.equal(Object.values(r).filter((x) => x.Type.startsWith('AWS::Cognito')).length, 0);
  assert.equal(r.Metadata.DeletionPolicy, 'Retain');
  assert.equal(r.WebBucket.DeletionPolicy, 'Retain');
  const policy = r.ApiRole.Properties.Policies[0].PolicyDocument;
  assert.doesNotMatch(JSON.stringify(policy), /PutItem|iam:|cognito-idp:|cloudformation:/);
  assert.deepEqual(policy.Statement[0].Resource, { 'Fn::GetAtt': ['Metadata', 'Arn'] });
});

test('SPA routing preserves static assets and makes callback/deep links reachable', () => {
  const context = vm.createContext({});
  vm.runInContext(r.Routes.Properties.FunctionCode, context);
  for (const uri of ['/', '/apps', '/apps/job/runs/r-123', '/members', '/auth/callback', '/login', '/logout']) {
    assert.equal(context.handler({ request: { uri, querystring: { code: 'fixture' } } }).uri, '/index.html');
  }
  for (const uri of ['/static/main.js', '/api/apps', '/favicon.svg']) assert.equal(context.handler({ request: { uri } }).uri, uri);
});

test('invalid authentication/installation settings cannot generate a stack', () => {
  for (const change of [{ poolId: 'eu-west-1_pool' }, { clientId: 'client with spaces' },
    { cognitoDomain: 'https://evil.example' }, { workspace: '../other' }, { apiCode: '' }]) {
    assert.throws(() => makePrivateTemplate({ ...args, ...change }), /Invalid/);
  }
});

test('private CPU stack reuses the job engine with no hosted signer, external trust or alternate public entry', () => {
  const cpu = makePrivateTemplate({ ...args, jobCode: 'def private_handler(event, context): pass', installationId: 'a'.repeat(32), jobName: 'private-proof' }).Resources;
  for (const name of ['SigningSecret', 'SignerFunction', 'ConnectionRole', 'Register', 'ApiUrl', 'UrlPermission', 'InvokePermission']) assert.equal(cpu[name], undefined);
  assert.equal(cpu.JobApiFunction.Properties.Handler, 'index.private_handler');
  assert.equal(cpu.JobApiFunction.Properties.Environment.Variables.SIGNING_SECRET, undefined);
  assert.equal(cpu.JobApiFunction.Properties.Environment.Variables.PRIVATE_GATEWAY, 'true');
  assert.equal(Object.values(cpu).filter((resource) => resource.Type === 'AWS::Lambda::Url').length, 0);
  assert.doesNotMatch(JSON.stringify(cpu.JobApiRole), /GetSecretValue|637423432890|AssumeRole.*arn:aws:iam/);
  const invoke = cpu.ApiRole.Properties.Policies[0].PolicyDocument.Statement.find((statement) => statement.Action === 'lambda:InvokeFunction');
  assert.deepEqual(invoke.Resource, { 'Fn::GetAtt': ['JobApiFunction', 'Arn'] });
  assert.equal(cpu.Subnet.Properties.MapPublicIpOnLaunch, false);
  assert.equal(cpu.DataBucket.DeletionPolicy, 'Retain');
  assert.deepEqual(cpu.DataBucket.Properties.CorsConfiguration.CorsRules[0].AllowedOrigins, [{ 'Fn::Sub': 'https://${Distribution.DomainName}' }]);
  assert.ok(cpu.EcrApiEndpoint && cpu.EcrDockerEndpoint && cpu.LogsEndpoint && cpu.S3Endpoint);
});

test('private S3 approval stays behind Cognito and the gateway cannot change approved grants or IAM', () => {
  const cpu = makePrivateTemplate({ ...args, jobCode: 'job', permissionsCode: 'permissions', ownerEmail: 'owner@example.test',
    installationId: 'a'.repeat(32), jobName: 'private-proof' }).Resources;
  assert.ok(cpu.AccessTable && cpu.AccessBoundary && cpu.AccessFunction);
  assert.equal(cpu.AccessTable.DeletionPolicy, 'Retain');
  assert.equal(cpu.AccessFunction.Properties.Environment.Variables.OWNER, 'owner@example.test');
  assert.equal(cpu.AccessFunction.Properties.ReservedConcurrentExecutions, 1);
  assert.deepEqual(cpu.JobApiFunction.Properties.Environment.Variables.ACCESS_TABLE, { Ref: 'AccessTable' });
  const statements = cpu.ApiRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.doesNotMatch(JSON.stringify(statements), /iam:|sts:|s3:/);
  const writes = statements.find((s) => Array.isArray(s.Action) && s.Action.includes('dynamodb:DeleteItem'));
  assert.deepEqual(writes.Resource, { 'Fn::GetAtt': ['AccessTable', 'Arn'] });
  assert.deepEqual(writes.Condition['ForAllValues:StringEquals']['dynamodb:LeadingKeys'], ['request']);
  assert.doesNotMatch(JSON.stringify(cpu), /637423432890|ConnectionRole|SignerFunction|AWS::Lambda::Url/);
});

test('configurable permissions preserve legacy roles and bundle executable standalone Lambdas', () => {
  const source = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const template = makePrivateTemplate({ ...args, apiCode: source('private_api.py'), jobCode: source('api.py'),
    permissionsCode: source('permissions.py'), grantsCode: source('grants.py'), chatCode: source('private_chat.py'), ownerEmail: 'owner@example.test',
    installationId: 'a'.repeat(32), jobName: 'proof' });
  const r = template.Resources;
  assert.equal(r.AccessBoundary.Properties.PolicyDocument.Statement[1].NotAction, 's3:GetObject');
  assert.deepEqual(r.AppAccessBoundary.Properties.PolicyDocument.Statement[1].NotAction, { Ref: 'AppGrantActions' });
  assert.ok(template.Parameters.AppGrantActions.AllowedPattern);
  assert.ok(r.LambdaEndpoint && r.EcsEndpoint);
  const denies = r.AppAccessBoundary.Properties.PolicyDocument.Statement.filter((s) => s.Effect === 'Deny');
  assert.match(JSON.stringify(denies), /ReleaseBucketArn/);
  assert.match(JSON.stringify(denies), /uploads/);
  assert.match(JSON.stringify(denies), /WebBucket/);
  assert.doesNotMatch(JSON.stringify(denies), /arn:\$\{AWS::Partition\}:\*:/);
  assert.ok(denies.some((s) => s.Action === '*' && s.Condition?.StringNotEquals?.['aws:ResourceAccount']?.Ref === 'AWS::AccountId'));
  assert.doesNotMatch(JSON.stringify(template), /503561429929|637423432890/);
  const codes = ['ApiFunction', 'JobApiFunction', 'AccessFunction'].map((name) => r[name].Properties.Code.ZipFile);
  for (const code of codes) assert.doesNotMatch(code, /^from grants import /m);
  const result = spawnSync('python', ['-c', 'import json,sys\nfor code in json.load(sys.stdin):\n ns={}\n exec(compile(code,"index.py","exec"),ns)\n assert callable(ns["normalize_grants"])\n assert callable(ns["handler"])'],
    { input: JSON.stringify(codes), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => makePrivateTemplate({ ...args, apiCode: source('private_api.py') }), /missing.*validator/);
});

test('private Bedrock chat grants only its configured model and customer chat storage', () => {
  const source = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const config = { ...args, apiCode: source('private_api.py'), grantsCode: source('grants.py'), chatCode: source('private_chat.py'),
    jobCode: source('api.py'), installationId: 'a'.repeat(32), jobName: 'proof',
    bedrockModelId: 'us.anthropic.claude-sonnet-4-6', bedrockModelRegions: ['us-east-1', 'us-east-2', 'us-west-2'] };
  const t = makePrivateTemplate(config), r = t.Resources;
  assert.equal(r.ChatTable.Properties.TimeToLiveSpecification.AttributeName, 'expires_at');
  assert.equal(r.ChatTable.DeletionPolicy, 'Retain');
  assert.deepEqual(r.ApiFunction.Properties.Environment.Variables.CHAT_TABLE, { Ref: 'ChatTable' });
  assert.equal(r.ApiFunction.Properties.Environment.Variables.BEDROCK_MODEL_ID, config.bedrockModelId);
  const statements = r.ApiRole.Properties.Policies.flatMap((p) => p.PolicyDocument.Statement);
  const bedrock = statements.filter((s) => s.Action === 'bedrock:InvokeModel');
  assert.equal(bedrock.length, 2);
  assert.match(JSON.stringify(bedrock), /bedrock:InferenceProfileArn/);
  assert.doesNotMatch(JSON.stringify(bedrock), /637423432890|503561429929|"\*"/);
  assert.deepEqual(statements.find((s) => s.Action?.includes?.('dynamodb:DeleteItem')).Resource, { 'Fn::GetAtt': ['ChatTable', 'Arn'] });
  assert.doesNotMatch(r.ApiFunction.Properties.Code.ZipFile, /^from private_chat import /m);
  const run = spawnSync('python', ['-c', 'import sys\nns={}\nexec(compile(sys.stdin.read(),"index.py","exec"),ns)\nassert callable(ns["PrivateChat"])'],
    { input: r.ApiFunction.Properties.Code.ZipFile, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.throws(() => makePrivateTemplate({ ...config, bedrockModelId: '*' }), /Bedrock/);
  assert.throws(() => makePrivateTemplate({ ...config, bedrockModelRegions: [] }), /Bedrock/);
  assert.throws(() => makePrivateTemplate({ ...config, chatCode: undefined }), /missing/);
});
