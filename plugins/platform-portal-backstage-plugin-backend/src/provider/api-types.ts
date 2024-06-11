//
// Gloo Mesh Gateway Types
//

type RateLimitPolicy = {
  unit: 'UNKNOWN' | 'SECOND' | 'MINUTE' | 'HOUR' | 'DAY';
  requestsPerUnit: number;
};

type AuthPolicy = {
  authType: string;
};

export type UsagePlan = {
  name: string;
  authPolicies: AuthPolicy[];
  rateLimitPolicy: RateLimitPolicy;
  apiIds: string[];
};

export type APIKey = {
  name: string;
  id: string;
  // APIKey is returned only once when the API key is created.
  apiKey: string | undefined;
  metadata?: Record<string, string> | undefined;
};

export type API = {
  apiProductId?: string;
  apiProductDisplayName?: string;
  apiVersion?: string;
  apiId: string;
  contact: string;
  customMetadata: Record<string, string> | undefined;
  description: string;
  license: string;
  termsOfService: string;
  title: string;
  usagePlans: string[];
  openapiSpec?: APISchema;
  openapiSpecFetchErr?: string | null;
};

// This api type may be returned in the next portal rest server version.
export type APIProduct = {
  apiProductId: string;
  apiProductDisplayName: string;
  apiVersions: {
    apiId: string;
    apiVersion: string;
    contact: string;
    customMetadata?: Record<string, string>;
    description: string;
    license: string;
    termsOfService: string;
    title: string;
    usagePlans: string[];
    openapiSpec?: APISchema;
    openapiSpecFetchErr?: string | null;
  }[];
};

//
// Gloo Gateway Types
//

export type ApiProductSummary = {
  createdAt: string;
  description: string;
  id: string;
  name: string;
  updatedAt: string;
  versionsCount: number;
};

export type ApiProductDetails = {
  autoApproval: boolean;
  contactEmail: string;
  createdAt: string;
  description: string;
  id: string;
  metadata: Record<string, string> | null;
  name: string;
  updatedAt: string;
};

export type ApiVersion = {
  apiSpec?: string | APISchema;
  createdAt: string;
  documentation: string;
  id: string;
  name: string;
  publicVisible?: boolean;
  status: string; // 'published',
  title: string;
  updatedAt: string;
};

export type ApiVersionExtended = ApiVersion & {
  apiProductDescription: string;
};

//
// Shared Types
//

export type User = {
  name: string;
  email: string;
  username: string;
};

type SchemaPropertyType = 'string' | 'integer' | 'array' | 'object';
export type APISchema = {
  components?: {
    schemas: {
      Author?: {
        properties: { [key: string]: SchemaPropertyType };
        type: 'object';
      };
      Module?: {
        properties: { [key: string]: SchemaPropertyType };
        type: 'object';
      };
      Track?: {
        properties: { [key: string]: SchemaPropertyType };
        type: 'object';
      };
    };
  };
  info: {
    title: string;
    version: string;
  };
  paths: {
    [key: string]: unknown;
  };
  servers?: {
    url: string;
  }[];
};

//
// Response from keycloak.
//
export interface AccessTokensResponse {
  id_token: string;
  access_token: string;
  expires_in: number;
  'not-before-policy': number;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  session_state: string;
  token_type: string;
}
