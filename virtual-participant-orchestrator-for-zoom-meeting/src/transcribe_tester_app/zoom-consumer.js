// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { TranscribeStreamingClient, StartStreamTranscriptionCommand, StartStreamTranscriptionCommandInput } = require("@aws-sdk/client-transcribe-streaming");
const { S3Client, PutObjectCommand } =  require("@aws-sdk/client-s3");

const { Worker } = require('worker_threads')
const fs = require('fs');
const stream = require('stream');
const util = require('util');
const magic_term = require('terminal-kit').terminal;

const REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const TEMP_FILE_PATH = process.env.TEMP_FILE_PATH || './raw_recordings/';
const IS_CONTENT_REDACTION_ENABLED = (process.env.IS_CONTENT_REDACTION_ENABLED || "true") === "true";
const TRANSCRIBE_LANGUAGE_CODE = process.env.TRANSCRIBE_LANGUAGE_CODE || 'en-US';
const CONTENT_REDACTION_TYPE = process.env.CONTENT_REDACTION_TYPE || 'PII';
const PII_ENTITY_TYPES = process.env.PII_ENTITY_TYPES || 'SSN';
const CUSTOM_VOCABULARY_NAME = process.env.CUSTOM_VOCABULARY_NAME || '';
const TIMEOUT = 1000000;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';  // 
const isLambda = !!process.env.LAMBDA_TASK_ROOT;

const s3Client = new S3Client({region:REGION});

// should remove these from global variables
let currentSpeaker = '';
let currentTranscript = '';
let speechSegments = [];

let currentFragment = '';
let sessionId = '';
let timeToStop = false;
let stopTimer = undefined;

const writeTranscriptToS3 = async function writeTranscriptToS3(meetingId, transcriptStr) {
  
  try {
    console.log("Writing to s3");
    //concurrent VPFs in a single meeting will have contentions
    //subsequent VPF joining the meeting overwrites s3 file
    //TODO: based on lambda context and or VPF-uid handle writes to s3 differently

    const command = new PutObjectCommand({
      Bucket:S3_BUCKET_NAME,
      Key: meetingId + ".jsonl",
      Body: Buffer.from(transcriptStr, 'binary'),
    });
    
    const response = await s3Client.send(command);
    console.log(response);

  } catch(error) {
    console.error("Error writing to s3");
    console.error(error);
  }
  

}

const updateUI = function updateUI(writeAsNewLine) {
  /*message = currentFragment + " " + currentSpeaker + ": " + currentTranscript;
  if(writeAsNewLine){
    magic_term('\n' + message );
  }else{
    magic_term(message);
  }*/
}

