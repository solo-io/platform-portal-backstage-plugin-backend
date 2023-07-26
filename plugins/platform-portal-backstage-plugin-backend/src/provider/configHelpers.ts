import { Config } from '@backstage/config';

type logFn = (s: string) => any;

export const getPortalServerUrl = (_: logFn, config: Config) => {
  let value = config.getOptionalString('glooPlatformPortal.portalServerUrl');
  // Remove trailing slash if supplied.
  if (!!value && value.at(-1) === '/')
    value = value.substring(0, value.length - 1);
  return value ?? 'http://localhost:31080/v1';
};

export const getClientSecret = (logWarning: logFn, config: Config) => {
  const value = config.getOptionalString('glooPlatformPortal.clientSecret');
  if (!value) {
    logWarning(
      'No glooPlatformPortal.clientSecret found in app-config.local.yaml',
    );
  }
  return value ?? '';
};

export const getClientId = (logWarning: logFn, config: Config) => {
  const value = config.getOptionalString('glooPlatformPortal.clientId');
  if (!value) {
    logWarning('No glooPlatformPortal.clientId found in app-config.local.yaml');
  }
  return value ?? '';
};

export const getTokenEndpoint = (logWarning: logFn, config: Config) => {
  const value = config.getOptionalString('glooPlatformPortal.tokenEndpoint');
  if (!value) {
    logWarning(
      'No glooPlatformPortal.tokenEndpoint found in app-config.local.yaml',
    );
  }
  return value ?? '';
};

export const getServiceAccountPassword = (
  logWarning: logFn,
  config: Config,
) => {
  const value = config.getOptionalString(
    'glooPlatformPortal.serviceAccountPassword',
  );
  if (!value) {
    logWarning(
      'No glooPlatformPortal.serviceAccountPassword found in app-config.local.yaml',
    );
  }
  return value ?? '';
};

export const getServiceAccountUsername = (
  logWarning: logFn,
  config: Config,
) => {
  const value = config.getOptionalString(
    'glooPlatformPortal.serviceAccountUsername',
  );
  if (!value) {
    logWarning(
      'No glooPlatformPortal.serviceAccountUsername found in app-config.local.yaml',
    );
  }
  return value ?? '';
};
