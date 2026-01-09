import { Config } from '@backstage/config';

type logFn = (s: string) => any;

export class ConfigUtil {
  logErr: logFn;
  logWarning: logFn;
  config: Config;

  constructor(logErr: logFn, logWarning: logFn, config: Config) {
    this.logErr = logErr;
    this.logWarning = logWarning;
    this.config = config;
  }

  getPortalServerUrl() {
    if (!this.config) {
      this.logErr('No backstage config found when getting portal server url.');
      return '';
    }
    let value = this.config.getOptionalString(
      'glooPlatformPortal.backend.portalServerUrl',
    );
    // Remove trailing slash if supplied.
    if (!!value && value.at(-1) === '/')
      value = value.substring(0, value.length - 1);
    return value ?? 'http://localhost:31080/v1';
  }

  getClientSecret() {
    if (!this.config) {
      this.logErr('No backstage config found when getting client secret.');
      return '';
    }
    const value = this.config.getOptionalString(
      'glooPlatformPortal.backend.clientSecret',
    );
    if (!value) {
      this.logWarning(
        'No glooPlatformPortal.backend.clientSecret found in app-config.local.yaml',
      );
    }
    return value ?? '';
  }

  getClientId() {
    if (!this.config) {
      this.logErr('No backstage config found when getting client id.');
      return '';
    }
    const value = this.config.getOptionalString(
      'glooPlatformPortal.backend.clientId',
    );
    if (!value) {
      this.logWarning(
        'No glooPlatformPortal.backend.clientId found in app-config.local.yaml',
      );
    }
    return value ?? '';
  }

  getTokenEndpoint() {
    if (!this.config) {
      this.logErr('No backstage config found when getting token endpoint.');
      return '';
    }
    const value = this.config.getOptionalString(
      'glooPlatformPortal.backend.tokenEndpoint',
    );
    if (!value) {
      this.logWarning(
        'No glooPlatformPortal.backend.tokenEndpoint found in app-config.local.yaml',
      );
    }
    return value ?? '';
  }
}
