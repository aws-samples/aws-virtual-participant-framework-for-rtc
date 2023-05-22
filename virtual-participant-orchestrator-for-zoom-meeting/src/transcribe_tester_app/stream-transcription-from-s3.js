const { SelectObjectContentCommand, S3Client } = require('@aws-sdk/client-s3');
const util = require('util');
const process = require('process');
const stream = require('stream');
const REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const s3Client = new S3Client(region = REGION);

const bucket = process.argv[2] 
const key = process.argv[3]
const num_lines = process.argv[4];

function generateSQLStatement(){
    // careful with SQL injection
    if (num_lines < 10001){
        return 'SELECT * FROM s3object s LIMIT ' + num_lines;
    } else {
        return 'SELECT * FROM s3object s LIMIT 10';
    }

}

const printTranscripts = async function (tsStream) {
    try {
        for await (const chunk of tsStream) {
            if(chunk.Records){
                console.log(Buffer.from(chunk.Records.Payload).toString());
            } else {
                // console.log(chunk);  //print stats...
            }
        }
    }
    catch(error) {
      console.error("Error logging transcription segment.", JSON.stringify(error));
    } finally {
      // Do nothing for now
    } 
}

const readFileJson = async () => {
	const params = {
        Bucket: bucket,
        Key: key,
        ExpressionType: 'SQL',
        Expression: generateSQLStatement(),
        InputSerialization: {
            JSON: {
                Type: 'LINES'
            }
        },
        OutputSerialization: {
            JSON: {}
        }
    };
	
	const command = new SelectObjectContentCommand(params);
    // console.log('====== Command =====');
    // console.log(JSON.stringify(command));

	const response = await s3Client.send(command);
    const s3SelectStream = stream.Readable.from(response.Payload);
    const s3Promise = printTranscripts(s3SelectStream);
  
    await s3Promise;
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  const watchS3 = async() => {
    while (true){
        readFileJson();
        await sleep(2000);
    }
  }

watchS3();
