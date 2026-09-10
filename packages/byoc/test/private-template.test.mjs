import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { makePrivateTemplate } from '../private-template.mjs';

const args = { poolId: 'us-east-1_TestPool', clientId: 'client123',
  cognitoDomain: 'https://small-test.auth.us-east-1.amazoncognito.com', apiCode: 'def handler(event, context): pass' };
const template = makePrivateTemplate(args), r = template.Resources;

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
