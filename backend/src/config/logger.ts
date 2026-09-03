import pino from 'pino';
export const makeLogger = (level = 'info') => pino({ level, redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'credentialHash', 'credentialRef', 'token'], censor: '[REDACTED]' } });
