// First private BYOC slice: existing dashboard, Cognito, customer-local catalog.
import { makeTemplate } from './template.mjs';
const ref = (name) => ({ Ref: name });
const att = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const sub = (value) => ({ 'Fn::Sub': value });

export function makePrivateTemplate({ poolId, clientId, cognitoDomain, apiCode, workspace = 'w-small-aws',
  cliRedirectUri = 'http://127.0.0.1:8766/auth/callback', jobCode, installationId, jobName }) {
  if (!/^us-east-1_[A-Za-z0-9]+$/.test(poolId) || !/^[a-z0-9]{1,128}$/.test(clientId)
      || !/^https:\/\/[a-z0-9-]+\.auth\.us-east-1\.amazoncognito\.com$/.test(cognitoDomain)
      || !/^w-[a-z0-9-]{1,40}$/.test(workspace) || !apiCode
      || !/^http:\/\/(127\.0\.0\.1|localhost):8766\/auth\/callback$/.test(cliRedirectUri)) throw new Error('Invalid private installation settings');
  const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/' + poolId;
  const resources = {
    WebBucket: { Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      VersioningConfiguration: { Status: 'Enabled' },
    } },
    Metadata: { Type: 'AWS::DynamoDB::Table', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      BillingMode: 'PAY_PER_REQUEST', AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
      SSESpecification: { SSEEnabled: true }, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    } },
    Api: { Type: 'AWS::ApiGatewayV2::Api', Properties: { Name: sub('${AWS::StackName}-api'), ProtocolType: 'HTTP' } },
    ApiLogs: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: sub('/aws/lambda/${AWS::StackName}-api'), RetentionInDays: 7 } },
    ApiRole: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] },
      Policies: [{ PolicyName: 'read-private-workspace', PolicyDocument: { Version: '2012-10-17', Statement: [
        { Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:Query'], Resource: att('Metadata', 'Arn') },
        { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: sub('${ApiLogs.Arn}:*') },
      ] } }],
    } },
    ApiFunction: { Type: 'AWS::Lambda::Function', DependsOn: ['ApiLogs'], Properties: {
      FunctionName: sub('${AWS::StackName}-api'), Runtime: 'python3.13', Handler: 'index.handler',
      Role: att('ApiRole', 'Arn'), Timeout: 15, MemorySize: 256, Code: { ZipFile: apiCode },
      Environment: { Variables: { COGNITO_POOL_ID: poolId, COGNITO_CLIENT_ID: clientId,
        COGNITO_DOMAIN: cognitoDomain, CLI_REDIRECT_URI: cliRedirectUri, WORKSPACE: workspace, PRIVATE_API_ID: ref('Api'), METADATA_TABLE: ref('Metadata') } },
    } },
    Integration: { Type: 'AWS::ApiGatewayV2::Integration', Properties: { ApiId: ref('Api'), IntegrationType: 'AWS_PROXY',
      IntegrationUri: att('ApiFunction', 'Arn'), PayloadFormatVersion: '2.0', TimeoutInMillis: 16000 } },
    Authorizer: { Type: 'AWS::ApiGatewayV2::Authorizer', Properties: { ApiId: ref('Api'), Name: 'Cognito',
      AuthorizerType: 'JWT', IdentitySource: ['$request.header.Authorization'], JwtConfiguration: { Issuer: issuer, Audience: [clientId] } } },
    ProtectedRoute: { Type: 'AWS::ApiGatewayV2::Route', Properties: { ApiId: ref('Api'), RouteKey: 'ANY /api/{proxy+}',
      Target: sub('integrations/${Integration}'), AuthorizationType: 'JWT', AuthorizerId: ref('Authorizer'), AuthorizationScopes: ['openid'] } },
    ConfigRoute: { Type: 'AWS::ApiGatewayV2::Route', Properties: { ApiId: ref('Api'), RouteKey: 'GET /api/auth/config',
      Target: sub('integrations/${Integration}'), AuthorizationType: 'NONE' } },
    Stage: { Type: 'AWS::ApiGatewayV2::Stage', Properties: { ApiId: ref('Api'), StageName: '$default', AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 } } },
    ApiInvoke: { Type: 'AWS::Lambda::Permission', Properties: { FunctionName: ref('ApiFunction'), Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com', SourceAccount: ref('AWS::AccountId'),
      SourceArn: sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/*') } },
    WebAccess: { Type: 'AWS::CloudFront::OriginAccessControl', Properties: { OriginAccessControlConfig: {
      Name: sub('${AWS::StackName}-web'), OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4',
    } } },
    WebCache: { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: {
      Name: sub('${AWS::StackName}-web'), MinTTL: 0, DefaultTTL: 3600, MaxTTL: 31536000,
      ParametersInCacheKeyAndForwardedToOrigin: { EnableAcceptEncodingGzip: true, EnableAcceptEncodingBrotli: true,
        CookiesConfig: { CookieBehavior: 'none' }, HeadersConfig: { HeaderBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'none' } },
    } } },
    ApiCache: { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: {
      Name: sub('${AWS::StackName}-api'), MinTTL: 0, DefaultTTL: 0, MaxTTL: 0,
      ParametersInCacheKeyAndForwardedToOrigin: { EnableAcceptEncodingGzip: false,
        CookiesConfig: { CookieBehavior: 'none' }, HeadersConfig: { HeaderBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'none' } },
    } } },
    ApiForward: { Type: 'AWS::CloudFront::OriginRequestPolicy', Properties: { OriginRequestPolicyConfig: {
      Name: sub('${AWS::StackName}-api'), HeadersConfig: { HeaderBehavior: 'allExcept', Headers: ['host'] },
      CookiesConfig: { CookieBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'all' },
    } } },
    Headers: { Type: 'AWS::CloudFront::ResponseHeadersPolicy', Properties: { ResponseHeadersPolicyConfig: {
      Name: sub('${AWS::StackName}-headers'), SecurityHeadersConfig: {
        ContentTypeOptions: { Override: true }, FrameOptions: { FrameOption: 'DENY', Override: true },
        ReferrerPolicy: { ReferrerPolicy: 'no-referrer', Override: true },
        StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: true, Override: true },
        ContentSecurityPolicy: { Override: true, ContentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; connect-src 'self' " + issuer.split('/').slice(0, 3).join('/') + ' ' + cognitoDomain },
      },
    } } },
    Routes: { Type: 'AWS::CloudFront::Function', Properties: { Name: sub('${AWS::StackName}-routes'), AutoPublish: true,
      FunctionConfig: { Comment: 'Serve the existing Small SPA routes', Runtime: 'cloudfront-js-2.0' },
      FunctionCode: "function handler(event) { var r = event.request; if (/^\\/(apps(?:\\/.*)?|members|chat|login|logout|auth\\/callback|dash)?$/.test(r.uri)) r.uri = '/index.html'; return r; }",
    } },
    Distribution: { Type: 'AWS::CloudFront::Distribution', Properties: { DistributionConfig: {
      Enabled: true, HttpVersion: 'http2', DefaultRootObject: 'index.html', PriceClass: 'PriceClass_100',
      Origins: [
        { Id: 'web', DomainName: att('WebBucket', 'RegionalDomainName'), OriginAccessControlId: ref('WebAccess'), S3OriginConfig: { OriginAccessIdentity: '' } },
        { Id: 'api', DomainName: sub('${Api}.execute-api.${AWS::Region}.${AWS::URLSuffix}'), CustomOriginConfig: { OriginProtocolPolicy: 'https-only', OriginSSLProtocols: ['TLSv1.2'] } },
      ],
      DefaultCacheBehavior: { TargetOriginId: 'web', ViewerProtocolPolicy: 'redirect-to-https', Compress: true,
        AllowedMethods: ['GET', 'HEAD'], CachedMethods: ['GET', 'HEAD'], CachePolicyId: ref('WebCache'), ResponseHeadersPolicyId: ref('Headers'),
        FunctionAssociations: [{ EventType: 'viewer-request', FunctionARN: att('Routes', 'FunctionARN') }] },
      CacheBehaviors: [{ PathPattern: '/api/*', TargetOriginId: 'api', ViewerProtocolPolicy: 'https-only',
        AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'], CachedMethods: ['GET', 'HEAD'],
        CachePolicyId: ref('ApiCache'), OriginRequestPolicyId: ref('ApiForward'), ResponseHeadersPolicyId: ref('Headers') }],
      ViewerCertificate: { CloudFrontDefaultCertificate: true },
    } } },
    WebPolicy: { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: ref('WebBucket'), PolicyDocument: { Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject', Resource: sub('${WebBucket.Arn}/*'),
        Condition: { StringEquals: { 'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}') } } },
      { Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [att('WebBucket', 'Arn'), sub('${WebBucket.Arn}/*')], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
    ] } } },
  };
  if (jobCode) {
    const compute = makeTemplate({ apiCode: jobCode, installationId, workspace, jobName, privateGateway: true,
      platformOrigin: sub('https://${Distribution.DomainName}') }).Resources;
    Object.assign(resources, compute);
    resources.ApiFunction.Properties.Environment.Variables.JOB_API_FUNCTION = ref('JobApiFunction');
    resources.ApiFunction.Properties.Environment.Variables.ACCOUNT_ID = ref('AWS::AccountId');
    resources.ApiFunction.Properties.Environment.Variables.JOB_NAME = jobName;
    resources.ApiFunction.Properties.Timeout = 29;
    resources.Integration.Properties.TimeoutInMillis = 30000;
    resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.push(
      { Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: att('JobApiFunction', 'Arn') },
      { Effect: 'Allow', Action: ['dynamodb:PutItem', 'dynamodb:UpdateItem'], Resource: att('Metadata', 'Arn') });
    resources.Headers.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy
      += ' https://*.s3.us-east-1.amazonaws.com';
  }
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'Small private BYOC: Cognito login and the existing Apps dashboard',
    Resources: resources, Outputs: { SmallUrl: { Value: sub('https://${Distribution.DomainName}') },
      WebBucket: { Value: ref('WebBucket') }, MetadataTable: { Value: ref('Metadata') },
      DistributionId: { Value: ref('Distribution') }, ApiId: { Value: ref('Api') },
      ...(jobCode ? { DataBucket: { Value: ref('DataBucket') }, JobApiFunction: { Value: ref('JobApiFunction') } } : {}) } };
}
