import { Config } from '@backstage/config';

type logFn = (s: string) => any;

export const getPortalServerUrl = (
  logErr: logFn,
  _: logFn,
  config: Config | undefined,
) => {
  if (!config) {
    logErr('No backstage config found when getting portal server url.');
    return '';
  }
  let value = config.getOptionalString(
    'glooPlatformPortal.backend.portalServerUrl',
  );
  // Remove trailing slash if supplied.
  if (!!value && value.at(-1) === '/')
    value = value.substring(0, value.length - 1);
  return value ?? 'http://localhost:31080/v1';
};

export const getClientSecret = (
  logErr: logFn,
  logWarning: logFn,
  config: Config,
) => {
  if (!config) {
    logErr('No backstage config found when getting client secret.');
    return '';
  }
  const value = config.getOptionalString(
    'glooPlatformPortal.backend.clientSecret',
  );
  if (!value) {
    logWarning(
      'No glooPlatformPortal.backend.clientSecret found in app-config.local.yaml',
    );
  }
  return value ?? '';
};

export const getClientId = (
  logErr: logFn,
  logWarning: logFn,
  config: Config,
) => {
  if (!config) {
    logErr('No backstage config found when getting client id.');
    return '';
  }
  const value = config.getOptionalString('glooPlatformPortal.backend.clientId');
  if (!value) {
    logWarning(
      'No glooPlatformPortal.backend.clientId found in app-config.local.yaml',
    );
  }
  return value ?? '';
};

export const getTokenEndpoint = (
  logErr: logFn,
  logWarning: logFn,
  config: Config,
) => {
  if (!config) {
    logErr('No backstage config found when getting token endpoint.');
    return '';
  }
  const value = config.getOptionalString(
    'glooPlatformPortal.backend.tokenEndpoint',
  );
  if (!value) {
    logWarning(
      'No glooPlatformPortal.backend.tokenEndpoint found in app-config.local.yaml',
    );
  }
  return value ?? '';
};
