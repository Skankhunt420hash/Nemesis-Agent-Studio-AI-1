const appId = process.env.APP_ID || 'ai.openclaw.agentstudio';
const appName = process.env.APP_NAME || 'OpenClaw Agent Studio';

module.exports = {
  appId,
  appName,
  webDir: 'public',
  server: process.env.AGENT_STUDIO_URL
    ? {
        url: process.env.AGENT_STUDIO_URL,
        cleartext: true,
        androidScheme: 'https',
      }
    : undefined,
  android: {
    allowMixedContent: true,
  },
};
