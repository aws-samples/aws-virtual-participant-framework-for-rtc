// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { TranscribeStreamingClient, StartStreamTranscriptionCommand, StartStreamTranscriptionCommandInput } = require("@aws-sdk/client-transcribe-streaming");
const { S3Client } =  require("@aws-sdk/client-s3");

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
const PII_ENTITY_TYPES = process.env.PII_ENTITY_TYPES || 'ALL';
const CUSTOM_VOCABULARY_NAME = process.env.CUSTOM_VOCABULARY_NAME || '';
const TIMEOUT = 1000000;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const isLambda = !!process.env.LAMBDA_TASK_ROOT;

const s3Client = new S3Client(region = REGION);

let currentSpeaker = '';
let currentTranscript = '';
let currentFragment = '';
let transcriptStr = "";

const writeTranscriptToS3 = async function writeTranscriptToS3(bucket, meetingId) {
  await s3Client.putObject({
    Bucket: S3_BUCKET_NAME,
    Key: meetingId + ".txt",
    ContentType: 'binary',
    Body: Buffer.from(transcriptStr, 'binary')
  }).promise();
}

const updateUI = function updateUI(writeAsNewLine) {
  message = currentFragment + " " + currentSpeaker + ": " + currentTranscript;
  if(writeAsNewLine){
    magic_term('\n' + message );
  }else{
    magic_term(message);
  }
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
      // console.log(JSON.stringify(chunk));
      const result = chunk.TranscriptEvent.Transcript.Results[0];
      if (!result) {
        currentTranscript = '';
        continue;
      }
      const transcript = result.Alternatives[0];
      if (!transcript.Transcript) continue;
      //console.log(currentSpeaker + ": " + transcript.Transcript);
      currentTranscript = transcript.Transcript;
      updateUI(true);

      if (result.IsPartial === false) {
        let currentSpeaker = null;
        for (let item of result.Alerernatives[0].Items) {
          if (item.Speaker !== currentSpeaker) {
            transcriptStr += item.Speaker + ": ";
          }
          transcriptStr += item.Content + (item.Type === 'punctuation' ? '' : ' ');
        }
        transcriptStr += '\n';
        console.log(result.Alerernatives[0].Items[0].Speaker + ": " + transcript);
        writeTranscriptToS3();
      }

      //console.log(JSON.stringify(chunk));
      //writeTranscriptionSegment(chunk, meetingId);
    }
  }
  catch(error) {
    console.error("Error writing transcription segment.", JSON.stringify(error));
  } finally {
    // Do nothing for now
  }
}

const go = async function (meetingId, streamName, lastFragment) { 
 
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
    //NumberOfChannels: 2,
    //EnableChannelIdentification: true,
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

  let streamName = event.kvsPrefix + "-vpf-meeting-" + event.meetingId + "-" + event.vpfId;
  await go(event.meetingId, streamName, null);
}

if (!isLambda) {
  console.log("Starting not in Lambda...")
  go(process.argv[2], process.argv[3], process.argv[4], undefined);
}