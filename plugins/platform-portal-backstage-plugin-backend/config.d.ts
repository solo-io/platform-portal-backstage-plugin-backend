export interface Config {
  glooPlatformPortal: {
    /**
     * @visibility frontend
     */
    portalServerUrl: string;

    /**
     * The oauth client id.
     * In keycloak, this is shown in the client settings
     * of your keycloak instances UI.
     * @visibility frontend
     */
    clientId: string;

    /**
     * This is the endpoint to get the oauth token.
     * In keycloak, this is the `token_endpoint` property from:
     * <your-keycloak-url>/realms/<your-realm>/.well-known/openid-configuration
     * @visibility frontend
     */
    tokenEndpoint: string;

    /**
     * The oauth client secret.
     * In keycloak, this is shown in the client settings
     * of your keycloak instances UI.
     * @visibility backend
     */
    clientSecret: string;

    /**
     * The username of the service account account which can access the
     * APIs that will be synced with Backstage.
     * @visibility backend
     */
    serviceAccountUsername: string;

    /**
     * The password of the service account account which can access the
     * APIs that will be synced with Backstage.
     * @visibility backend
     */
    serviceAccountPassword: string;
  };
}
