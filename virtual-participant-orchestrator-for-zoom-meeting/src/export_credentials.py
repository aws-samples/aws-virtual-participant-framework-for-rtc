# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3
from datetime import datetime, timedelta

session = boto3.Session()
cred = session.get_credentials()
print(
    'CREDENTIALS',
    cred.access_key,
    (datetime.now().replace(microsecond=0) + timedelta(hours=1)).isoformat(),
    cred.secret_key,
    cred.token
)