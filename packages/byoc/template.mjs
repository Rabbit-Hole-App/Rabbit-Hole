// One workspace connection, multiple CPU jobs. Shared by dev and tests.
const ref = (name) => ({ Ref: name });
const att = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const sub = (value) => ({ 'Fn::Sub': value });
const allow = (Action, Resource, Condition) => ({ Effect: 'Allow', Action, Resource, ...(Condition ? { Condition } : {}) });
const trust = (service) => ({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: service }, Action: 'sts:AssumeRole' }] });
const role = (service, statements) => ({ Type: 'AWS::IAM::Role', Properties: {
  AssumeRolePolicyDocument: trust(service), Policies: [{ PolicyName: 'small-job', PolicyDocument: { Version: '2012-10-17', Statement: statements } }],
} });

export function makeTemplate({ apiCode, signerCode, installationId, externalId, workspace, owner, platformPrincipal, platformOrigin, jobName }) {
  if (!/^[a-f0-9]{32}$/.test(installationId) || !/^[a-f0-9]{64}$/.test(externalId)) throw new Error('Invalid installation ID');
  if (!/^[a-z0-9-]{1,40}$/.test(jobName)) throw new Error('Invalid job name');
  const label = 'small-byoc-' + installationId.slice(0, 12);
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
        SIGNING_SECRET: ref('SigningSecret'), PLATFORM_ORIGIN: platformOrigin } },
    } },
    ConnectionRole: { Type: 'AWS::IAM::Role', Properties: { RoleName: label + '-connection', AssumeRolePolicyDocument: {
      Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: platformPrincipal }, Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'sts:ExternalId': externalId } } }],
    }, Policies: [{ PolicyName: 'connection-only', PolicyDocument: { Version: '2012-10-17', Statement: [
      allow('lambda:InvokeFunction', att('SignerFunction', 'Arn')), allow('cloudformation:DescribeStacks', ref('AWS::StackId')),
    ] } }] } },
    Register: { Type: 'Custom::SmallConnection', Properties: { ServiceToken: att('SignerFunction', 'Arn'), ServiceTimeout: 90, RoleArn: att('ConnectionRole', 'Arn') } },
  };
  for (const [id, service] of [['EcrApiEndpoint', 'ecr.api'], ['EcrDockerEndpoint', 'ecr.dkr'], ['LogsEndpoint', 'logs']]) {
    Resources[id] = { Type: 'AWS::EC2::VPCEndpoint', Properties: { VpcId: ref('Vpc'), VpcEndpointType: 'Interface',
      ServiceName: sub('com.amazonaws.${AWS::Region}.' + service), PrivateDnsEnabled: true,
      SubnetIds: [ref('Subnet')], SecurityGroupIds: [ref('EndpointSecurityGroup')] } };
  }
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'small BYOC preview: CPU jobs for one workspace. Customer data stays in this account.',
    Resources, Outputs: { ConnectionRoleArn: { Value: att('ConnectionRole', 'Arn') }, SignerArn: { Value: att('SignerFunction', 'Arn') },
      ApiUrl: { Value: att('ApiUrl', 'FunctionUrl') }, DataBucket: { Value: ref('DataBucket') },
      JobName: { Value: jobName }, ReturnToSmall: { Value: platformOrigin + '/apps' } } };
}
