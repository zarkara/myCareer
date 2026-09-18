// The panel opens only when the user clicks the toolbar button. Combined with activeTab and
// no host_permissions, that means this extension can never read a page the user did not ask
// it to read, and never reads anything in the background.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
