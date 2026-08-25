const { expo } = require('./app.json');

/**
 * Expo only inlines EXPO_PUBLIC_* variables in application code. Firebase's
 * client configuration is public by design, so bridge the requested Replit
 * Secret names into the Expo manifest at build/start time.
 */
module.exports = {
  ...expo,
  extra: {
    ...(expo.extra ?? {}),
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    },
  },
};