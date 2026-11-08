const base = require('./manifest.json');
const { signInPage } = require('./shared');

// Chrome and Edge share this manifest.
module.exports = {
  ...base,

  side_panel: { default_path: 'side-panel-default/index.html' },

  permissions: [
    ...base.permissions,
    'identity',
    'favicon',
    'scripting',
    'declarativeNetRequestWithHostAccess',
  ],

  optional_permissions: ['sidePanel', 'nativeMessaging'],

  host_permissions: [...base.host_permissions, '<all_urls>'],

  web_accessible_resources: [
    ...base.web_accessible_resources,
    signInPage,
    {
      resources: [
        'cli-inspector/index.js',
        'cli-mode/index.js',
        'cli-mode/index.css',
        // Framed in the page, so it has to be; its own files load from it.
        'cli-mode/note/index.html',
      ],
      matches: ['<all_urls>'],
    },
  ],
};
