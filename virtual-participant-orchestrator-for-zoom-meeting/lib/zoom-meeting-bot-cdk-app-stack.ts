// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Fn, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from "aws-cdk-lib/aws-iam";
import { Code, Function, InlineCode, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import * as logs from "aws-cdk-lib/aws-logs";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from 'constructs';
import path = require('path');

const lambdaLayerLookup = {
    "ap-northeast-1": "249908578461",
    "us-east-1": "668099181075",
    "ap-southeast-1": "468957933125",
    "eu-west-1": "399891621064",
    "us-west-1": "325793726646",
    "ap-east-1": "118857876118",
    "ap-northeast-2": "296580773974",
    "ap-northeast-3": "961244031340",
    "ap-south-1": "631267018583",
    "ap-southeast-2": "817496625479",
    "ca-central-1": "778625758767",
    "eu-central-1": "292169987271",
    "eu-north-1": "642425348156",
    "eu-west-2": "142628438157",
    "eu-west-3": "959311844005",
    "sa-east-1": "640010853179",
    "us-east-2": "259788987135",
    "us-west-2": "420165488524",
    "cn-north-1": "683298794825",
    "cn-northwest-1": "382066503313",
    "us-gov-west": "556739011827",
    "us-gov-east": "138526772879"
}

export class ZoomMeetingBotCdkAppStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = this.buildVpc();

        const s3GatewayEndpoint = vpc.addGatewayEndpoint('s3-endpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });
        const secretsManagerInterfaceEndpoint = vpc.addInterfaceEndpoint('sm-endpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        });
        const ecrInterfaceEndpoint = vpc.addInterfaceEndpoint('ecr-endpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
            subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        });
        const ecrDockerInterfaceEndpoint = vpc.addInterfaceEndpoint('ecr-docker-endpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
        });
        const snsInterfaceEndpoint = vpc.addInterfaceEndpoint('sns-endpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SNS,
            subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
        });

        const fargateResources = this.buildFargateResources(vpc);

        const fargateClientLambda = new Function(this, 'FargateClientFunction', {
            runtime: Runtime.PYTHON_3_7,
            handler: 'index.lambda_handler',
            code: Code.fromAsset(path.join(__dirname, 'lambda-py37/fargate-client')),
            vpc: vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [fargateResources.securityGroup],
        });

        const layerAccount = lambdaLayerLookup[this.node.tryGetContext("region") as keyof typeof lambdaLayerLookup];

        fargateClientLambda.addLayers(LayerVersion.fromLayerVersionArn(this, "PythonLambdaLayer", `arn:aws:lambda:${cdk.Aws.REGION}:${layerAccount}:layer:AWSLambda-Python-AWS-SDK:4`));
    }

    private buildVpc(): cdk.aws_ec2.Vpc {
        const vpc = new ec2.Vpc(this, 'zoom-cdk-vpc', {
            cidr: '10.0.0.0/16',
            maxAzs: 2,
            subnetConfiguration: [
                {
                    name: 'private-zoom-',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
                {
                    name: 'public-zoom-',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                }
            ],
        });

        return vpc;
    }

    private buildFargateResources(vpc: cdk.aws_ec2.Vpc) {

        const cluster = new ecs.Cluster(this, 'FargateCluster', {
            vpc: vpc,
        });

        const cfnClusterCapacityProviderAssociations = new ecs.CfnClusterCapacityProviderAssociations(this, 'CapacityProviderAssociations', {
            cluster: cluster.clusterName,
            capacityProviders: [
                'FARGATE_SPOT',
                'FARGATE'
            ],
            defaultCapacityProviderStrategy: [
                {
                    'capacityProvider': 'FARGATE'
                }
            ]
        });

        const taskDefinition = new ecs.TaskDefinition(this, 'ZoomTaskDefinition', {
            memoryMiB: '4096',
            cpu: '2048',
            compatibility: ecs.Compatibility.FARGATE,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.WINDOWS_SERVER_2019_CORE
            },
        });

        const importedContainerRepositoryArn = cdk.Fn.importValue('DockerRepositoryArn');
        const importedContainerRepositoryName = cdk.Fn.importValue('DockerRepositoryName');

        const repo = ecr.Repository.fromRepositoryAttributes(this, 'ZoomMeetingBotRepo', {
            "repositoryName": importedContainerRepositoryName.toString(),
            "repositoryArn": importedContainerRepositoryArn.toString()
        });

        const zoomSecret = sm.Secret.fromSecretCompleteArn(this, "ZoomSecret", this.node.tryGetContext('zoomsecret_arn'))
        const userSecret = sm.Secret.fromSecretCompleteArn(this, "UserSecret", this.node.tryGetContext('usersecret_arn'))

        const topic = new sns.Topic(this, "ZoomTopic");

        const container = taskDefinition.addContainer('zoom-meeting-bot-container', {
            image: ecs.ContainerImage.fromEcrRepository(repo),
            entryPoint: ["sdk_demo_v2.exe"],
            essential: true,
            logging: ecs.LogDrivers.awsLogs({streamPrefix: 'zoom-task-group-logs', logRetention: 30}),
            environment: {
                "KVS_STREAM_SUFFIX": "zoom",
                "AWS_DEFAULT_REGION": this.node.tryGetContext('region'),
                "SNS_TOPIC_ARN": topic.topicArn,
                "GST_DEBUG": "4"
            },
            secrets: {
                "AWS_ACCESS_KEY_ID": ecs.Secret.fromSecretsManager(userSecret, "AWS_ACCESS_KEY_ID"),
                "AWS_SECRET_ACCESS_KEY": ecs.Secret.fromSecretsManager(userSecret, "AWS_SECRET_ACCESS_KEY"),
                "ZOOM_APP_KEY": ecs.Secret.fromSecretsManager(zoomSecret, "ZOOM_APP_KEY"),
                "ZOOM_APP_SECRET": ecs.Secret.fromSecretsManager(zoomSecret, "ZOOM_APP_SECRET")
            }
        });

        taskDefinition.taskRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AmazonECSTaskExecutionRolePolicy"
            )
        );

        taskDefinition.taskRole.attachInlinePolicy(new iam.Policy(this, 'task-policy', {
            statements: [
                new iam.PolicyStatement({
                    actions: ["ssmmessages:CreateControlChannel",
                        "ssmmessages:CreateDataChannel",
                        "ssmmessages:OpenControlChannel",
                        "ssmmessages:OpenDataChannel"],
                    resources: ['*'],
                }),
                new iam.PolicyStatement({
                    actions: ["secretsmanager:GetSecretValue"],
                    resources: [
                        this.node.tryGetContext('zoomsecret_arn'),
                        this.node.tryGetContext('usersecret_arn')
                    ],
                }),
                new iam.PolicyStatement({
                    actions: [
                        "kinesisvideo:CreateStream",
                        "kinesisvideo:PutMedia",
                        "kinesisvideo:GetDataEndpoint",
                        "kinesisvideo:DescribeStream"],
                    resources: ['*'],
                })
            ],
        }));

        const logGroup = new logs.LogGroup(this, 'FarGateLogGroup');

        const logDriver = new ecs.AwsLogDriver({
            logGroup: logGroup,
            streamPrefix: "ZoomMeetingBotFargateTask"
        });

        const securityGroup = new ec2.SecurityGroup(this, 'FargateSecurityGroup', {
            vpc: vpc,
            securityGroupName: "Fargate",
            description: "Allow access to fargate",
        });

        securityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.allTraffic(),
        );

        securityGroup.addIngressRule(
            ec2.Peer.ipv4('10.0.0.0/16'),
            ec2.Port.allTraffic()
        )

        return { cluster, taskDefinition, securityGroup };
    }
}