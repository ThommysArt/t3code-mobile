const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * When credentials.json is present (local machine), wire the release keystore into
 * android/app/build.gradle so `./gradlew assembleRelease` can match EAS preview signing.
 * EAS cloud builds typically omit credentials.json and keep the template defaults.
 */
function loadLocalKeystore(projectRoot) {
  const credentialsPath = path.join(projectRoot, "credentials.json");
  if (!fs.existsSync(credentialsPath)) {
    return null;
  }

  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    const keystore = credentials?.android?.keystore;
    if (
      !keystore?.keystorePath ||
      !keystore?.keystorePassword ||
      !keystore?.keyAlias ||
      !keystore?.keyPassword
    ) {
      return null;
    }

    const absoluteKeystorePath = path.resolve(projectRoot, keystore.keystorePath);
    if (!fs.existsSync(absoluteKeystorePath)) {
      return null;
    }

    return {
      storeFile: absoluteKeystorePath.replace(/\\/g, "/"),
      storePassword: String(keystore.keystorePassword),
      keyAlias: String(keystore.keyAlias),
      keyPassword: String(keystore.keyPassword),
    };
  } catch {
    return null;
  }
}

function escapeGroovyString(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function applyReleaseSigning(buildGradle, keystore) {
  const storeFile = escapeGroovyString(keystore.storeFile);
  const storePassword = escapeGroovyString(keystore.storePassword);
  const keyAlias = escapeGroovyString(keystore.keyAlias);
  const keyPassword = escapeGroovyString(keystore.keyPassword);

  if (
    buildGradle.includes(keystore.storeFile) &&
    /signingConfigs\s*\{[^}]*release\s*\{/s.test(buildGradle)
  ) {
    return buildGradle;
  }

  // Only rewrite the signingConfigs { ... } block (stop at the matching close),
  // never confuse it with buildTypes { release { ... } }.
  const signingConfigsMatch = buildGradle.match(
    /signingConfigs\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/
  );
  if (signingConfigsMatch == null) {
    return buildGradle;
  }

  const originalSigningConfigs = signingConfigsMatch[0];
  let nextSigningConfigs = originalSigningConfigs;

  const releaseConfigBody = `        release {
            storeFile file('${storeFile}')
            storePassword '${storePassword}'
            keyAlias '${keyAlias}'
            keyPassword '${keyPassword}'
        }`;

  if (/release\s*\{/.test(nextSigningConfigs)) {
    nextSigningConfigs = nextSigningConfigs.replace(
      /release\s*\{(?:[^{}]|\{[^{}]*\})*\}/,
      releaseConfigBody.trim()
    );
  } else {
    nextSigningConfigs = nextSigningConfigs.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {\n${releaseConfigBody}`
    );
  }

  let next = buildGradle.replace(originalSigningConfigs, nextSigningConfigs);

  // Point buildTypes.release at signingConfigs.release instead of debug.
  next = next.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    "$1signingConfig signingConfigs.release"
  );

  if (
    /buildTypes\s*\{[\s\S]*?release\s*\{/.test(next) &&
    !/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(
      next
    )
  ) {
    next = next.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
      "$1\n            signingConfig signingConfigs.release"
    );
  }

  return next;
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (nextConfig) => {
    const keystore = loadLocalKeystore(nextConfig.modRequest.projectRoot);
    if (keystore == null) {
      return nextConfig;
    }

    nextConfig.modResults.contents = applyReleaseSigning(
      nextConfig.modResults.contents,
      keystore
    );
    return nextConfig;
  });
};
