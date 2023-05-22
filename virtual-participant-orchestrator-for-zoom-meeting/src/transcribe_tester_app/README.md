# Amazon Transcribe sample tester

## About

This small sample run as a standalone NodeJS app tests the Zoom Meeting virtual participant application functionality by streaming audio data from Amazon Kinesis Video Stream to Amazon Transcribe and logs transcription results to the console.

This project is based on [call_transcriber lambda function](https://github.com/aws-samples/amazon-transcribe-live-call-analytics/tree/develop/lca-chimevc-stack/lambda_functions/call_transcriber) in AWS LCA architecture built by Chris Lott and other contributors.

## Important

- As an AWS best practice, grant this code least privilege, or only the
  permissions required to perform a task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)
  in the *AWS Identity and Access Management User Guide*.
- This code has not been tested in all AWS Regions. Some AWS services are
  available only in specific AWS Regions. For more information, see the
  [AWS Regional Services List](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/)
  on the AWS website.
- Running this code might result in charges to your AWS account.

## Setup

### Prerequisites
Before running the code you will need

* An AWS account. To create an account, see [How do I create and activate a new AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/) on the AWS Premium Support website.
* AWS credentials. For details, see  [Setting credentials in Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) in the *AWS SDK for Javascript (v3) Developer Guide*.
* IAM access to read from Kinesis Video Stream (see [Controlling Access to Kinesis Video Streams Resources Using IAM](https://docs.aws.amazon.com/kinesisvideostreams/latest/dg/how-iam.html)) and permissions to transcribe with Amazon Transcribe (see [Identity and Access Management for Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/security-iam.html))

### Install dependencies
In this directory run:

```
npm install node -g
npm install
```

### Running the live transcriber code
To run execute: `node zoom-consumer.js <zoom-meeting-number> <stream-name>`

e.g.

```
node zoom-consumer.js 1111222233 zoom-meeting-1111222233-example-stream
```
> Note you can look up the Amazon Kinesis Stream *stream-name* above from AWS Console or using the AWS CLI.  The stream-name prefix is hardcoded as "zoom-meeting-". This is followed by the 10 digit <zoom-meeting-number> and ending with a suffix that was passed as an environment variable to the Zoom Meeting Windows SDK application `KVS_STREAM_SUFFIX` (see [README](../README.md#set-environment-variables)).

### Runinng S3 transcription viewer
To run execute: `stream-transcription-from-s3.js <s3-bucket-name> <meeting-number>.txt <optional-number-of-lines>`

e.g.
```
 node stream-transcription-from-s3.js zoom-transcript--test-bucket 82058782238.txt 5000
```
