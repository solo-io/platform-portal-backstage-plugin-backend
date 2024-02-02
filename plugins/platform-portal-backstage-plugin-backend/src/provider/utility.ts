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
  grantType: 'refresh_token' | 'client_credentials',
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
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

//
// From: https://backstage.io/docs/features/software-catalog/descriptor-format
//
const sanitizeRegex = {
  // Each tag must be sequences of [a-z0-9:+#] separated by -, at most 63 characters in total
  tag: /[a-z]|[0-9]|\:|\+|\#|\-/,
  // Strings of length at least 1, and at most 63
  // Must consist of sequences of [a-z0-9A-Z] possibly separated by one of [-_.].
  name: /[a-z]|[0-9]|[A-Z]|\-|\_|\./,
  // Namespaces must be sequences of [a-zA-Z0-9], possibly separated by -, at most 63 characters in total.
  namespace: /[a-z]|[0-9]|[A-Z]|\-/,
};

/**
 * Sanitizes a string before adding it to a backstage entity.
 */
export const sanitizeStringForEntity = (
  propertyType: keyof typeof sanitizeRegex,
  propertyValue: string,
) => {
  return propertyValue
    .split('')
    .map(ch => (!sanitizeRegex[propertyType].test(ch) ? '-' : ch))
    .reduce(
      (prev, cur) =>
        // Don't go over 63 characters.
        prev.length >= 62
          ? prev
          : // Don't repeat "-"
          prev.at(-1) === '-' && cur === '-'
          ? prev
          : prev + cur,
      '',
    );
};
