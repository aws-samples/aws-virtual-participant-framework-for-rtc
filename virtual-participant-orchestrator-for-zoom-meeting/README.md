# Virtual Participant Orchestrator for Zoom Meeting

## About

This virtual participant orchestrator for Zoom Meeting is developed by AWS Prototyping and Cloud Engineering (PACE) team and Solutions Architects. The objectives of this prototype include:

* successfully capturing audio from a Zoom meeting, and publishing to Amazon Kinesis Video Streams within the Zoom Meeting C++ SDK for Windows demo application
* successfully publishing messages to Amazon Simple Notification Service (SNS) within the Zoom Meeting C++ SDK for Windows demo application
* packaging the orchestrator architecture and Zoom meeting SDK based virtual participant app as a standalone, deployable artifact

> :warning: This sample **IS NOT PRODUCTION READY!** and should serve as an example and for learning purposes.

## Architecture

![Prototype Architecture](docs/images/Zoom-Virtual-Participant.png)

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

### Install Prerequisites

* [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
* [Install AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
* Git


### Get Developer Keys from Zoom

The virtual participant runs as a Windows app built ontop of Zoom Meeting Windows SDK. For connectivity to Zoom Service you must register your Zoom Meeting SDK app:

1. Login to [Zoom App Marketplace](https://marketplace.zoom.us/) (Use your Zoom login - free accounts work!)
2. From the "Develop" drop-down choose "Build App"
3. From the options available "Create" a "Meeting SDK" app type and follow the instructions
4. In the resulting screen, click on "App Credential" from the sidebar to make note of **"SDK Key"** and **"SDK Secret"** 

> Note: Leave browser tab open. Later you will need to download the Windows SDK from this screen using the "Download" option on the sidebar.

### Create Repository and Secrets for CDK Deployment

1. Create a new AWS CodeCommit repository, and clone it to a local directory that is outside the path of the directories cloned from GitHub.
> Note: The CodeCommit repository will include proprietary and licensed Zoom Windows SDK files. Changes commited to the CodeCommit repo **should not** be pushed upstream to the OSS GitHub repository. If you are interested in contributing to the source that links to Zoom Window SDK libraries, please create a GitHub issue or reach out to the maintainers for instructions.

2. Copy the contents of [this subproject](../virtual-participant-orchestrator-for-zoom-meeting/) (not the root directory of this GitHub repo) to the root directory of the CodeCommit local repo (the one you created in the above step).
 
3. Create two secrets in AWS Secrets Manager named `zoomsecret` and `usersecret`. 

    The secret `usersecret` plaintext value should use the following format:

    ```
    {"AWS_ACCESS_KEY_ID":"<your_IAM_User_access_key","AWS_SECRET_ACCESS_KEY":"your_IAM_User_secret_key"}
    ```

    The secret `zoomsecret` plaintext value should use the following format:
    
    ```
    {"ZOOM_APP_KEY":"<Zoom_app_SDK_key>","ZOOM_APP_SECRET":"<Zoom_app_SDK_secret"}
    ```

5. Update `cdk.json` with the following updated attributes:
    
    * `account`
    * `region`
    * `codecommit_arn`
    * `zoomsecret_arn`
    * `usersecret_arn`

### Apply Zoom SDK Patch

1. Download the `zoom-sdk-windows-5.11.1.6653.zip` code archive from the [Zoom App Marketplace](https://marketplace.zoom.us/docs/sdk/native-sdks/windows/).

2. Unzip the code archive to the `src` directory, so there is a `src/zoom-sdk-windows-5.11.1.6653` path.

3. Apply the Zoom Windows SDK patch:

    ```
    git apply -p1 --directory src/zoom-sdk-windows-5.11.1.6653 --verbose --reject --whitespace=fix src/zoom_sdk_demo_v2.patch
    ```

### Package CloudFormation Template

1. Create S3 bucket:

	a) Create an environment variable for `CF_TEMPLATE_S3_BUCKET` 
	
	Example on linux: `export CF_TEMPLATE_S3_BUCKET=codepipeline-custom-action-111111111111-us-west-2`
    
    Example on Windows: `set CF_TEMPLATE_S3_BUCKET=codepipeline-custom-action-111111111111-us-west-2`
    
    b) Create bucket:
    
    on Linux:
    
    ```
    aws s3 mb s3://$CF_TEMPLATE_S3_BUCKET
    ```
    
    on Windows:
    
    ```
    aws s3 mb s3://%CF_TEMPLATE_S3_BUCKET%
    ```

2. Package template:

	On Linux:

    ```
    aws cloudformation package --template-file raw-templates/codepipeline-custom-action-template.yaml --output-template-file raw-templates/codepipeline-custom-action-deployment.yaml --s3-bucket $CF_TEMPLATE_S3_BUCKET
    ```
    
    On Windows:

    ```
    aws cloudformation package --template-file raw-templates/codepipeline-custom-action-template.yaml --output-template-file raw-templates/codepipeline-custom-action-deployment.yaml --s3-bucket %CF_TEMPLATE_S3_BUCKET%
    ```

### Deploy CDK Application

1. Commit all changes to git and push code to your CodeCommit repository (Do not push upstream to GitHub):

    ```
    git add .
    git commit -m 'init'
    git push
    ```

2. Install required dependencies:

    ```
    npm install
    ```

3. Bootstrap your account/region for CDK deployment:

    ```
    cdk bootstrap
    ```

4. Synthesize the CDK application into deployment templates:

    ```
    cdk synth
    ```

5. Deploy the CDK application:

    ```
    cdk deploy
    ```

### Run Virtual Participant Demo

1. Edit the following attributes in the `etc/run-task.json` file:

    * `cluster`
    * `subnets`
    * `securityGroups`
    * `taskDefinition`

2. Run the following command to start a new ECS Fargate task:

    ```
    aws ecs run-task --cli-input-json file://etc/run-task.json
    ```

3. Start a Zoom meeting with a desktop/web/mobile client.

4. After the Fargate task has successfully started running, use the following payload for the FargateClientLambda lambda function to join the Zoom Meeting:

    Be sure to edit the IP address (from Fargate task), meeting ID, and passcode
    
    ```
    {
        "ip_address": "10.0.0.10",
        "path": "join",
        "meeting_id": "1111111111",
        "meeting_passcode": "aaaaaa",
        "display_name": "fargate"
    }
    ```

5. After the virtual participant has joined, allow the virtual participant to locally record the meeting.

6. To leave the meeting, use the following payload for the FargateClientLambda lambda function.

    Be sure to edit the IP address (from Fargate task), meeting ID, and passcode
    
    ```
    {
        "ip_address": "10.0.0.10",
        "path": "leave",
        "meeting_id": "1111111111",
        "meeting_passcode": "aaaaaa",
        "display_name": "fargate"
    }
    ```

## Run Amazon Transcribe Tester NodeJS app 

To see live transcription of Zoom Meeting audio and verify transcription, run the tester app in the [transcribe_tester_app](src/transcribe_tester_app/) folder.  See [transcribe_tester_app/README.md](src/transcribe_tester_app/README.md) for details.
    
## Clean Up

To cleanup complete these tasks:

1. Remove the CDK stack with the `cdk destroy` command. 
2. Cleanup the s3 bucket and remove it
3. Remove secrets stored in AWS Secret Manager
4. Delete AWS CodeCommit repository

## Credits

This prototype includes modified CloudFormation templates from the [open source repository](https://github.com/aws-samples/aws-codepipeline-custom-action) featured in the AWS blog post, ["Building Windows containers with AWS CodePipeline and custom actions"](https://aws.amazon.com/blogs/devops/building-windows-containers-with-aws-codepipeline-and-custom-actions/).

We'd like to thank the Zoom Developer Platform team for their support and guidance in building this solution.