---
name: aws-cognito
description: |
  Amazon Cognito is AWS's managed user directory and sign-in service. Use it to create user pools for sign-up
  and sign-in, configure identity pools for AWS access, handle JWT tokens,
  set up social federation with Google and Facebook, and secure APIs with
  Cognito authorizers.
license: Apache-2.0
compatibility: 'aws-cli, boto3, sdk'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - aws
    - cognito
    - authentication
    - jwt
    - oauth
---

# AWS Cognito

## Overview

Amazon Cognito provides authentication, authorization, and user management. User Pools handle sign-up/sign-in and issue JWTs. Identity Pools grant temporary AWS credentials to authenticated (or guest) users.

Since late 2024 each user pool has a feature plan (`--user-pool-tier LITE | ESSENTIALS | PLUS`); new pools default to Essentials. The plan decides which features exist (for example, managed login and passwordless sign-in need Essentials or Plus; check the feature plans page before relying on one).

## Instructions

### Core Concepts

- **User Pool** — user directory for sign-up, sign-in, and token issuance
- **Identity Pool** — maps authenticated users to temporary AWS credentials
- **App Client** — configuration for an application connecting to a user pool
- **JWT Tokens** — ID token (user info), access token (scopes), refresh token
- **Managed login / Hosted UI** — pre-built sign-in pages with OAuth2/OIDC support (managed login is the newer branded version, chosen per domain with `--managed-login-version 2`; classic Hosted UI is version 1)
- **Federation** — sign in via Google, Facebook, Apple, SAML, or OIDC providers

### User Pool Setup

```bash
# Create a user pool
aws cognito-idp create-user-pool \
  --pool-name app-users-prod \
  --auto-verified-attributes email \
  --username-attributes email \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --schema '[
    {"Name":"email","Required":true,"Mutable":true},
    {"Name":"name","Required":true,"Mutable":true},
    {"Name":"company","AttributeDataType":"String","Mutable":true}
  ]' \
  --user-pool-tier ESSENTIALS \
  --email-configuration EmailSendingAccount=COGNITO_DEFAULT
```

Turn on optional MFA with an authenticator app (TOTP) in a second call:

```bash
aws cognito-idp set-user-pool-mfa-config \
  --user-pool-id us-east-1_ABC123 \
  --software-token-mfa-configuration Enabled=true \
  --mfa-configuration OPTIONAL
```

```bash
# Create an app client (create the Google identity provider below first, or drop Google here; no secret for SPA/mobile). ALLOW_USER_PASSWORD_AUTH is only for the
# boto3 example below; drop it for browser apps that use SRP or the hosted UI
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_ABC123 \
  --client-name web-app \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls '["https://app.northwindparcels.com/callback","http://localhost:3000/callback"]' \
  --logout-urls '["https://app.northwindparcels.com/logout"]' \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

### User Management

```bash
# Create a user (admin)
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123 \
  --username alice@northwindparcels.com \
  --user-attributes Name=email,Value=alice@northwindparcels.com Name=name,Value="Alice Johnson" \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS
```

```bash
# Confirm a self-registered user (status UNCONFIRMED) without the emailed code.
# Users made by admin-create-user cannot be confirmed this way; they start as FORCE_CHANGE_PASSWORD
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id us-east-1_ABC123 \
  --username alice@northwindparcels.com
```

```bash
# Add user to a group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_ABC123 \
  --username alice@northwindparcels.com \
  --group-name admins
```

```bash
# List users
aws cognito-idp list-users \
  --user-pool-id us-east-1_ABC123 \
  --filter 'email ^= "alice"' \
  --limit 10
```

### Authentication Flow

```python
# Sign up and sign in with boto3
import boto3

client = boto3.client('cognito-idp', region_name='us-east-1')
CLIENT_ID = '3n4b5urk1ft4fl3mg5e62d9ado'  # app client id from create-user-pool-client

# Sign up
client.sign_up(
    ClientId=CLIENT_ID,
    Username='bob@northwindparcels.com',
    Password='SecurePass123!',
    UserAttributes=[
        {'Name': 'email', 'Value': 'bob@northwindparcels.com'},
        {'Name': 'name', 'Value': 'Bob Smith'}
    ]
)

# Confirm sign up (with code from email)
client.confirm_sign_up(
    ClientId=CLIENT_ID,
    Username='bob@northwindparcels.com',
    ConfirmationCode='123456'
)

# Sign in (needs ALLOW_USER_PASSWORD_AUTH on the app client; boto3 has no built-in SRP)
response = client.initiate_auth(
    ClientId=CLIENT_ID,
    AuthFlow='USER_PASSWORD_AUTH',
    AuthParameters={
        'USERNAME': 'bob@northwindparcels.com',
        'PASSWORD': 'SecurePass123!'
    }
)
id_token = response['AuthenticationResult']['IdToken']
access_token = response['AuthenticationResult']['AccessToken']
refresh_token = response['AuthenticationResult']['RefreshToken']
```

### JWT Token Verification

ID tokens carry the app client in `aud`; access tokens carry it in `client_id` and have no `aud`, so passing `audience=` for an access token raises `MissingRequiredClaimError`. Check `token_use` too.

```python
# Verify Cognito JWT tokens in your API (pip install pyjwt cryptography requests)
import jwt
import requests

