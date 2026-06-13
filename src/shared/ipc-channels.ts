export const IPC = {
  // Instances
  instancesList: 'instances:list',
  instancesCreate: 'instances:create',
  instancesDelete: 'instances:delete',
  instancesUpdate: 'instances:update',
  instancesDuplicate: 'instances:duplicate',
  instancesOpenFolder: 'instances:openFolder',
  instancesOpenCrashReports: 'instances:openCrashReports',
  instancesPickIcon: 'instances:pickIcon',

  // Servers
  serversList: 'servers:list',
  serversCreate: 'servers:create',
  serversDelete: 'servers:delete',
  serversStart: 'servers:start',
  serversStop: 'servers:stop',
  serversCommand: 'servers:command',
  serversOpenFolder: 'servers:openFolder',
  serversAddMods: 'servers:addMods',
  serversGetProps: 'servers:getProps',
  serversSetProps: 'servers:setProps',
  serversCreateProgress: 'servers:createProgress',
  serversLog: 'servers:log',
  serversStatus: 'servers:status',
  serversTunnelStart: 'servers:tunnelStart',
  serversTunnelStop: 'servers:tunnelStop',
  serversTunnelStatus: 'servers:tunnelStatus',

  // Worlds / backups
  worldsList: 'worlds:list',
  worldsBackup: 'worlds:backup',
  worldsRestore: 'worlds:restore',
  worldsDelete: 'worlds:delete',
  worldsOpenFolder: 'worlds:openFolder',

  // Minecraft
  mcVersions: 'mc:versions',
  mcLaunch: 'mc:launch',
  mcLaunchProgress: 'mc:launchProgress',
  mcLaunchStatus: 'mc:launchStatus',
  mcLog: 'mc:log',

  // Modloaders
  fabricVersions: 'fabric:versions',
  forgeVersions: 'forge:versions',
  neoforgeVersions: 'neoforge:versions',

  // Mods / content (mods, resourcepacks, shaders)
  modsSearch: 'mods:search',
  modsFiles: 'mods:files',
  modsInstall: 'mods:install',
  modsInstalled: 'mods:installed',
  modsToggle: 'mods:toggle',
  modsDelete: 'mods:delete',
  modsAddLocal: 'mods:addLocal',
  modsCheckUpdates: 'mods:checkUpdates',
  modsUpdate: 'mods:update',
  modsFetchIcons: 'mods:fetchIcons',

  // Modpacks
  modpacksSearch: 'modpacks:search',
  modpacksInstall: 'modpacks:install',
  modpacksVersions: 'modpacks:versions',
  modpacksInstallFile: 'modpacks:installFile',
  packImport: 'pack:import',
  packExport: 'pack:export',
  packProgress: 'pack:progress',
  packImported: 'pack:imported',

  // Accounts
  accountsList: 'accounts:list',
  accountsMicrosoftLogin: 'accounts:msLogin',
  accountsOfflineLogin: 'accounts:offlineLogin',
  accountsRemove: 'accounts:remove',
  accountsSelectActive: 'accounts:selectActive',
  accountsActive: 'accounts:active',
  accountsSkin: 'accounts:skin',

  // Skin library
  skinsList: 'skins:list',
  skinsAdd: 'skins:add',
  skinsUpdate: 'skins:update',
  skinsDelete: 'skins:delete',
  skinsData: 'skins:data',
  skinsApply: 'skins:apply',
  skinsReset: 'skins:reset',

  // Settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // System
  systemDetectJava: 'system:detectJava',
  appVersion: 'app:version',

  // Self-update
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateStatus: 'update:status'
} as const;
