import { LoggerService, SchedulerService } from '@backstage/backend-plugin-api';
import { Entity, EntityMeta } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import fetch from 'node-fetch';
import { API, APIProduct, APISchema, AccessTokensResponse } from './api-types';
import {
  getClientId,
  getClientSecret,
  getPortalServerUrl,
  getTokenEndpoint,
} from './configHelpers';
import {
  doAccessTokenRequest,
  parseJwt,
  sanitizeStringForEntity,
} from './utility';

/**
 * Provides API entities from the Gloo Platform Portal REST server.
 */
export class GlooPlatformPortalProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private logger: LoggerService;
  private config: Config;
  private latestTokensResponse?: AccessTokensResponse;
  private debugLogging = false;

  log = (s: string) => this.logger?.info(`gloo-platform-portal: ${s}`);
  warn = (s: string) => this.logger?.warn(`gloo-platform-portal: ${s}`);
  error = (s: string) => this.logger?.error(`gloo-platform-portal: ${s}`);
  getProviderName = () => `gloo-platform-portal-backend-provider`;
  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
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
      getTokenEndpoint(this.error, this.warn, this.config),
      getClientId(this.error, this.warn, this.config),
      getClientSecret(this.error, this.warn, this.config),
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
    const bsGroupName = 'solo-io-service-accounts';
    const bsServiceAccountName = 'gloo-platform-portal-service-account';
    const bsSystemName = 'gloo-platform-portal-apis';
    const portalServerUrl = getPortalServerUrl(
      this.error,
      this.warn,
      this.config,
    );
    const apisEndpoint = `${portalServerUrl}/apis`;
    //
    // Make API request
    try {
      const fullRequestURI = apisEndpoint + '?includeSchema=true';
      if (this.debugLogging) {
        this.log(
          `Fetching APIs from ${fullRequestURI} with header: "Authorization: Bearer ${this.latestTokensResponse.access_token}"`,
        );
      }
      const res = await fetch(fullRequestURI, {
        headers: {
          Authorization: `Bearer ${this.latestTokensResponse.access_token}`,
        },
      });
      const resText = await res.text();
      if (this.debugLogging) {
        this.log('Performed fetch and recieved the response text: ' + resText);
      }
      let processedAPIs = JSON.parse(resText) as API[];
      if (this.debugLogging) {
        this.log('Parsed the text into JSON.');
      }

      //
      // The server returns the APIs grouped by APIProduct,
      // so we can convert it back to a list here.
      //
      if (!!processedAPIs?.length && 'apiVersions' in processedAPIs[0]) {
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

      //
      // Convert the APIs to entities
      for (let i = 0; i < processedAPIs.length; i++) {
        const apiVersion = processedAPIs[i];
        let schema = apiVersion.openapiSpec;
        if (!schema && !apiVersion.openapiSpecFetchErr) {
          // If the schema was not attempted to be fetched with
          // the /apis call, we individually fetch it here.
          // This is for backwards compatibility only, for
          // when the schema was not in the /apis response.
          const schemaRes = await fetch(
            `${apisEndpoint}/${apiVersion.apiId}/schema`,
            {
              headers: {
                Authorization: `Bearer ${this.latestTokensResponse.access_token}`,
              },
            },
          );
          schema = (await schemaRes.json()) as APISchema;
        }
        entities.push({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'API',
          metadata: {
            tags: [
              'gloo-platform',
              ...(!!apiVersion.apiVersion
                ? [
                    'api-version-' +
                      sanitizeStringForEntity('tag', apiVersion.apiVersion),
                  ]
                : []),
            ],
            name: sanitizeStringForEntity('name', apiVersion.apiId),
            title: apiVersion.apiId,
            description: apiVersion.description,
            annotations: {
              'backstage.io/managed-by-location': `url:${apisEndpoint}`,
              'backstage.io/managed-by-origin-location': `url:${apisEndpoint}`,
            },
          } as EntityMeta,
          spec: {
            type: 'openapi',
            lifecycle: 'production',
            system: bsSystemName,
            owner: `user:${bsServiceAccountName}`,
            definition: JSON.stringify(schema),
          },
        });
      }
      if (this.debugLogging) {
        this.log(
          'Transformed APIs into new entities: ' + JSON.stringify(entities),
        );
      }
    } catch (e) {
      this.error(
        `Could not get APIs from the portal server endpoint or their schemas or transform them into entities (${apisEndpoint}). Error: ${JSON.stringify(
          e,
        )}`,
      );
    }

    const locationKey = `gloo-platform-portal-provider`;
    await this.connection.applyMutation({
      type: 'full',
      entities: [
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Group',
            metadata: {
              name: bsGroupName,
              annotations: {
                'backstage.io/managed-by-location': `url:${portalServerUrl}`,
                'backstage.io/managed-by-origin-location': `url:${portalServerUrl}`,
              },
            },
            spec: {
              type: 'service-account-group',
              children: [],
              members: [bsServiceAccountName],
            },
          },
        },
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'User',
            metadata: {
              name: bsServiceAccountName,
              annotations: {
                'backstage.io/managed-by-location': `url:${portalServerUrl}`,
                'backstage.io/managed-by-origin-location': `url:${portalServerUrl}`,
              },
            },
            spec: {
              displayName: 'Solo.io Service Account',
              email: '',
              picture: '',
              memberOf: [bsGroupName],
            },
          },
        },
        // {
        //   locationKey,
        //   entity: {
        //     apiVersion: 'backstage.io/v1alpha1',
        //     kind: 'Domain',
        //     metadata: {
        //       tags: ['gloo-platform'],
        //       name: 'api-product',
        //       description: 'Gloo Platform Portal ApiProduct resources.',
        //       annotations: {
        //         'backstage.io/managed-by-location': 'url:' + apisEndpoint,
        //         'backstage.io/managed-by-origin-location':
        //           'url:' + apisEndpoint,
        //       },
        //     } as EntityMeta,
        //     spec: {
        //       owner: 'user:' + bsServiceAccountName,
        //     },
        //   },
        // },
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'System',
            metadata: {
              tags: ['gloo-platform'],
              name: bsSystemName,
              title: 'Gloo Platform Portal APIs',
              annotations: {
                'backstage.io/managed-by-location': `url:${apisEndpoint}`,
                'backstage.io/managed-by-origin-location': `url:${apisEndpoint}`,
              },
            } as EntityMeta,
            spec: {
              owner: `user:${bsServiceAccountName}`,
              // domain: 'api-product',
            },
          },
        },
        ...entities.map(entity => ({ locationKey, entity })),
      ],
    });
  }
}
