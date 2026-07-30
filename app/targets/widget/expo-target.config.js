/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'UbuntuWidget',
  displayName: 'UBUNTU',
  // Lock screen widgets interactifs + containerBackground : iOS 17.
  deploymentTarget: '17.0',
  colors: {
    $accent: '#C03028',
    $widgetBackground: '#E8DFC8',
  },
  // Même app group que l'app : l'état de session y est partagé.
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
