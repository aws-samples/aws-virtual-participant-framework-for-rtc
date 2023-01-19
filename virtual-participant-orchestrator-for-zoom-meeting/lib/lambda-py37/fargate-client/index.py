# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
 

import json
from botocore.vendored import requests

def lambda_handler(event, context):

    ip_address = event["ip_address"]
    path = event["path"]
    meeting_id = event["meeting_id"]
    meeting_passcode = event["meeting_passcode"]
    display_name = event["display_name"]

    url = f"http://{ip_address}:3000/{path}"

    payload = json.dumps(
        {
            "meeting_id": meeting_id,
            "meeting_passcode": meeting_passcode,
            "bot_display_name": display_name,
        }
    )
    headers = {"Content-Type": "application/json"}

    response = requests.request("POST", url, headers=headers, data=payload)

    print(response.text)

    return {"statusCode": 200, "body": response.text}
