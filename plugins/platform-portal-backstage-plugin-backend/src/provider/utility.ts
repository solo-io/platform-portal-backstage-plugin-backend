import fetch from 'node-fetch';
import { AccessTokensResponse } from './api-types';

export function parseJwt(token: string) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join(''),
  );
  return JSON.parse(jsonPayload);
}

export function objectToUrlFormEncodedPayload(
  requestJSON: Record<string, string>,
) {
  const formBodyPieces = [] as string[];
  for (const property in requestJSON) {
    if (!requestJSON.hasOwnProperty(property)) continue;
    const encodedKey = encodeURIComponent(property);
    const encodedValue = encodeURIComponent(
      requestJSON[property as keyof typeof requestJSON],
    );
    formBodyPieces.push(`${encodedKey}=${encodedValue}`);
  }
  const formBodyString = formBodyPieces.join('&');
  return formBodyString;
}

export async function doAccessTokenRequest(
  grantType: 'refresh_token' | 'password',
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  username: string,
  password: string,
  refreshToken?: string,
) {
  const formData = {} as Record<string, string>;
  //
  // Build the request payload for a new oauth access token.
  //
  formData.grant_type = grantType;
  formData.client_id = clientId;
  formData.client_secret = clientSecret;
  if (grantType === 'refresh_token') {
    if (!refreshToken) {
      return undefined;
    }
    formData.refresh_token = refreshToken;
  }
  if (grantType === 'password') {
    formData.username = username;
    formData.password = password;
  }
  //
  // Make the request
  //
  const rawRes = await fetch(tokenEndpoint, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    method: 'POST',
    body: objectToUrlFormEncodedPayload(formData),
  });
  let resJSON: any;
  try {
    resJSON = await rawRes.json();
  } catch {
    throw new Error('Error parsing oauth response.');
  }
  if (!!resJSON.error_description) {
    throw new Error(resJSON.error_description);
  }
  if (!!resJSON.error) {
    throw new Error(resJSON.error);
  }
  //
  // Check for the access token in the response.
  //
  if (!resJSON.access_token) {
    throw new Error(
      "No 'access_token' property was found in the oauth response body.",
    );
  }
  return resJSON as AccessTokensResponse;
}
