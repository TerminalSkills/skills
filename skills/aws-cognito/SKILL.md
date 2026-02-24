---
name: aws-cognito
description: |
  Implement authentication with Amazon Cognito. Create user pools for sign-up
  and sign-in, configure identity pools for AWS access, handle JWT tokens,
  set up social federation with Google and Facebook, and secure APIs with
  Cognito authorizers.
license: Apache-2.0
compatibility:
  - aws-cli
  - boto3
  - sdk
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - aws
    - cognito
    - authentication
    - jwt
    - oauth
---

# AWS Cognito

Amazon Cognito provides authentication, authorization, and user management. User Pools handle sign-up/sign-in and issue JWTs. Identity Pools grant temporary AWS credentials to authenticated (or guest) users.

## Core Concepts

- **User Pool** — user directory for sign-up, sign-in, and token issuance
- **Identity Pool** — maps authenticated users to temporary AWS credentials
- **App Client** — configuration for an application connecting to a user pool
- **JWT Tokens** — ID token (user info), access token (scopes), refresh token
- **Hosted UI** — pre-built sign-in pages with OAuth2/OIDC support
- **Federation** — sign in via Google, Facebook, Apple, SAML, or OIDC providers

## User Pool Setup

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
    {"Name":"custom:company","AttributeDataType":"String","Mutable":true}
  ]' \
  --mfa-configuration OPTIONAL \
  --email-configuration EmailSendingAccount=COGNITO_DEFAULT
```

```bash
# Create an app client (no secret for SPA/mobile)
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_ABC123 \
  --client-name web-app \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls '["https://app.example.com/callback","http://localhost:3000/callback"]' \
  --logout-urls '["https://app.example.com/logout"]' \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

## User Management

```bash
# Create a user (admin)
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123 \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=name,Value="Alice Johnson" \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS
```

```bash
# Confirm a user (skip email verification)
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id us-east-1_ABC123 \
  --username alice@example.com
```

```bash
# Add user to a group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_ABC123 \
  --username alice@example.com \
  --group-name admins
```

```bash
# List users
aws cognito-idp list-users \
  --user-pool-id us-east-1_ABC123 \
  --filter 'email ^= "alice"' \
  --limit 10
```

## Authentication Flow

```python
# Sign up and sign in with boto3
import boto3

client = boto3.client('cognito-idp')
CLIENT_ID = 'your-app-client-id'

# Sign up
client.sign_up(
    ClientId=CLIENT_ID,
    Username='bob@example.com',
    Password='SecurePass123!',
    UserAttributes=[
        {'Name': 'email', 'Value': 'bob@example.com'},
        {'Name': 'name', 'Value': 'Bob Smith'}
    ]
)

# Confirm sign up (with code from email)
client.confirm_sign_up(
    ClientId=CLIENT_ID,
    Username='bob@example.com',
    ConfirmationCode='123456'
)

# Sign in
response = client.initiate_auth(
    ClientId=CLIENT_ID,
    AuthFlow='USER_PASSWORD_AUTH',
    AuthParameters={
        'USERNAME': 'bob@example.com',
        'PASSWORD': 'SecurePass123!'
    }
)
id_token = response['AuthenticationResult']['IdToken']
access_token = response['AuthenticationResult']['AccessToken']
refresh_token = response['AuthenticationResult']['RefreshToken']
```

## JWT Token Verification

```python
# Verify Cognito JWT tokens in your API
import jwt
import requests

REGION = 'us-east-1'
USER_POOL_ID = 'us-east-1_ABC123'
JWKS_URL = f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json'

# Fetch JWKS (cache this)
jwks = requests.get(JWKS_URL).json()

def verify_token(token):
    # Decode header to get key ID
    header = jwt.get_unverified_header(token)
    key = next(k for k in jwks['keys'] if k['kid'] == header['kid'])
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

    return jwt.decode(
        token,
        public_key,
        algorithms=['RS256'],
        audience=CLIENT_ID,
        issuer=f'https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}'
    )
```

## Social Federation (Google)

```bash
# Create Google identity provider
aws cognito-idp create-identity-provider \
  --user-pool-id us-east-1_ABC123 \
  --provider-name Google \
  --provider-type Google \
  --provider-details '{
    "client_id": "your-google-client-id.apps.googleusercontent.com",
    "client_secret": "your-google-secret",
    "authorize_scopes": "openid email profile"
  }' \
  --attribute-mapping '{
    "email": "email",
    "name": "name",
    "username": "sub"
  }'
```

## Hosted UI

```bash
# Set up a domain for the hosted UI
aws cognito-idp create-user-pool-domain \
  --user-pool-id us-east-1_ABC123 \
  --domain my-app-auth
```

The hosted UI is then available at:
`https://my-app-auth.auth.us-east-1.amazoncognito.com/login?client_id=CLIENT_ID&response_type=code&redirect_uri=https://app.example.com/callback`

## Identity Pool (Federated Identities)

```bash
# Create identity pool for AWS credential access
aws cognito-identity create-identity-pool \
  --identity-pool-name app-identity-pool \
  --allow-unauthenticated-identities \
  --cognito-identity-providers '[{
    "ProviderName": "cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123",
    "ClientId": "your-app-client-id",
    "ServerSideTokenCheck": true
  }]'
```

## Lambda Triggers

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

## Best Practices

- Use SRP auth flow (not USER_PASSWORD_AUTH) for production apps
- Enable MFA, at minimum as optional, for all user pools
- Use Lambda triggers for custom validation and enriching tokens
- Cache JWKS keys when verifying tokens server-side
- Use groups and custom attributes for authorization logic
- Set short access token expiration (1h) with longer refresh tokens
- Use Hosted UI for quick OAuth2/OIDC setup; customize with CSS
