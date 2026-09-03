import pino from 'pino';
export const makeLogger = (level = 'info') => pino({ level, redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'credentialHash', 'credentialRef', 'token', 'store_passwd', 'SSLCOMMERZ_STORE_PASSWORD', 'gatewaySessionKey', 'sessionkey', 'val_id', 'card_no', 'req.body', 'req.query', 'req.url', 'res.headers.location'], censor: '[REDACTED]' } });
