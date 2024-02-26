# Virtual Participant Framework for RTC on AWS

This is a sample solutions umbrella project for building AI powered virtual participants for Real-Time Communication (RTC) services like Zoom. This repository is under development.

> :warning: The Zoom Meeting sample **IS NO LONGER Functional**. As of Feb 3, 2024 the version of the Zoom Meeting Windows SDK used as a dependency is no longer compatible with Zoom Service. This means the sample app (i.e. the bot application that is created by Virtual Patricipant Framework) can no longer join a Zoom meeting as a participant.  Unfortunately newer versions of the Zoom Meeting Windows SDK wrappend in a Docker container can no longer stream media to Amazon Kinesis Video Stream rendering them incompatible with the sample. After a lengthy investigation we have not been able to resolve the compatiblity issue, highlighting the fragility of this sample solution. This bring our Virtual Participant Framework sample and the experiment to End of Life.  For any community support or questions please connect with the Zoom developer ecosystem team via the [Zoom Developer Forum](https://devforum.zoom.us/).

## Project Directory
* [Virtual Participant Orcestrator for Zoom Meeting](virtual-participant-orchestrator-for-zoom-meeting/README.md) [Ready for dev/test]

	> This project builds the containerized virtual participants that connect to Zoom Meeting(s) and streams it's multimedia to Amazon Kinesis Video Stream. 
	
	[virtual participant framework producer and consumder zoomtopia demo](https://user-images.githubusercontent.com/590609/215575041-1036dedb-e512-43fc-9af4-e44c680a8f8b.mov)


* [Amazon Transcribe Virtual Participant Connector for Zoom Meeting](amazon-transcribe-lca-virtual-participant-connector-for-zoom-meeting/README.md) [under development]

	>This project is under development and allows Zoom Meeting audio data streamed to KVS to be transcribed using Amazon Transcribe.
	
	[amazon transcribe virtual participant connector for zoom meeting zoomtopia demo](https://user-images.githubusercontent.com/590609/215573136-92636fc1-2db2-449c-bd94-0a677f188d13.mov)



Please reach out to contributors or your AWS account team regarding questions.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.