REGION = 'us-east-1'
USER_POOL_ID = 'us-east-1_ABC123'
CLIENT_ID = '3n4b5urk1ft4fl3mg5e62d9ado'
ISSUER = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}'

# Fetch JWKS once and cache it; refetch when an unknown kid appears (key rotation)
jwks = requests.get(f'{ISSUER}/.well-known/jwks.json', timeout=5).json()

def verify_token(token, token_use='access'):
    header = jwt.get_unverified_header(token)
    key = next(k for k in jwks['keys'] if k['kid'] == header['kid'])
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

    claims = jwt.decode(
        token,
        public_key,
        algorithms=['RS256'],
        issuer=ISSUER,
        audience=CLIENT_ID if token_use == 'id' else None,
        options={'verify_aud': token_use == 'id'},
    )
    if claims['token_use'] != token_use:
        raise ValueError('unexpected token_use')
    if token_use == 'access' and claims['client_id'] != CLIENT_ID:
        raise ValueError('token was issued to another app client')
    return claims
```

### Social Federation (Google)

```bash
# Create Google identity provider
aws cognito-idp create-identity-provider \
  --user-pool-id us-east-1_ABC123 \
  --provider-name Google \
  --provider-type Google \
  --provider-details "{
    \"client_id\": \"$GOOGLE_CLIENT_ID\",
    \"client_secret\": \"$GOOGLE_CLIENT_SECRET\",
    \"authorize_scopes\": \"openid email profile\"
  }" \
  --attribute-mapping '{
    "email": "email",
    "name": "name",
    "username": "sub"
  }'
```

### Hosted UI / managed login

```bash
# Set up a domain for the hosted UI
aws cognito-idp create-user-pool-domain \
  --user-pool-id us-east-1_ABC123 \
  --domain my-app-auth \
  --managed-login-version 2

# Managed login needs a branding style on the app client
aws cognito-idp create-managed-login-branding \
  --user-pool-id us-east-1_ABC123 \
  --client-id 3n4b5urk1ft4fl3mg5e62d9ado \
  --use-cognito-provided-values
```

The hosted UI is then available at:
`https://my-app-auth.auth.us-east-1.amazoncognito.com/login?client_id=3n4b5urk1ft4fl3mg5e62d9ado&response_type=code&redirect_uri=https://app.northwindparcels.com/callback`

### Identity Pool (Federated Identities)

```bash
# Create identity pool for AWS credential access
aws cognito-identity create-identity-pool \
  --identity-pool-name app-identity-pool \
  --no-allow-unauthenticated-identities \
  --cognito-identity-providers '[{
    "ProviderName": "cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123",
    "ClientId": "3n4b5urk1ft4fl3mg5e62d9ado",
    "ServerSideTokenCheck": true
  }]'
```

### Lambda Triggers

```bash
# Add a pre-sign-up trigger for custom validation
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_ABC123 \
  --lambda-config '{
    "PreSignUp": "arn:aws:lambda:us-east-1:123456789:function:validate-signup",
    "PostConfirmation": "arn:aws:lambda:us-east-1:123456789:function:welcome-email",
    "PreTokenGeneration": "arn:aws:lambda:us-east-1:123456789:function:add-custom-claims"
  }'
```

`update-user-pool` resets every setting you leave out to its default (password policy, MFA, email, tags). Fetch the pool with `describe-user-pool`, and send the whole configuration back with your change. For Lambda triggers, grant `cognito-idp.amazonaws.com` permission to invoke each function (`aws lambda add-permission`).

## Examples

### Example 1: "Add email sign-up and Google login to my SPA"

Run the `create-user-pool`, `create-user-pool-client` (no secret, `code` flow), `create-identity-provider` and `create-user-pool-domain` commands above. Result: users sign in at `https://my-app-auth.auth.us-east-1.amazoncognito.com/login?client_id=3n4b5urk1ft4fl3mg5e62d9ado&response_type=code&redirect_uri=https://app.northwindparcels.com/callback`, the callback receives a `code`, and the app exchanges it at `/oauth2/token` (with PKCE) for ID, access and refresh tokens.

### Example 2: "Protect my Flask API with Cognito tokens"

Send the access token from the client in an `Authorization: Bearer` header. In the API call `verify_token(token, 'access')` and read `claims['sub']` and `claims.get('cognito:groups', [])` for authorization. A wrong issuer, an expired token or an ID token passed as an access token raises an exception, so return HTTP 401.

## Guidelines

- Use the SRP flow (or the hosted UI) in browsers and mobile apps; USER_PASSWORD_AUTH sends the password to Cognito directly and is meant for trusted servers and tests
- Enable MFA (TOTP), at minimum as optional, for all user pools
- Use Lambda triggers for custom validation and enriching tokens
- Cache JWKS keys when verifying tokens server-side
- Use groups and custom attributes for authorization logic
- Access and ID tokens last 1 hour by default (5 minutes to 1 day allowed); refresh tokens 30 days by default. Tune with `--access-token-validity` and `--refresh-token-validity`
- Never put the Google client secret or temporary passwords in shell history; read them from a secrets manager or environment variable
- `AllowUnauthenticatedIdentities` on an identity pool gives guest AWS credentials; keep it off unless you need it and scope the guest IAM role tightly
- Use Hosted UI for quick OAuth2/OIDC setup; customize branding in managed login or with CSS in classic Hosted UI
