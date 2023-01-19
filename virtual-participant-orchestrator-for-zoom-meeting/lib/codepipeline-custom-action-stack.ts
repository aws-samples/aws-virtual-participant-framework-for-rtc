// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
 

import * as cdk from 'aws-cdk-lib';
import * as cfn_inc from "aws-cdk-lib/cloudformation-include";
import { Construct } from 'constructs';


export class CodePipelineCustomActionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const cfnTemplate = new cfn_inc.CfnInclude(this, 'Template', {
            templateFile: 'raw-templates/codepipeline-custom-action-deployment.yaml',
            parameters: {
                "CustomActionProviderVersion": "100"
            }
        });

    }

}