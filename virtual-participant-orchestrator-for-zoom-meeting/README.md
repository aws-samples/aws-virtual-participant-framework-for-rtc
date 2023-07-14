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

* As an AWS best practice, follow the principle of least privilege, and only grant permissions required to perform a task in any shared AWS account, one holding sensitive data or tied to a production system. For more information, see [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) in the *AWS Identity and Access Management User Guide*. This sample solution in its current form is intended for sandbox dev/test environments and requires the AWS CLI user to have `AdministratorAccess`.
* This code has not been tested in all AWS Regions, only us-east-1. Some dependant AWS services are available only in specific AWS Regions. For more information, see the [AWS Regional Services List](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/) on the AWS website.  This sample solution is expected to function in any AWS Region where Amazon Kinesis Video Stream is available.
* Running this code will likely result in charges to your AWS account.
* If you are new to AWS, first follow [this tutorial](https://aws.amazon.com/getting-started/guides/setup-environment/) to get started with your AWS Account
  
## Setup

### Install Prerequisites

* An AWS test account with no access to sensitive or production data
* Ability to create an AWS IAM User, attach policies, and create access keys 
* [Install Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
* [Instal CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html)

  > Note: The AWS IAM user that performs actions via the AWS CLI **MUST have** `AdministratorAccess` priviledge for the account. You cannot proceed with this sample solution without that managed policy applied to the IAM User that connects to you AWS account via the CLI. It is strongly advised **NOT to use** the AWS account's `root` user to perform actions via the AWS CLI or API. Instead create a new IAM User with administrator access by following [Getting started with IAM Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/getting-started.html).

### Get Developer Keys from Zoom

The virtual participant runs as a Windows app built ontop of Zoom Meeting Windows SDK. For connectivity to Zoom Service you must register your Zoom Meeting SDK app:

1. Login to [Zoom App Marketplace](https://marketplace.zoom.us/) (Use your Zoom login - free accounts work!)
2. From the "Develop" drop-down choose "Build App"
3. From the options available "Create" a "Meeting SDK" app type and follow the instructions
4. In the resulting screen, click on "App Credential" from the sidebar to make note of **"SDK Key"** and **"SDK Secret"**

> Note: Leave browser tab open. Later you will need to download the Windows SDK from this screen using the "Download" option on the sidebar.

### Create Repository and Secrets for CDK Deployment

1. Create a new AWS CodeCommit repository, and change default branch to `main`

   Example on linux (replace `MyVPFRepoName` and description):

   ```shell
   export CODECOMMIT_REPO_NAME=MyVPFRepo
   aws codecommit create-repository --repository-name $CODECOMMIT_REPO_NAME --repository-description "My VPF repository"
   ```

   Example on windows (replace `MyVPFRepoName` and description):

   ```batch
   set CODECOMMIT_REPO_NAME=MyVPFRepo
   aws codecommit create-repository --repository-name %CODECOMMIT_REPO_NAME% --repository-description "My VPF repository"
   ```

2. Change CodeCommit repo's default branch to `main`

    On Linux:

    ```shell
    aws codecommit update-default-branch --repository-name $CODECOMMIT_REPO_NAME --default-branch-name main
    ```

    On Windows:

    ```batch
    aws codecommit update-default-branch --repository-name %CODECOMMIT_REPO_NAME% --default-branch-name main
    ```
   
3. Clone CodeCommit repo (see repository on AWS Console and [docs](https://docs.aws.amazon.com/codecommit/latest/userguide/repositories.html) for instructions) to a local directory that is outside the path of the directories cloned from GitHub.

    > Note: The CodeCommit repository will include proprietary and licensed Zoom Windows SDK files. Changes commited to the CodeCommit repo **should not** be pushed upstream to the OSS GitHub repository. If you are interested in contributing to the source that links to Zoom Window SDK libraries, please create a GitHub issue or reach out to the maintainers for instructions.

4. Ensure you are on the **main** branch (not **master**)

    ```shell
    git checkout main
    ```
    
5. Copy the contents of the [virtual-participant-orchestrator-for-zoom-meeting/](../virtual-participant-orchestrator-for-zoom-meeting/) subproject - not the root directory of the GitHub repo - to the local directory where the CodeCommit repo was cloned above.

6. From the CodeCommit console take note of the repository ARN from the "Repositories > Settings" side panel on the left.

7. Create an IAM user with the following attached policy statment. Be sure to replace AWS account ID and region in the **"Resource"** elements with the appropriate values:

    ```json
    "Statement": [
        {
            "Sid": "HandCraftedForVPF0",
            "Effect": "Allow",
            "Action": [
                "kinesisvideo:PutMedia",
                "kinesisvideo:GetDataEndpoint",
                "kinesisvideo:DescribeStream",
                "kinesisvideo:CreateStream",
                "sns:Publish"
            ],
            "Resource": [
                "arn:aws:kinesisvideo:us-east-1:111111111111:stream/*/*",
                "arn:aws:sns:us-east-1:111111111111:*"
            ]
        }
    ]
    ```

    > Note: This is not the same IAM User as the one for the administrator performing deployments via the AWS CLI. This new IAM User policy follows least privillage principal and is assigned in runtime to Amazon ECS tasks that connect to Zoom as a virtual participant. Please see [Controlling access to Kinesis Video Streams resources using IAM](https://docs.aws.amazon.com/kinesisvideostreams/latest/dg/how-iam.html) and [Identity and access management in Amazon SNS](https://docs.aws.amazon.com/sns/latest/dg/security-iam.html) for more details.

8. From IAM Console create access keys for the user ([Learn more](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)).

    > Note: Do not download .csv file. Instead keep the browser tab open until you record the **"access key"** and **"secret access key"** securely in AWS Secret Manager in the next step. In case you accidentally closed this tab, simply create a new accessss key and make the old one inactive.

9. Create two secrets in AWS Secrets Manager named `zoomsecret` and `usersecret`.

    The secret `usersecret` plaintext value should use the following format:

    ```json
    {"AWS_ACCESS_KEY_ID":"<above_IAM_User_access_key","AWS_SECRET_ACCESS_KEY":"above_IAM_User_secret_key"}
    ```

    The secret `zoomsecret` plaintext value should use the following format:

    ```json
    {"ZOOM_APP_KEY":"<Zoom_app_SDK_Key_or_Client_ID>","ZOOM_APP_SECRET":"<Zoom_app_SDK_Secret_or_Client_Secret"}
    ```

10. Update `cdk.json` with the following updated attributes:

    * `account`
    * `region`
    * `codecommit_arn`
    * `zoomsecret_arn`
    * `usersecret_arn`

### Apply Zoom SDK Patch

1. Download the `zoom-sdk-windows-5.14.10.17290.zip` code archive from the [Zoom App Marketplace](https://marketplace.zoom.us/docs/sdk/native-sdks/windows/).

2. Unzip the code archive to the `src` directory, so there is a `src/zoom-sdk-windows-5.14.10.17290` path.

3. Apply the Zoom Windows SDK patch:

    ```shell
    git apply -p1 --directory src/zoom-sdk-windows-5.14.10.17290 --verbose --reject --whitespace=fix src/zoom_sdk_demo_v2.patch
    ```

### Package CloudFormation Template

1. Create S3 bucket:

    a) Create an environment variable for `CF_TEMPLATE_S3_BUCKET`

    Example on linux (replace account # and region):

    ```shell
    export CF_TEMPLATE_S3_BUCKET=codepipeline-custom-action-111111111111-us-west-2
    ```

    Example on Windows (replace account # and region):

    ```batch
    set CF_TEMPLATE_S3_BUCKET=codepipeline-custom-action-111111111111-us-west-2
    ```

    b) Create bucket:

    On Linux:

    ```shell
    aws s3 mb s3://$CF_TEMPLATE_S3_BUCKET
    ```

    On Windows:

    ```batch
    aws s3 mb s3://%CF_TEMPLATE_S3_BUCKET%
    ```

2. Package template:

    On Linux:

    ```shell
    aws cloudformation package --template-file raw-templates/codepipeline-custom-action-template.yaml --output-template-file raw-templates/codepipeline-custom-action-deployment.yaml --s3-bucket $CF_TEMPLATE_S3_BUCKET
    ```

    On Windows:

    ```batch
    aws cloudformation package --template-file raw-templates/codepipeline-custom-action-template.yaml --output-template-file raw-templates/codepipeline-custom-action-deployment.yaml --s3-bucket %CF_TEMPLATE_S3_BUCKET%
    ```

### Deploy CDK Application

1. Install required dependencies:

    ```shell
    npm install
    ```

2. Bootstrap your account/region for CDK deployment:

    ```shell
    cdk bootstrap
    ```

3. Commit all changes to git and push code to your CodeCommit repository (Do not push upstream to GitHub):

    ```shell
    git add .
    git commit -m 'init'
    git push -u origin main
    ```

4. Synthesize the CDK application into deployment templates:

    ```shell
    cdk synth
    ```

5. Deploy the CDK application:

    ```shell
    cdk deploy
    ```
___
🟩 The `cdk deploy` task completes in less than 15 minutes. However, the overall deployment takes about **2️⃣ hours** to complete due to the long Windows container image build cycle. If successful, you should see a container image tagged as *latest* in an Amazon ECR repository named **zoom-virtual-participant-windows**. You must wait for this image to appear in the ECR repo before proceeding further. To track deployment progress you can look at the infrastructure as code deployment pipelines in AWS CodePipeline generated by CDK. 
___
🟥 If container image in ECR repository does not show up well beyond 2 hours, log into AWS console using the admin user and:
1. Check both **CDKPipeline** and **windows-container-cicd-pipeline** pipelines are green in CodePipeline. Then,
2. Check the status latest execution of the **ec2-codepipeline-builders-build-flow** state machine in AWS StepFunction. And finally,
3. Inspect the windows build and container image generation build logs in the latest AWS CloudWatch log stream under the log group beggining with **/aws/ssm/PipelineAppStage-CodePipelineCustomActionStack-RunBuildJobOnEc2Instance-**
4. To re-attempt a new deployment you must first follow steps 2, 3, and 4 in [Clean up](#clean-up)
___

### Run Virtual Participant Demo

1. Edit the following attributes in the `etc/run-task.json` file:

    * `cluster` (from ECS console)
    * `subnets` (private subnet IDs with names ending with **"private-zoom-Subnet#"** with # as 1, 2, or 3, ...)
    * `securityGroups` (SG IDs with the field **"Security group name"** as **"Fargate"**)
    * `taskDefinition` (from ECS console)

2. Run the following command to start a new ECS Fargate task:

    ```shell
    aws ecs run-task --cli-input-json file://etc/run-task.json
    ```

3. Start a Zoom meeting with a desktop/web/mobile client.

4. After the Fargate task has successfully started running, use the following payload for the FargateClientLambda lambda function to join the Zoom Meeting:

    Be sure to edit the IP address (from Fargate task), meeting ID, and passcode

    ```json
    {
        "ip_address": "10.0.0.10",
        "path": "join",
        "meeting_id": "1111111111",
        "meeting_passcode": "aaaaaa",
        "display_name": "vpf-on-fargate-1"
    }
    ```

5. After the virtual participant has joined, allow the virtual participant to locally record the meeting.

## Run Amazon Transcribe Tester NodeJS app

To see live transcription of Zoom Meeting audio and verify transcription, run the tester app in the [transcribe_tester_app](src/transcribe_tester_app/) folder.  See [transcribe_tester_app/README.md](src/transcribe_tester_app/README.md) for details.

## Clean Up

To cleanup complete these tasks:

1. To leave the meeting, use the following payload for the FargateClientLambda lambda function.

    Be sure to edit the IP address (from Fargate task), meeting ID, and passcode

    ```json
    {
        "ip_address": "10.0.0.10",
        "path": "leave",
        "meeting_id": "1111111111",
        "meeting_passcode": "aaaaaa",
        "display_name": "vpf-on-fargate-1"
    }
    ```

2. Remove the CDK stack with the `cdk destroy` command

___
🟥 If `cdk deploy` fails, you must delete the AWS CloudFormation stacks manually in the following sequence (most recent to oldest) starting deletion of one stack only after the previous stack is successfully deleted: _1/_ **PipelineAppStage-PipelineAppStack** _2/_ **PipelineAppStage-WindowsContainerPipelineStack** _3/_ **PipelineAppStage-CodePipelineCustomActionStack** _4/_ **ZoomMeetingBotCdkStack** _5/_ **CDKToolkit**. 

If you accidentally hit delete on all the stacks same time, or did not follow the one step process above, the CloudFormation stacks enter a bad state. This prevents some of stacks from being deleted. Deleting stacks out of sequence causes an IAM Role which stacks depend on to be disposed prematurely. To resolve, first manually re-create the IAM role: `cdk-hnb659fds-cfn-exec-role-<aws_acct_number>-<aws_region>` (replacing aws account number and region). Then provide assume rights to CloudFormation via the role's "Trust relationships" tab in the AWS IAM console Role view. Then assign `AdministratorAccess` to the role in console view's "Permissions" tab. Finally delete the stacks following the remaining sequence mentioned above.
____

3. Cleanup the s3 bucket and remove it
4. Delete AWS CodeCommit repository
5. Remove secrets stored in AWS Secret Manager
6. Delete the IAM user with Amazon KVS and Amazon SNS access policy


## Credits

This prototype includes modified CloudFormation templates from the [open source repository](https://github.com/aws-samples/aws-codepipeline-custom-action) featured in the AWS blog post, ["Building Windows containers with AWS CodePipeline and custom actions"](https://aws.amazon.com/blogs/devops/building-windows-containers-with-aws-codepipeline-and-custom-actions/).

We'd like to thank the Zoom Developer Platform team for their support and guidance in building this solution.
