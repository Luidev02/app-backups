const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("fs");
const { initDB } = require("./config/database.config.js");
const authService = require("./service/auth.service.js");
const backupService = require("./service/backup.service.js");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow;

const initServices = async () => {
  await initDB();
  await authService.initDefaultUser();
  await backupService.initStorageProviders();
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Load the login page initially
  mainWindow.loadFile(path.join(__dirname, "login.html"));
};

// Initialize IPC handlers
const initIPC = () => {
  // Authentication handlers
  ipcMain.handle("auth:login", async (event, username, password) => {
    const result = await authService.login(username, password);
    return result;
  });

  ipcMain.handle("auth:register", async (event, userData) => {
    const result = await authService.register(userData);
    return result;
  });

  ipcMain.handle("auth:logout", async (event) => {
    authService.logout();
    return { success: true };
  });

  ipcMain.handle("auth:getCurrentUser", async (event) => {
    return authService.getCurrentUser();
  });

  ipcMain.handle("auth:isAuthenticated", async (event) => {
    return authService.isAuthenticated();
  });

  // Backup handlers
  ipcMain.handle("backup:getUserBackupFolders", async (event) => {
    const user = authService.getCurrentUser();
    if (!user) return [];
    return await backupService.getUserBackupFolders(user.id);
  });

  ipcMain.handle(
    "backup:addBackupFolder",
    async (event, folderPath, folderName) => {
      const user = authService.getCurrentUser();
      if (!user) return { success: false, error: "No authenticated user" };
      return await backupService.addBackupFolder(
        user.id,
        folderPath,
        folderName
      );
    }
  );

  ipcMain.handle("backup:removeBackupFolder", async (event, folderId) => {
    // TODO: Implement remove backup folder
    return { success: true };
  });

  ipcMain.handle("backup:getBackupHistory", async (event, limit = 50) => {
    const user = authService.getCurrentUser();
    if (!user) return [];
    return await backupService.getBackupHistory(user.id, limit);
  });

  ipcMain.handle("backup:startBackup", async (event) => {
    const user = authService.getCurrentUser();
    if (!user) return { success: false, error: "No authenticated user" };
    return await backupService.startBackup(user.id);
  });

  ipcMain.handle("backup:getBackupJobStatus", async (event, jobId) => {
    return await backupService.getBackupJobStatus(jobId);
  });

  ipcMain.handle("backup:getBackupStats", async (event) => {
    const user = authService.getCurrentUser();
    if (!user)
      return {
        totalBackups: 0,
        successfulBackups: 0,
        failedBackups: 0,
        totalSize: 0,
        lastBackup: null,
      };
    return await backupService.getBackupStats(user.id);
  });

  // File system handlers
  ipcMain.handle("fs:selectFolder", async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Seleccionar carpeta para backup",
    });
    return result;
  });

  // Navigation handlers
  ipcMain.handle("nav:navigateToPanel", async (event) => {
    mainWindow.loadFile(path.join(__dirname, "panel.html"));
  });

  ipcMain.handle("nav:navigateToLogin", async (event) => {
    mainWindow.loadFile(path.join(__dirname, "login.html"));
  });

  // Settings handlers
  ipcMain.handle("settings:getStorageProviders", async (event) => {
    // TODO: Implement get storage providers
    return [];
  });

  ipcMain.handle("settings:saveStorageConfig", async (event, config) => {
    // TODO: Implement save storage config
    return { success: true };
  });

  ipcMain.handle("settings:getStorageConfigs", async (event) => {
    // TODO: Implement get storage configs
    return [];
  });

  // Utility handlers
  ipcMain.handle("utils:formatFileSize", (event, bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  });

  ipcMain.handle("utils:formatDate", (event, date) => {
    return new Date(date).toLocaleString("es-ES");
  });

  // Get app version from package.json
  ipcMain.handle("utils:getAppVersion", () => {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
      );
      return packageJson.version;
    } catch (error) {
      console.error("Error reading package.json:", error);
      return "1.0.0";
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await initServices();
  initIPC();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
