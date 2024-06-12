import { LoggerService, SchedulerService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import fetch from 'node-fetch';
import { ConfigUtil } from './ConfigUtil';
import { EntityBuilder } from './EntityBuilder';
import {
  API,
  APIProduct,
  APISchema,
  AccessTokensResponse,
  ApiProductSummary,
  ApiVersion,
  ApiVersionExtended,
} from './api-types';
import { doAccessTokenRequest, parseJwt } from './utility';

type PortalServerType = 'gloo-mesh-gateway' | 'gloo-gateway' | 'unknown';

type ApisEndpointResponseType =
  | API[]
  | APIProduct[]
  | ApiProductSummary[]
  | null;

/**
 * Provides API entities from the Gloo Platform Portal REST server.
 */
export class GlooPlatformPortalProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private logger: LoggerService;
  private config: Config;
  private latestTokensResponse?: AccessTokensResponse;
  private debugLogging = false;

  // Helper classes
  private configUtil: ConfigUtil;
  private entityBuilder: EntityBuilder;

  /**
   * Defaults to 'unknown'.
   * This is updated to 'gloo-gateway' or 'gloo-mesh-gateway' depending on the api response.
   */
  private _portalServerType: PortalServerType = 'unknown';
  private get portalServerType() {
    return this._portalServerType;
  }
  private _portalServerUrl = '';
  private get portalServerUrl() {
    return this._portalServerUrl;
  }
  private _apisEndpoint = '';
  private get apisEndpoint() {
    return this._apisEndpoint;
  }
  private get gmg_apisEndpoint() {
    return this.portalServerUrl + '/apis?includeSchema=true';
  }
  private get gg_apisEndpoint() {
    return this.portalServerUrl + '/api-products';
  }

  log = (s: string) => this.logger?.info(`gloo-platform-portal: ${s}`);
  warn = (s: string) => this.logger?.warn(`gloo-platform-portal: ${s}`);
  error = (s: string) => this.logger?.error(`gloo-platform-portal: ${s}`);
  getProviderName = () => `gloo-platform-portal-backend-provider`;
  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
  }

  updatePortalServerUrl() {
    this._portalServerUrl = this.configUtil.getPortalServerUrl();
    this.entityBuilder.onPortalServerUrlChange(this.portalServerUrl);
  }

  updateApisEndpoint() {
    // For portalServerType:
    // - "unknown, and "gloo-mesh-gateway": use GMG endpoint
    // - "gloo-gateway": use GG endpoint
    this._apisEndpoint =
      this.portalServerType === 'gloo-gateway'
        ? this.gg_apisEndpoint
        : this.gmg_apisEndpoint;
    this.entityBuilder.onApisEndpointChange(this.apisEndpoint);
  }

  updatePortalServerType(newType: typeof this.portalServerType) {
    this._portalServerType = newType;
    // When the portal server type changes, the apis endpoint may be updated.
    this.updateApisEndpoint();
  }

  //
  // 1. Init class
  //
  constructor(
    logger: LoggerService,
    config: Config,
    scheduler: SchedulerService,
  ) {
    this.logger = logger;
    this.config = config;
    this.configUtil = new ConfigUtil(this.error, this.warn, this.config);
    this.entityBuilder = new EntityBuilder();
    // Default extra debug-logging to false
    this.debugLogging = !!this.config?.getOptionalBoolean(
      'glooPlatformPortal.backend.debugLogging',
    );
    this.log('Initializing GlooPlatformPortalProvider.');
    // Get the tokens, then schedule the task to update the catalog.
    this.startTokensRequests().then(() => this.startScheduler(scheduler));
  }

  //
  // 2. Get access_token
  //
  async startTokensRequests() {
    //
    // Make the initial request for the access_token.
    if (this.debugLogging) {
      this.log('Making the initial access_token request.');
    }
    if (!this.config) {
      this.error(
        'Backstage config object not found when doing access token request.',
      );
      return;
    }
    const res = await doAccessTokenRequest(
      'client_credentials',
      this.configUtil.getTokenEndpoint(),
      this.configUtil.getClientId(),
      this.configUtil.getClientSecret(),
    );
    this.latestTokensResponse = res;
    if (!this.latestTokensResponse) {
      // If there's a problem, wait to restart the access token
      // requests so as to not overload the auth server.
      this.warn('No latest access token. Re-requesting the access_token.');
      setTimeout(this.startTokensRequests.bind(this), 5000);
      return;
    }
    if (this.debugLogging) {
      this.log('Got the access_token.');
    }
    //
    // Parse the access_token JWT to find when it expires.
    const parsedToken = parseJwt(this.latestTokensResponse.access_token);
    if (!parsedToken.exp) {
      this.warn('No `exp` property found in the access_token JWT.');
    }
    const nowDate = new Date();
    const expiresDate = new Date(parsedToken.exp * 1000);
    const millisUntilExpires = expiresDate.getTime() - nowDate.getTime();
    if (millisUntilExpires <= 0) {
      this.warn('access token is expired!');
      this.latestTokensResponse = undefined;
      return;
    }
    if (this.debugLogging) {
      this.log('Setting a timeout to get the next access token.');
    }
    // Set the timeout to request new tokens.
    setTimeout(
      this.startTokensRequests.bind(this),
      // Don't make this request more than once a second,
      // and do the refresh 5 seconds early.
      Math.max(1000, millisUntilExpires - 5000),
    );
  }

  /**
   *
   * 3. Schedule sync.
   *
   * This passes the user config into the
   * Backstage plugin task scheduler.
   * */
  async startScheduler(scheduler: SchedulerService) {
    if (this.debugLogging) {
      this.log('Scheduling backstage catalog sync.');
    }
    const frequencyConfig = this.config?.getOptionalConfig(
      'glooPlatformPortal.backend.syncFrequency',
    );
    // Get frequency from the config.
    const frequency = {
      hours: frequencyConfig?.getOptionalNumber('hours') ?? 0,
      minutes: frequencyConfig?.getOptionalNumber('minutes') ?? 0,
      seconds: frequencyConfig?.getOptionalNumber('seconds') ?? 0,
      milliseconds: frequencyConfig?.getOptionalNumber('milliseconds') ?? 0,
    };
    if (Object.values(frequency).every(v => v === 0)) {
      // If there are no values for frequency, set a resonable default instead of 0.
      frequency.minutes = 5;
      if (this.debugLogging) {
        this.log(
          `No frequency value was set, so the default value of ${frequency.minutes} minutes will be used.`,
        );
      }
    }
    if (this.debugLogging) {
      this.log(`Frequency set to ${JSON.stringify(frequency)}.`);
    }
    // Get timeout from the config.
    const timeoutConfig = this.config?.getOptionalConfig(
      'glooPlatformPortal.backend.syncTimeout',
    );
    const timeout = {
      hours: timeoutConfig?.getOptionalNumber('hours') ?? 0,
      minutes: timeoutConfig?.getOptionalNumber('minutes') ?? 0,
      seconds: timeoutConfig?.getOptionalNumber('seconds') ?? 0,
      milliseconds: timeoutConfig?.getOptionalNumber('milliseconds') ?? 0,
    };
    if (Object.values(timeout).every(v => v === 0)) {
      // If there are no values for timeout, set a resonable default instead of 0.
      timeout.seconds = 30;
      if (this.debugLogging) {
        this.log(
          `No timeout value was set. The default value of ${timeout.seconds} seconds will be used.`,
        );
      }
    }
    if (this.debugLogging) {
      this.log(`Timeout set to ${JSON.stringify(timeout)}.`);
    }
    // Start the sync task on the Backstage scheduler.
    await scheduler.scheduleTask({
      id: 'run_gloo_platform_portal_refresh',
      fn: async () => {
        await this.run();
      },
      frequency,
      timeout,
    });
  }

  /**
   *
   * 4. Return new Backstage entities.
   *
   * Requests API information from the Gloo Platform Portal REST server,
   * and transforms the response into Backstage API entities.
   */
  async run(): Promise<void> {
    if (!this.connection || !this.latestTokensResponse) {
      throw new Error('Not initialized');
    }
    const entities: Entity[] = [];
    this.updatePortalServerUrl();
    this.updateApisEndpoint();

    // Make API request
    try {
      let processedAPIs = await this.fetchAPIs();

      //
      // Some Gloo Mesh Gateway portal servers returned the APIs grouped by APIProduct,
      // so we can convert it back to a list here.
      //
      if (
        this.portalServerType === 'gloo-mesh-gateway' &&
        !!processedAPIs?.length &&
        'apiVersions' in processedAPIs[0]
      ) {
        const apiProducts = processedAPIs as unknown as APIProduct[];
        processedAPIs = apiProducts.reduce((accum, curProd) => {
          accum.push(
            ...curProd.apiVersions.reduce((accumVer, api) => {
              if (!!api.openapiSpecFetchErr) {
                this.warn(
                  `Schema fetch error for ${api.apiId} : ${JSON.stringify(
                    api.openapiSpecFetchErr,
                  )}`,
                );
              }
              accumVer.push({
                apiId: api.apiId,
                apiProductDisplayName: curProd.apiProductDisplayName,
                apiProductId: curProd.apiProductId,
                apiVersion: api.apiVersion,
                contact: api.contact,
                customMetadata: api.customMetadata,
                description: api.description,
                license: api.license,
                termsOfService: api.termsOfService,
                title: api.title,
                usagePlans: api.usagePlans,
                openapiSpec: api.openapiSpec,
                openapiSpecFetchErr: api.openapiSpecFetchErr,
              });
              return accumVer;
            }, [] as API[]),
          );
          return accum;
        }, [] as API[]);
      }

      // Convert the APIs to entities
      for (let i = 0; i < processedAPIs.length; i++) {
        const api = processedAPIs[i];
        if ('id' in api) {
          //
          // For "gloo-gateway"
          //
          this.updatePortalServerType('gloo-gateway');
          entities.push(await this.getGlooGatewayApiEntity(api));
        } else if ('apiProductId' in api) {
          //
          // For "gloo-mesh-gateway"
          //
          this.updatePortalServerType('gloo-mesh-gateway');
          entities.push(await this.getGlooMeshGatewayApiEntity(api));
        }
      }
      if (this.debugLogging) {
        this.log(
          'Transformed APIs into new entities: ' + JSON.stringify(entities),
        );
      }
    } catch (e) {
      this.error(
        `Could not get APIs from the portal server endpoint or their schemas or transform them into entities (${
          this.apisEndpoint
        }). Error: ${JSON.stringify(e)}`,
      );
    }

    await this.connection.applyMutation(
      this.entityBuilder.buildEntityProviderMutation(entities),
    );
  }

  /**
   * Returns the Backstage catalog entity for the "gloo-gateway" Portal Server API response.
   */
  async getGlooGatewayApiEntity(api: ApiVersionExtended): Promise<Entity> {
    return this.entityBuilder.buildApiVersionEntity(
      api.id,
      api.name,
      api.apiProductDescription,
      api.apiSpec,
    );
  }

  /**
   * Returns the Backstage catalog entity for the "gloo-mesh-gateway" Portal Server API response.
   */
  async getGlooMeshGatewayApiEntity(api: API): Promise<Entity> {
    if (!this.connection || !this.latestTokensResponse || !this.apisEndpoint) {
      throw new Error('Unable to getGlooMeshGatewayApiEntity');
    }
    let schema = api.openapiSpec;
    if (!schema && !api.openapiSpecFetchErr) {
      // If the schema was not attempted to be fetched with
      // the /apis call, we individually fetch it here.
      // This is for backwards compatibility only, for
      // when the schema was not in the /apis response.
      const schemaRes = await fetch(
        `${this.apisEndpoint}/${api.apiId}/schema`,
        {
          headers: {
            Authorization: `Bearer ${this.latestTokensResponse.access_token}`,
          },
        },
      );
      schema = (await schemaRes.json()) as APISchema;
    }
    return this.entityBuilder.buildApiVersionEntity(
      api.apiId,
      api.apiVersion,
      api.description,
      schema,
    );
  }

  /**
   * A helper function for getting the API's from the Portal Server.
   * This abstracts away the "gloo-gateway"/"gloo-mesh-gateway" portal server details.
   */
  async fetchAPIs() {
    if (!this.connection || !this.latestTokensResponse || !this.apisEndpoint) {
      throw new Error('Unable to fetch APIs');
    }
    const fetchInit: fetch.RequestInit = {
      headers: {
        Authorization: `Bearer ${this.latestTokensResponse.access_token}`,
      },
    };

    //
    // Make the initial apis request.
    //
    if (this.debugLogging) {
      this.log(
        `Fetching APIs from ${this.apisEndpoint} (identified as ${this.portalServerType}) with header: "Authorization: Bearer ${this.latestTokensResponse.access_token}"`,
      );
    }
    let res: ApisEndpointResponseType = null;
    try {
      res = await (await fetch(this.apisEndpoint, fetchInit)).json();
    } catch {}
    if (
      // If we didn't just try the GG endpoint, and
      this.apisEndpoint !== this.gg_apisEndpoint &&
      // the GG+GMG endpoints aren't the same, and
      this.gg_apisEndpoint !== this.gmg_apisEndpoint &&
      // the GMG request failed, or
      (!res ||
        // the GMG request didn't fail, it returned data, but it's not an array, or
        !Array.isArray(res) ||
        // the GMG request didn't fail, it returned data, but
        (!!res.length &&
          // it didn't return either GG or GMG data,
          !('id' in res[0]) &&
          !('apiVersions' in res[0])))
    ) {
      // try with the GG endpoint.
      if (this.debugLogging) {
        this.log(`Retrying fetching APIs using ${this.gg_apisEndpoint}`);
      }
      try {
        res = await (await fetch(this.gg_apisEndpoint, fetchInit)).json();
      } catch {}
    }
    if (this.debugLogging) {
      this.log(
        'Performed fetch and recieved the response: ' + JSON.stringify(res),
      );
    }

    let processedAPIs: (API | ApiVersionExtended)[] = [];
    if (!!res?.length) {
      //
      // Check the portal server API type
      //
      var identifiedPortalServerType: PortalServerType = 'unknown';
      if ('id' in res[0]) {
        identifiedPortalServerType = 'gloo-gateway';
      } else {
        identifiedPortalServerType = 'gloo-mesh-gateway';
      }
      if (
        this.debugLogging &&
        this.portalServerType !== identifiedPortalServerType
      ) {
        this.log(
          'Portal server type identified as: ' + identifiedPortalServerType,
        );
      }
      this.updatePortalServerType(identifiedPortalServerType);

      //
      // Transform the data
      //
      // For "gloo-mesh-gateway"
      if (identifiedPortalServerType === 'gloo-mesh-gateway') {
        if ('apiVersions' in res[0]) {
          // Some versions return the data grouped by APIProduct,
          // so we convert it back to a list here.
          const apiProducts = res as APIProduct[];
          processedAPIs = apiProducts.reduce((accum, curProd) => {
            accum.push(
              ...curProd.apiVersions.reduce((accumVer, api) => {
                accumVer.push({
                  apiId: api.apiId,
                  apiProductDisplayName: curProd.apiProductDisplayName,
                  apiProductId: curProd.apiProductId,
                  apiVersion: api.apiVersion,
                  contact: api.contact,
                  customMetadata: api.customMetadata,
                  description: api.description,
                  license: api.license,
                  termsOfService: api.termsOfService,
                  title: api.title,
                  usagePlans: api.usagePlans,
                });
                return accumVer;
              }, [] as API[]),
            );
            return accum;
          }, [] as API[]);
        } else {
          processedAPIs = res as API[];
        }
      }
      // For "gloo-gateway"
      else if (identifiedPortalServerType === 'gloo-gateway') {
        // Fetch the information for each version.
        const summaries = res as ApiProductSummary[];
        // Reset the processedAPIs so we can add each version to it.
        processedAPIs = [];
        // We have to do a separate request for each ApiProduct in order to get their versions.
        for (let i = 0; i < summaries.length; i++) {
          const apiProductSummary = summaries[i];
          const getVersionsUrl = `${this.apisEndpoint}/${apiProductSummary.id}/versions`;
          if (this.debugLogging) {
            this.log(
              `Fetching API versions from ${getVersionsUrl} (identified as ${this.portalServerType}).`,
            );
          }
          let versions: ApiVersion[] = [];
          try {
            versions = await (await fetch(getVersionsUrl, fetchInit)).json();
          } catch {}
          if (this.debugLogging) {
            this.log(
              `Fetched ${getVersionsUrl} (identified as ${
                this.portalServerType
              }) and recieved the response: ${JSON.stringify(versions)}`,
            );
          }
          if (!!versions?.length) {
            // Add each API product's version to the processedAPIs.
            processedAPIs.push(
              ...versions.map(v => ({
                ...v,
                apiProductDescription: apiProductSummary.description,
              })),
            );
          }
        }
      }
    }

    return processedAPIs;
  }
}
