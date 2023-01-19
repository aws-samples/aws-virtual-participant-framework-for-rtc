// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as cfn_inc from "aws-cdk-lib/cloudformation-include";
import { Construct } from 'constructs';


export class WindowsContainerPipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const cfnTemplate = new cfn_inc.CfnInclude(this, 'WindowsContainerPipelineTemplate', {
            templateFile: 'raw-templates/windows-container-pipeline-template.yaml',
            parameters: {
                "CustomActionProviderCategory": "Build",
                "CustomActionProviderName": "EC2-CodePipeline-Builder",
                "CustomActionProviderVersion": "100",
                "RepositoryArn": this.node.tryGetContext('codecommit_arn')
            }
        });

    }

}