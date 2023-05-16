// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const { workerData, parentPort } = require('worker_threads')
const process = require('process');
const { EbmlStreamDecoder, EbmlTagId, EbmlTag, EbmlTagPosition } = require('ebml-stream');
const { KinesisVideoClient, GetDataEndpointCommand, GetDataEndpointInput } = require("@aws-sdk/client-kinesis-video");
const { KinesisVideoMediaClient, KinesisVideoMedia, GetMediaCommand, GetMediaInput } = require("@aws-sdk/client-kinesis-video-media");
const alawmulaw = require('alawmulaw');
const util = require('util');


console.log('inside',workerData.streamName,'worker');

let timeToStop = false;

parentPort.on('message', (message) => {
  console.log('received message from parent', message);
  timeToStop = true;
});

// Start the stream for this particular stream
const readKVS = async function(region, streamName, lastFragment) {
  let actuallyStop = false;
  let firstDecodeEbml = true;
  console.log('inside readKVS worker', region, streamName);
  const decoder = new EbmlStreamDecoder({
    bufferTagIds: [
      EbmlTagId.SimpleTag,
      EbmlTagId.SimpleBlock
    ]
  });
  decoder.on('error', error => {
    console.log('Decoder Error:', JSON.stringify(error));
  })
  decoder.on('data', chunk => {
    
    if(chunk.id === EbmlTagId.Segment && chunk.position === EbmlTagPosition.End) {
      //this is the end of a segment. Lets forcefully stop if needed.
      if(timeToStop) actuallyStop = true;
    }
    if(!timeToStop) {
      if(chunk.id === EbmlTagId.SimpleTag)
      {
        if (chunk.Children[0].data === 'AWS_KINESISVIDEO_FRAGMENT_NUMBER') {
          lastFragment = chunk.Children[1].data;
          //console.log("read fragment", lastFragment);
          parentPort.postMessage({ type: 'new_fragment', fragment: lastFragment });
          //console.log("fragment: " + new Date(Date.now()).toString());
        }
        if (chunk.Children[0].data === 'speaker') {
          
          let speaker = chunk.Children[1].data;
          // console.log("speaker: " + speaker);
          parentPort.postMessage({ type: 'speaker_change', speaker: speaker });
        }
      }
      if(chunk.id === EbmlTagId.SimpleBlock)
      {
        if(firstDecodeEbml) {
          firstDecodeEbml = false;
          console.log('decoded ebml, simpleblock size:' + chunk.size + ' stream: ' + streamName); 
        }
        try {
          //TODO: Watch out when video is included need to check chunk.track to grab audio only
          // console.log("chunk: ");
          // console.log(util.inspect(chunk));
          //Todo: track 1 should not be auido but that needs to be fixed on producer side
          if(chunk.track == 1){
            let pcmSamples = Buffer.from(alawmulaw.mulaw.decode(chunk.payload).buffer);
            parentPort.postMessage({ type: 'chunk', chunk: pcmSamples })
          }
        } catch(error) {
          console.error("Error piping to parentPort: " + JSON.stringify(error));
        }
      }
    }
  });  //use this to find last fragment tag we received
  decoder.on('end', () => {
    //close stdio
    console.log(streamName, 'Finished');

    console.log('Last fragment for ' + streamName + ' ' + lastFragment + ' total size: ' + totalSize);
    parentPort.postMessage({type:'lastFragment', streamName:streamName, lastFragment: lastFragment});
    process.exit();
  });
  console.log('Starting stream ' + streamName);
  const kvClient = new KinesisVideoClient({ region: region});
  const getDataCmd = new GetDataEndpointCommand({ APIName: 'GET_MEDIA', StreamName: streamName});
  const response = await kvClient.send(getDataCmd);
  console.log("received endpoint for stream:", response.DataEndpoint);
  const mediaClient = new KinesisVideoMedia({ region: region, endpoint: response.DataEndpoint });
  //var getMediaCmd = new GetMediaCommand({ StreamName:streamName, StartSelector: { StartSelectorType: 'NOW'}});
  let fragmentSelector = {
    StreamName: streamName,
    StartSelector: {
      StartSelectorType: 'NOW'
    }
  };
  // console.log(fragmentSelector);
  // console.log("Selector:" + util.inspect(fragmentSelector));
  if (lastFragment && lastFragment.length > 0) {
    console.log('resuming after last fragment', lastFragment);
    fragmentSelector = {
      StreamName: streamName,    
      StartSelector: {
        StartSelectorType: 'FRAGMENT_NUMBER',
        AfterFragmentNumber: lastFragment
      }
    }
  }
  console.log("Fragment selector: " + JSON.stringify(fragmentSelector));
  const result = await mediaClient.getMedia(fragmentSelector)
  const streamReader = result.Payload;
  let totalSize = 0; 
  let firstKvsChunk = true;
  try {
    for await (const chunk of streamReader) {
      if(firstKvsChunk) {
        firstKvsChunk = false;
        console.log(streamName + " received chunk size: " + chunk.length);
      }
      totalSize = totalSize + chunk.length;
      decoder.write(chunk);
      if (actuallyStop) { break; }
    }
    console.log("done reading");
  }
  catch(error) {
    console.error("error writing to decoder", error);
  } finally {
    console.log('Closing buffers ' + streamName);
    decoder.end();
  }
}

console.log("Stream Name: " + workerData.streamName);

readKVS(workerData.region, workerData.streamName, workerData.lastFragment);