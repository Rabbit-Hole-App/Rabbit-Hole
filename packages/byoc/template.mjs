// One workspace connection, multiple CPU jobs. Shared by dev and tests.
import { accessMap } from '../cli/lib/byoc-s3.js';
import { withGrants } from './python-source.mjs';
const ref = (name) => ({ Ref: name });
const att = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const sub = (value) => ({ 'Fn::Sub': value });
const allow = (Action, Resource, Condition) => ({ Effect: 'Allow', Action, Resource, ...(Condition ? { Condition } : {}) });
const trust = (service) => ({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: service }, Action: 'sts:AssumeRole' }] });
const role = (service, statements) => ({ Type: 'AWS::IAM::Role', Properties: {
  AssumeRolePolicyDocument: trust(service), Policies: [{ PolicyName: 'small-job', PolicyDocument: { Version: '2012-10-17', Statement: statements } }],
} });

export function makeTemplate({ apiCode, signerCode, permissionsCode, grantsCode, installationId, externalId, workspace, owner, platformPrincipal, platformOrigin, jobName, s3Access = {}, privateGateway = false }) {
  apiCode = withGrants(apiCode, grantsCode);
  permissionsCode = withGrants(permissionsCode, grantsCode);
  if (!/^[a-f0-9]{32}$/.test(installationId) || (!privateGateway && !/^[a-f0-9]{64}$/.test(externalId))) throw new Error('Invalid installation ID');
  if (privateGateway && Object.keys(s3Access).length) throw new Error('Private S3 folders must be approved in Small');
  if (!/^[a-z0-9-]{1,40}$/.test(jobName)) throw new Error('Invalid job name');
  const label = 'small-byoc-' + installationId.slice(0, 12);
  s3Access = accessMap(s3Access);
  const appRolePrefix = 'small-job-' + installationId.slice(0, 12) + '-';
  const bucketObjects = sub('${DataBucket.Arn}/*');
  const logPolicy = (group) => allow(['logs:CreateLogStream', 'logs:PutLogEvents'], sub('${' + group + '.Arn}:*'));
  const Resources = {
    Vpc: { Type: 'AWS::EC2::VPC', Properties: { CidrBlock: '10.83.0.0/16', EnableDnsSupport: true, EnableDnsHostnames: true,
      Tags: [{ Key: 'Name', Value: label }] } },
    Subnet: { Type: 'AWS::EC2::Subnet', Properties: { VpcId: ref('Vpc'), CidrBlock: '10.83.1.0/24', MapPublicIpOnLaunch: false,
      AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] } } },
    RouteTable: { Type: 'AWS::EC2::RouteTable', Properties: { VpcId: ref('Vpc') } },
    RouteAssociation: { Type: 'AWS::EC2::SubnetRouteTableAssociation', Properties: { SubnetId: ref('Subnet'), RouteTableId: ref('RouteTable') } },
    EndpointSecurityGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'HTTPS from this job VPC only', VpcId: ref('Vpc'),
      SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '10.83.0.0/16' }] } },
    TaskSecurityGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'Private job; HTTPS AWS endpoints only', VpcId: ref('Vpc'),
      SecurityGroupEgress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' }] } },
    S3Endpoint: { Type: 'AWS::EC2::VPCEndpoint', Properties: { VpcId: ref('Vpc'), VpcEndpointType: 'Gateway',
      ServiceName: sub('com.amazonaws.${AWS::Region}.s3'), RouteTableIds: [ref('RouteTable')] } },
    DataBucket: { Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      VersioningConfiguration: { Status: 'Enabled' },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      CorsConfiguration: { CorsRules: [{ AllowedOrigins: [platformOrigin], AllowedMethods: ['GET', 'PUT'],
        AllowedHeaders: ['content-type'], ExposedHeaders: ['ETag'], MaxAge: 300 }] },
    } },
    BucketPolicy: { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: ref('DataBucket'), PolicyDocument: { Version: '2012-10-17', Statement: [{
      Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [att('DataBucket', 'Arn'), bucketObjects], Condition: { Bool: { 'aws:SecureTransport': 'false' } },
    }] } } },
    Repository: { Type: 'AWS::ECR::Repository', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      RepositoryName: label, ImageTagMutability: 'IMMUTABLE', ImageScanningConfiguration: { ScanOnPush: true },
    } },
    Cluster: { Type: 'AWS::ECS::Cluster', Properties: { ClusterName: label } },
    RunLogGroup: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/small/byoc/' + label + '/runs', RetentionInDays: 7 } },
    BuildLogGroup: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/small/byoc/' + label + '/builds', RetentionInDays: 7 } },
    ApiLogGroup: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/aws/lambda/' + label + '-api', RetentionInDays: 7 } },
    SignerLogGroup: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/aws/lambda/' + label + '-signer', RetentionInDays: 7 } },
    SigningSecret: { Type: 'AWS::SecretsManager::Secret', Properties: { GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true } } },
    TaskRole: { Type: 'AWS::IAM::Role', Properties: { AssumeRolePolicyDocument: trust('ecs-tasks.amazonaws.com') } },
    ExecutionRole: role('ecs-tasks.amazonaws.com', [
      allow('ecr:GetAuthorizationToken', '*'), allow(['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'], att('Repository', 'Arn')),
      logPolicy('RunLogGroup'),
    ]),
    BuildRole: role('codebuild.amazonaws.com', [
      allow(['s3:GetObject', 's3:GetObjectVersion'], sub('${DataBucket.Arn}/sources/*')),
      allow(['s3:GetBucketLocation', 's3:GetBucketAcl'], att('DataBucket', 'Arn')),
      allow('ecr:GetAuthorizationToken', '*'), allow(['ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:DescribeImages'], att('Repository', 'Arn')), logPolicy('BuildLogGroup'),
    ]),
    BuildProject: { Type: 'AWS::CodeBuild::Project', Properties: { Name: label, ServiceRole: att('BuildRole', 'Arn'),
      TimeoutInMinutes: 15, ConcurrentBuildLimit: 1, Artifacts: { Type: 'NO_ARTIFACTS' },
      Environment: { Type: 'LINUX_CONTAINER', ComputeType: 'BUILD_GENERAL1_SMALL', Image: 'aws/codebuild/standard:7.0', PrivilegedMode: true,
        EnvironmentVariables: [{ Name: 'REPOSITORY', Value: att('Repository', 'RepositoryUri') }] },
      LogsConfig: { CloudWatchLogs: { Status: 'ENABLED', GroupName: ref('BuildLogGroup') } },
      Source: { Type: 'S3', Location: sub('${DataBucket}/sources/initial.zip'), BuildSpec: JSON.stringify({
        version: '0.2', env: { 'exported-variables': ['IMAGE_URI'] }, phases: {
          pre_build: { commands: ['aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "${REPOSITORY%/*}"',
            'export IMAGE_TAG="build-$CODEBUILD_BUILD_NUMBER"'] },
          build: { commands: ['docker build --file .small/Dockerfile --tag "$REPOSITORY:$IMAGE_TAG" .'] },
          post_build: { commands: ['docker push "$REPOSITORY:$IMAGE_TAG"',
            'export IMAGE_DIGEST=$(aws ecr describe-images --repository-name "${REPOSITORY#*/}" --image-ids imageTag="$IMAGE_TAG" --query "imageDetails[0].imageDigest" --output text)',
            'export IMAGE_URI="$REPOSITORY@$IMAGE_DIGEST"'] },
        },
      }) },
    } },
    ApiRole: role('lambda.amazonaws.com', [
      allow(['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'], bucketObjects), allow('s3:ListBucket', att('DataBucket', 'Arn')),
      allow('secretsmanager:GetSecretValue', ref('SigningSecret')),
      allow(['codebuild:StartBuild', 'codebuild:BatchGetBuilds'], att('BuildProject', 'Arn')),
      allow('ecs:RegisterTaskDefinition', '*'),
      allow('ecs:RunTask', sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:task-definition/' + label + ':*'),
        { ArnEquals: { 'ecs:cluster': att('Cluster', 'Arn') } }),
      allow('ecs:DescribeTasks', sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:task/' + label + '/*')),
      allow('iam:PassRole', [att('TaskRole', 'Arn'), att('ExecutionRole', 'Arn')], { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } }),
      allow('logs:GetLogEvents', [sub('${RunLogGroup.Arn}:*'), sub('${BuildLogGroup.Arn}:*')]), logPolicy('ApiLogGroup'),
    ]),
    ApiFunction: { Type: 'AWS::Lambda::Function', DependsOn: ['ApiLogGroup'], Properties: {
      FunctionName: label + '-api', Runtime: 'python3.13', Handler: 'index.handler', Role: att('ApiRole', 'Arn'),
      Timeout: 30, MemorySize: 256, ReservedConcurrentExecutions: 3, Code: { ZipFile: apiCode },
      Environment: { Variables: { INSTALLATION_ID: installationId, WORKSPACE: workspace, JOB_NAME: jobName,
        BUCKET: ref('DataBucket'), SIGNING_SECRET: ref('SigningSecret'), CLUSTER: ref('Cluster'), SUBNETS: ref('Subnet'),
        TASK_SECURITY_GROUP: ref('TaskSecurityGroup'), TASK_ROLE: att('TaskRole', 'Arn'), EXECUTION_ROLE: att('ExecutionRole', 'Arn'),
        TASK_FAMILY: label, REPOSITORY: att('Repository', 'RepositoryUri'), BUILD_PROJECT: ref('BuildProject'),
        S3_ACCESS: JSON.stringify(s3Access), S3_ROLE_ARN_PREFIX: sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + appRolePrefix),
        BUILD_LOG_GROUP: ref('BuildLogGroup'), RUN_LOG_GROUP: ref('RunLogGroup') } },
    } },
    ApiUrl: { Type: 'AWS::Lambda::Url', Properties: { AuthType: 'NONE', TargetFunctionArn: att('ApiFunction', 'Arn'),
      Cors: { AllowOrigins: [platformOrigin], AllowMethods: ['GET', 'POST'], AllowHeaders: ['authorization', 'content-type'], MaxAge: 300 } } },
    UrlPermission: { Type: 'AWS::Lambda::Permission', Properties: { FunctionName: ref('ApiFunction'), Action: 'lambda:InvokeFunctionUrl', Principal: '*', FunctionUrlAuthType: 'NONE' } },
    InvokePermission: { Type: 'AWS::Lambda::Permission', Properties: { FunctionName: ref('ApiFunction'), Action: 'lambda:InvokeFunction', Principal: '*', InvokedViaFunctionUrl: true } },
    SignerRole: role('lambda.amazonaws.com', [allow('secretsmanager:GetSecretValue', ref('SigningSecret')), logPolicy('SignerLogGroup')]),
    SignerFunction: { Type: 'AWS::Lambda::Function', DependsOn: ['SignerLogGroup'], Properties: {
      FunctionName: label + '-signer', Runtime: 'python3.13', Handler: 'index.handler', Role: att('SignerRole', 'Arn'), Timeout: 45,
      Code: { ZipFile: signerCode }, Environment: { Variables: { INSTALLATION_ID: installationId, WORKSPACE: workspace, OWNER: owner,
        ACCOUNT_ID: ref('AWS::AccountId'), API_URL: att('ApiUrl', 'FunctionUrl'), JOB_NAME: jobName,
        SIGNING_SECRET: ref('SigningSecret'), PLATFORM_ORIGIN: platformOrigin, S3_ACCESS: JSON.stringify(s3Access) } },
    } },
    ConnectionRole: { Type: 'AWS::IAM::Role', Properties: { RoleName: label + '-connection', AssumeRolePolicyDocument: {
      Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: platformPrincipal }, Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'sts:ExternalId': externalId } } }],
    }, Policies: [{ PolicyName: 'connection-only', PolicyDocument: { Version: '2012-10-17', Statement: [
      allow('lambda:InvokeFunction', att('SignerFunction', 'Arn')), allow('cloudformation:DescribeStacks', ref('AWS::StackId')),
    ] } }] } },
    Register: { Type: 'Custom::SmallConnection', Properties: { ServiceToken: att('SignerFunction', 'Arn'), ServiceTimeout: 90, RoleArn: att('ConnectionRole', 'Arn') } },
  };
  for (const [app, uri] of Object.entries(s3Access)) {
    // Hex encoding retains the entire name: no collisions between app names.
    const id = 'S3Task' + Array.from(app, (c) => c.charCodeAt(0).toString(16)).join('');
    Resources[id] = role('ecs-tasks.amazonaws.com', [allow('s3:GetObject', 'arn:aws:s3:::' + uri.slice(5) + '*', {
      StringEquals: { 's3:ResourceAccount': ref('AWS::AccountId'), 'aws:RequestedRegion': ref('AWS::Region') },
    })]);
    Resources[id].Properties.RoleName = appRolePrefix + app;
    Resources[id].Properties.AssumeRolePolicyDocument.Statement[0].Condition = {
      StringEquals: { 'aws:SourceAccount': ref('AWS::AccountId') },
      ArnLike: { 'aws:SourceArn': sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:*') },
    };
    const passRole = Resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.find((s) => s.Action === 'iam:PassRole');
    passRole.Resource.push(att(id, 'Arn'));
  }
  if (permissionsCode) {
    const prefix = 'small-s3-' + installationId.slice(0, 12) + '-';
    const roleArn = sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + prefix + '*');
    Resources.AccessTable = { Type: 'AWS::DynamoDB::Table', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
      BillingMode: 'PAY_PER_REQUEST', AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }], SSESpecification: { SSEEnabled: true },
    } };
    Resources.AccessBoundary = { Type: 'AWS::IAM::ManagedPolicy', Properties: {
      Description: 'App roles may only read S3 objects in this account and region. Only the AWS administrator can change this boundary.',
      PolicyDocument: { Version: '2012-10-17', Statement: [
        allow('s3:GetObject', 'arn:aws:s3:::*/*'),
        { Effect: 'Deny', NotAction: 's3:GetObject', Resource: '*' },
        { Effect: 'Deny', Action: 's3:GetObject', Resource: '*', Condition: { StringNotEquals: { 's3:ResourceAccount': ref('AWS::AccountId') } } },
        { Effect: 'Deny', Action: 's3:GetObject', Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ref('AWS::Region') } } },
      ] },
    } };
    Resources.AccessLogGroup = { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/aws/lambda/' + label + '-access', RetentionInDays: 7 } };
    Resources.AccessRole = role('lambda.amazonaws.com', [
      allow('iam:CreateRole', roleArn, { StringEquals: { 'iam:PermissionsBoundary': ref('AccessBoundary') } }),
      allow('iam:GetRole', roleArn),
      allow('iam:PutRolePolicy', roleArn, { StringEquals: { 'iam:PermissionsBoundary': ref('AccessBoundary') } }),
      allow(['dynamodb:GetItem', 'dynamodb:PutItem'], att('AccessTable', 'Arn')), logPolicy('AccessLogGroup'),
    ]);
    Resources.AccessFunction = { Type: 'AWS::Lambda::Function', DependsOn: ['AccessLogGroup'], Properties: {
      FunctionName: label + '-access', Runtime: 'python3.13', Handler: 'index.handler', Role: att('AccessRole', 'Arn'),
      Timeout: 30, ReservedConcurrentExecutions: 1, Code: { ZipFile: permissionsCode }, Environment: { Variables: {
        INSTALLATION_ID: installationId, WORKSPACE: workspace, OWNER: owner, ACCOUNT_ID: ref('AWS::AccountId'),
        ACCESS_TABLE: ref('AccessTable'), ACCESS_BOUNDARY: ref('AccessBoundary'), ACCESS_ROLE_PREFIX: prefix, S3_ACCESS: JSON.stringify(s3Access),
      } },
    } };
    for (const name of ['Api', 'Signer']) {
      Resources[name + 'Role'].Properties.Policies[0].PolicyDocument.Statement.push(
        allow('dynamodb:GetItem', att('AccessTable', 'Arn'), { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': ['state'] } }));
      Resources[name + 'Function'].Properties.Environment.Variables.ACCESS_TABLE = ref('AccessTable');
    }
    Resources.ApiFunction.Properties.Environment.Variables.ACCESS_ROLE_ARN_PREFIX = sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + prefix);
    Resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.find((s) => s.Action === 'iam:PassRole').Resource.push(roleArn);
    Resources.ConnectionRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource = [att('SignerFunction', 'Arn'), att('AccessFunction', 'Arn')];
  }
  for (const [id, service] of [['EcrApiEndpoint', 'ecr.api'], ['EcrDockerEndpoint', 'ecr.dkr'], ['LogsEndpoint', 'logs']]) {
    Resources[id] = { Type: 'AWS::EC2::VPCEndpoint', Properties: { VpcId: ref('Vpc'), VpcEndpointType: 'Interface',
      ServiceName: sub('com.amazonaws.${AWS::Region}.' + service), PrivateDnsEnabled: true,
      SubnetIds: [ref('Subnet')], SecurityGroupIds: [ref('EndpointSecurityGroup')] } };
  }
  if (privateGateway) {
    // Explicit compute allowlist: hosted grants, registration, external trust,
    // signing secrets and public function URLs never enter a private stack.
    const ids = ['Vpc', 'Subnet', 'RouteTable', 'RouteAssociation', 'EndpointSecurityGroup', 'TaskSecurityGroup',
      'S3Endpoint', 'EcrApiEndpoint', 'EcrDockerEndpoint', 'LogsEndpoint', 'DataBucket', 'BucketPolicy', 'Repository',
      'Cluster', 'RunLogGroup', 'BuildLogGroup', 'ApiLogGroup', 'TaskRole', 'ExecutionRole', 'BuildRole', 'BuildProject'];
    const compute = Object.fromEntries(ids.map((id) => [id, Resources[id]]));
    if (permissionsCode) {
      for (const id of ['AccessTable', 'AccessBoundary', 'AccessLogGroup', 'AccessRole', 'AccessFunction']) compute[id] = Resources[id];
      compute.AccessFunction.Properties.Timeout = 25;
      const appPrefix = 'small-app-' + installationId.slice(0, 12) + '-';
      const appRoleArn = sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + appPrefix + '*');
      // IAM forbids wildcards in an ARN's service segment. Ownership uses the
      // global context key; services without that key remain denied.
      const internalArns = ['lambda', 'logs', 'ecr', 'ecs', 'codebuild', 'dynamodb', 'cognito-idp'].flatMap((service) => [
        sub('arn:${AWS::Partition}:' + service + ':${AWS::Region}:${AWS::AccountId}:*${AWS::StackName}*'),
        sub('arn:${AWS::Partition}:' + service + ':${AWS::Region}:${AWS::AccountId}:*' + label + '*'),
      ]);
      // The old read-only boundary stays unchanged. New grants use new roles.
      compute.AppAccessBoundary = { Type: 'AWS::IAM::ManagedPolicy', Properties: {
        Description: 'Customer-configured application capabilities; each app still needs an exact approval.',
        PolicyDocument: { Version: '2012-10-17', Statement: [
          allow(ref('AppGrantActions'), '*'),
          { Effect: 'Deny', NotAction: ref('AppGrantActions'), Resource: '*' },
          { Effect: 'Deny', Action: '*', Resource: '*', Condition: { StringNotEquals: { 'aws:ResourceAccount': ref('AWS::AccountId') } } },
          { Effect: 'Deny', Action: 's3:*', Resource: '*', Condition: { StringNotEquals: { 's3:ResourceAccount': ref('AWS::AccountId') } } },
          { Effect: 'Deny', Action: '*', Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ref('AWS::Region') } } },
          { Effect: 'Deny', Action: '*', Resource: [
            ...internalArns,
            ref('ReleaseBucketArn'), sub('${ReleaseBucketArn}/*'),
          ] },
          { Effect: 'Deny', NotAction: 's3:GetObject', Resource: [att('DataBucket', 'Arn'), bucketObjects] },
          { Effect: 'Deny', Action: 's3:*', Resource: ['sources', 'deploys', 'runs', 'uploads', 'apps'].map((p) => sub('${DataBucket.Arn}/' + p + '/*')) },
        ] },
      } };
      compute.AccessRole.Properties.Policies[0].PolicyDocument.Statement.push(
        allow('iam:CreateRole', appRoleArn, { StringEquals: { 'iam:PermissionsBoundary': ref('AppAccessBoundary') } }),
        allow('iam:GetRole', appRoleArn),
        allow('iam:PutRolePolicy', appRoleArn, { StringEquals: { 'iam:PermissionsBoundary': ref('AppAccessBoundary') } }),
        allow('access-analyzer:ValidatePolicy', '*'));
      Object.assign(compute.AccessFunction.Properties.Environment.Variables, {
        APP_GRANTS: 'v1', APP_GRANT_ACTIONS: { 'Fn::Join': [',', ref('AppGrantActions')] },
        APP_ACCESS_ROLE_PREFIX: appPrefix, APP_ACCESS_BOUNDARY: ref('AppAccessBoundary'),
      });
      Resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.find((s) => s.Action === 'iam:PassRole').Resource.push(appRoleArn);
      Object.assign(Resources.ApiFunction.Properties.Environment.Variables, {
        APP_GRANTS: 'v1', APP_GRANT_ACTIONS: { 'Fn::Join': [',', ref('AppGrantActions')] },
        APP_ACCESS_ROLE_ARN_PREFIX: sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + appPrefix),
        ACCOUNT_ID: ref('AWS::AccountId'), FILE_INPUTS: 'v1',
      });
    }
    for (const [id, service] of [['LambdaEndpoint', 'lambda'], ['EcsEndpoint', 'ecs']]) {
      compute[id] = { Type: 'AWS::EC2::VPCEndpoint', Properties: { VpcId: ref('Vpc'), VpcEndpointType: 'Interface',
        ServiceName: sub('com.amazonaws.${AWS::Region}.' + service), PrivateDnsEnabled: true,
        SubnetIds: [ref('Subnet')], SecurityGroupIds: [ref('EndpointSecurityGroup')] } };
    }
    compute.JobApiRole = Resources.ApiRole;
    compute.JobApiRole.Properties.Policies[0].PolicyDocument.Statement = Resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement
      .filter((statement) => statement.Action !== 'secretsmanager:GetSecretValue');
    compute.JobApiFunction = Resources.ApiFunction;
    compute.JobApiFunction.Properties.Role = att('JobApiRole', 'Arn');
    compute.JobApiFunction.Properties.Handler = 'index.private_handler';
    compute.JobApiFunction.Properties.Timeout = 25;
    delete compute.JobApiFunction.Properties.Environment.Variables.SIGNING_SECRET;
    compute.JobApiFunction.Properties.Environment.Variables.PRIVATE_GATEWAY = 'true';
    return { Resources: compute, ...(permissionsCode ? { Parameters: {
      AppGrantActions: { Type: 'CommaDelimitedList',
        Default: 's3:GetObject,s3:PutObject,s3:ListBucket,lambda:InvokeFunction,ecs:DescribeTasks',
        AllowedPattern: '(?!(?:iam|sts|organizations|account|cloudformation):)[a-z0-9-]+:[A-Za-z][A-Za-z0-9]{0,99}',
        Description: 'Exact actions apps may request. Adding an action does not grant it to any app. No Small release is needed to change this setting.' },
      ReleaseBucketArn: { Type: 'String', AllowedPattern: 'arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',
        Description: 'Private installer artifact bucket, reserved from all app grants.' },
    } } : {}) };
  }
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'small BYOC preview: CPU jobs for one workspace. Customer data stays in this account.',
    Resources, Outputs: { ConnectionRoleArn: { Value: att('ConnectionRole', 'Arn') }, SignerArn: { Value: att('SignerFunction', 'Arn') },
      ApiUrl: { Value: att('ApiUrl', 'FunctionUrl') }, DataBucket: { Value: ref('DataBucket') },
      JobName: { Value: jobName }, ReturnToSmall: { Value: platformOrigin + '/apps' } } };
}
