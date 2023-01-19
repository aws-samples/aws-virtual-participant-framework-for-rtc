// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { ZoomMeetingBotCdkAppStack } from './zoom-meeting-bot-cdk-app-stack'
import { CodePipelineCustomActionStack } from './codepipeline-custom-action-stack';
import { WindowsContainerPipelineStack } from './windows-container-pipeline-stack';

export class ZoomMeetingBotCdkAppStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props?: cdk.StageProps) {
        super(scope, id, props);

        // from https://github.com/aws-samples/aws-codepipeline-custom-action
        // featured in https://aws.amazon.com/blogs/devops/building-windows-containers-with-aws-codepipeline-and-custom-actions/
        const codePipelineCustomActionStack = new CodePipelineCustomActionStack(this, 'CodePipelineCustomActionStack');
        const windowsContainerPipelineStack = new WindowsContainerPipelineStack(this, 'WindowsContainerPipelineStack');

        windowsContainerPipelineStack.addDependency(codePipelineCustomActionStack);

        const appStack = new ZoomMeetingBotCdkAppStack(this, 'PipelineAppStack');

        appStack.addDependency(windowsContainerPipelineStack);
    }
}