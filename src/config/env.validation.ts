const devDefaults = {
  JWT_ACCESS_SECRET: 'dev-access-secret-change-before-production',
  JWT_REFRESH_SECRET: 'dev-refresh-secret-change-before-production',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: '30',
  PORT: '3000',
};

export function validateEnv(config: Record<string, unknown>) {
  const env: Record<string, unknown> = {
    ...devDefaults,
    ...config,
  };

  const nodeEnv = String(env.NODE_ENV ?? 'development');
  const databaseUrl = String(env.DATABASE_URL ?? '');
  if (!databaseUrl && nodeEnv === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }

  const accessSecret = String(env.JWT_ACCESS_SECRET ?? '');
  const refreshSecret = String(env.JWT_REFRESH_SECRET ?? '');
  if (nodeEnv === 'production') {
    if (accessSecret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
    }
    if (refreshSecret.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
    }
    if (String(env.SMS_PROVIDER ?? 'aliyun') !== 'console') {
      for (const key of ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', 'ALIYUN_SMS_TEMPLATE_CODE']) {
        if (!env[key]) throw new Error(`${key} is required in production`);
      }
    }
  }

  const refreshDays = Number(env.JWT_REFRESH_EXPIRES_IN_DAYS);
  if (!Number.isInteger(refreshDays) || refreshDays <= 0) {
    throw new Error('JWT_REFRESH_EXPIRES_IN_DAYS must be a positive integer');
  }

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return {
    ...env,
    JWT_REFRESH_EXPIRES_IN_DAYS: String(refreshDays),
    PORT: String(port),
  };
}
