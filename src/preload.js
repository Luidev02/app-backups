const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Authentication
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", username, password),
  register: (userData) => ipcRenderer.invoke("auth:register", userData),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getCurrentUser: () => ipcRenderer.invoke("auth:getCurrentUser"),
  isAuthenticated: () => ipcRenderer.invoke("auth:isAuthenticated"),

  // Backup operations
  getUserBackupFolders: () => ipcRenderer.invoke("backup:getUserBackupFolders"),
  addBackupFolder: (folderPath, folderName) =>
    ipcRenderer.invoke("backup:addBackupFolder", folderPath, folderName),
  removeBackupFolder: (folderId) =>
    ipcRenderer.invoke("backup:removeBackupFolder", folderId),
  getBackupHistory: (limit) =>
    ipcRenderer.invoke("backup:getBackupHistory", limit),
  startBackup: () => ipcRenderer.invoke("backup:startBackup"),
  getBackupJobStatus: (jobId) =>
    ipcRenderer.invoke("backup:getBackupJobStatus", jobId),
  getBackupStats: () => ipcRenderer.invoke("backup:getBackupStats"),

  // File system operations
  selectFolder: () => ipcRenderer.invoke("fs:selectFolder"),

  // Navigation
  navigateToPanel: () => ipcRenderer.invoke("nav:navigateToPanel"),
  navigateToLogin: () => ipcRenderer.invoke("nav:navigateToLogin"),

  // Settings
  getStorageProviders: () => ipcRenderer.invoke("settings:getStorageProviders"),
  saveStorageConfig: (config) =>
    ipcRenderer.invoke("settings:saveStorageConfig", config),
  getStorageConfigs: () => ipcRenderer.invoke("settings:getStorageConfigs"),

  // Utilities
  formatFileSize: (bytes) => ipcRenderer.invoke("utils:formatFileSize", bytes),
  formatDate: (date) => ipcRenderer.invoke("utils:formatDate", date),
  getAppVersion: () => ipcRenderer.invoke("utils:getAppVersion"),
});
