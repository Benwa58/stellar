import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stellar.music',
  appName: 'Stellar',
  webDir: 'build',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0a1a',
  },
};

export default config;