//returns a promise, so we can await it
const runKVSWorker = function (workerData, streamPipe) {
  let newWorker = undefined;

  let workerPromise = new Promise((resolve, reject) => {
    newWorker =  new Worker('./zoom-kvsWorker.js', { workerData });
    newWorker.on('message', (message) => {
      if(message.type === 'chunk') {
        //console.log('writing chunk to ffmpeg');
        try { 
          streamPipe.write(message.chunk);
         // console.log(util.inspect(message.chunk));
        } catch(error) {
          console.log('error writing to pipe', error);
        }
      }
      if (message.type === 'speaker_change') {
        currentSpeaker = message.speaker;
      //  updateUI(true);
      }
      if (message.type === 'new_fragment') {
        currentFragment = message.fragment;
        console.log("=== new Fragment === " + currentFragment + " " + currentSpeaker + ": " + currentTranscript);
        //updateUI(true);
      }
      if(message.type === 'lastFragment') {
        console.log('last fragment:', message.streamName, message.lastFragment);
        resolve(message.lastFragment);
      }
    });
    newWorker.on('error', reject);
    newWorker.on('exit', (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
  workerPromise.worker = newWorker;
  return workerPromise;
}

 const readTranscripts = async function (tsStream, meetingId) {
  try {
    for await (const chunk of tsStream) {
      try {
        const result = chunk.TranscriptEvent.Transcript.Results[0]; 
        //updateUI(true);
        if (result && result.IsPartial === false) {
          const items = result.Alternatives[0].Items;

          let currentSpeaker = null;
          let currentSpeechSegment = {
            Speaker: "",
            Transcript: "",
            Date: new Date().toISOString()
          }
          for (let item of items) {
            if(item.Type){
              if(item.Type !== 'punctuation'){
                if (item.Speaker !== currentSpeaker) {
                  // console.log("current speaker ---> " + currentSpeaker);
                  // console.log(util.inspect(items));

                  currentSpeaker = item.Speaker;
                  currentSpeechSegment = {
                    Speaker: currentSpeaker,
                    Transcript: "",
                    Date: new Date().toISOString()
                  }
                  speechSegments.push(currentSpeechSegment);
                } 
                currentSpeechSegment.Transcript += ' ' + item.Content; 
              } else { 
                //don't add space before punctuation
                currentSpeechSegment.Transcript += item.Content; 
              }
           }
          }

          let transcriptStr = "";

          for (let segment of speechSegments){
            transcriptStr += JSON.stringify(segment) + "\n";
          }

          console.log("=== Segments ===");
          console.log(JSON.stringify(transcriptStr));
            
          writeTranscriptToS3(meetingId, transcriptStr);
        }
      } catch(err){
        console.error("Error writing transcription chunk.", JSON.stringify(err));
        console.log(err);
      }
    }
  } catch(error) {
    console.error("Error writing transcription segment.", JSON.stringify(error));
    console.log(error);
  } finally {
    // Do nothing for now
  }
}

const go = async function (meetingId, streamName, lastFragment) { 
  speechSegments = [];
 
  let firstChunkToTranscribe = true;
  const passthroughStream = new stream.PassThrough({ highWaterMark: 128 });
  const audioStream = async function* () {
    try {
      for await (const payloadChunk of passthroughStream) {
        if(firstChunkToTranscribe) {
          firstChunkToTranscribe = false;
          console.log('Sending first chunk to transcribe: ', payloadChunk.length);
        }
        yield { AudioEvent: { AudioChunk: payloadChunk } };
      }
    } catch(error) {
      console.log("Error reading passthrough stream or yielding audio chunk."); 
    }
  };

  /* good for debugging - this writes the raw audio
  let dateISONow = new Date().toISOString().substring(0, 16).replace(/:/, '');
  let tempRecordingFilename =  meetingId + '-'+ dateISONow + ".raw";
  let tempRecordingFilepath= TEMP_FILE_PATH +tempRecordingFilename
  const writeRecordingFStream = fs.createWriteStream(tempRecordingFilepath);

  // good for debugging -> get the raw data
  passthroughStream.on('data', (chunk)=>{
    writeRecordingFStream.write(chunk);
  });
  */

  const tsClient = new TranscribeStreamingClient({ region: REGION});
  let tsParams = {
    /* SessionId: sessionId, */ // Pass a session id here if you need it
    LanguageCode: TRANSCRIBE_LANGUAGE_CODE,
    MediaEncoding: "pcm",
    MediaSampleRateHertz: 32000,
  //  NumberOfChannels: 2,
  //  EnableChannelIdentification: true,
    ShowSpeakerLabel: true,
    AudioStream: audioStream(),
  }
  
  if(IS_CONTENT_REDACTION_ENABLED) {
    tsParams.ContentRedactionType = CONTENT_REDACTION_TYPE;
    if(PII_ENTITY_TYPES) tsParams.PiiEntityTypes = PII_ENTITY_TYPES;
  }
  
  if(CUSTOM_VOCABULARY_NAME) {
    tsParams.VocabularyName = CUSTOM_VOCABULARY_NAME;
  }
  
  const tsCmd = new StartStreamTranscriptionCommand(tsParams);
  const tsResponse = await tsClient.send(tsCmd);

  //console.log(tsResponse);
  sessionId = tsResponse['SessionId'];

  const tsStream = stream.Readable.from(tsResponse.TranscriptResultStream);

  var kvsWorker = runKVSWorker({
    region: REGION,
    streamName: streamName,  
    lastFragment: lastFragment
  }, passthroughStream);

  timeToStop = false;
  stopTimer = setTimeout(() => {
    timeToStop = true;
    kvsWorker.worker.postMessage('time to stop the worker');
  }, TIMEOUT);
  
  var transcribePromise = readTranscripts(tsStream, meetingId);
  
  var lastFragmentRead = await kvsWorker;
  
  //we are done with transcribe.
  //passthroughStream.write(Buffer.alloc(0)); 
  passthroughStream.end();
  
  var transcribeResult = await transcribePromise;

  console.log("Last fragment read: ", lastFragmentRead);
  
  // stop the timer so when we finish and upload to s3 this doesnt kick in 
  if(timeToStop === false) {
    clearTimeout(stopTimer);
    timeToStop = false;
  }
}

exports.handler = async function (event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));

  // deal with concurrent lambdas better
  speechSegments = [];
  let event_type = "";
  let vpf_recording_status = "";
  let kvs_stream_name = "";
  let vpf_uid = "";
  let meeting_number = "";

  if(event.Records.length > 0) {
    let record = event.Records[0];
    try{
      if(record.Sns.MessageAttributes.vpf_recording_status.Value === "VPF_RECORDING_STARTED") {
        kvs_stream_name = record.Sns.MessageAttributes.kvs_stream_name.Value;
        vpf_uid = record.Sns.MessageAttributes.vpf_uid.Value;
        meeting_number = record.Sns.MessageAttributes.meeting_number.Value;
        
        await go(meeting_number, kvs_stream_name, null);
      } else {
        console.log("wrong VPF_RECORDING event state received")
      }
    }catch (error){
        console.log("wrong event was sent" + JSON.stringify(error))
    }
  }


}

if (!isLambda) {
  console.log("Starting not in Lambda...")
  go(process.argv[2], process.argv[3], process.argv[4], undefined);
}