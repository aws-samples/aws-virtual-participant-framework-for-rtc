#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ZoomMeetingBotCdkPipelineStack } from '../lib/zoom-meeting-bot-cdk-pipeline-stack';

const app = new cdk.App();
new ZoomMeetingBotCdkPipelineStack(app, 'ZoomMeetingBotCdkStack', {
  env: {
    account: app.node.tryGetContext("account"),
    region: app.node.tryGetContext("region"),
  }
});