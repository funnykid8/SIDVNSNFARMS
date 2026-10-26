import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.nsnfarms.erp',
  appName: 'NSN Farms',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: true,
      iosKeychainPrefix: 'nsnfarms',
      iosBiometric: { biometricAuth: false },
      androidIsEncryption: true,
      androidBiometric: { biometricAuth: false },
      electronIsEncryption: true
    }
  }
};
export default config;
