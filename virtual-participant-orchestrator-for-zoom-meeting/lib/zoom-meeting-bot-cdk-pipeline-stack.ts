// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { ZoomMeetingBotCdkAppStage } from './zoom-meeting-bot-cdk-app-stage';

export class ZoomMeetingBotCdkPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repository = Repository.fromRepositoryArn(this, 'PipelineRepository', this.node.tryGetContext('codecommit_arn'));

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'CDKPipeline',
      dockerEnabledForSynth: true,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.codeCommit(repository, 'main'),
        commands: ['npm ci', 'npm run build', 'npx cdk synth']
      })
    });

    pipeline.addStage(new ZoomMeetingBotCdkAppStage(this, "PipelineAppStage", {
      env: { account: this.node.tryGetContext("account"), region: this.node.tryGetContext("region") }
    }));
  }
}
