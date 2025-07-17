const fs = require("fs").promises;
const path = require("path");
const { openDB } = require("../config/database.config.js");

class BackupService {
  constructor() {
    this.activeJobs = new Map();
    this.jobId = 1;
  }

  // Get user's backup folders
  async getUserBackupFolders(userId) {
    try {
      const db = await openDB();
      const folders = await db.all(
        `
        SELECT * FROM backup_folders 
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
      `,
        [userId]
      );
      await db.close();
      return folders;
    } catch (error) {
      console.error("Error getting backup folders:", error);
      return [];
    }
  }

  // Add backup folder
  async addBackupFolder(userId, folderPath, folderName) {
    try {
      const db = await openDB();

      // Check if folder already exists for this user
      const existingFolder = await db.get(
        `
        SELECT id FROM backup_folders 
        WHERE user_id = ? AND folder_path = ?
      `,
        [userId, folderPath]
      );

      if (existingFolder) {
        throw new Error("Esta carpeta ya está agregada");
      }

      // Get folder stats
      const stats = await this.getFolderStats(folderPath);

      const result = await db.run(
        `
        INSERT INTO backup_folders (
          user_id, folder_path, folder_name, is_active, 
          include_subfolders, total_size_bytes, file_count, last_scan_date
        ) VALUES (?, ?, ?, 1, 1, ?, ?, CURRENT_TIMESTAMP)
      `,
        [
          userId,
          folderPath,
          folderName || path.basename(folderPath),
          stats.size,
          stats.files,
        ]
      );

      await db.close();
      return { success: true, folderId: result.lastID };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get folder statistics
  async getFolderStats(folderPath) {
    let totalSize = 0;
    let totalFiles = 0;

    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(folderPath, item.name);

        if (item.isDirectory()) {
          const subStats = await this.getFolderStats(itemPath);
          totalSize += subStats.size;
          totalFiles += subStats.files;
        } else {
          try {
            const stats = await fs.stat(itemPath);
            totalSize += stats.size;
            totalFiles++;
          } catch (error) {
            // Skip files that can't be accessed
          }
        }
      }
    } catch (error) {
      console.error("Error getting folder stats:", error);
    }

    return { size: totalSize, files: totalFiles };
  }

  // Get backup history
  async getBackupHistory(userId, limit = 50) {
    try {
      const db = await openDB();
      const history = await db.all(
        `
        SELECT 
          bj.*,
          sc.name as storage_name,
          sp.name as provider_name
        FROM backup_jobs bj
        LEFT JOIN schedule_storage ss ON bj.schedule_id = ss.schedule_id
        LEFT JOIN storage_configs sc ON ss.storage_config_id = sc.id
        LEFT JOIN storage_providers sp ON sc.provider_id = sp.id
        WHERE bj.user_id = ?
        ORDER BY bj.created_at DESC
        LIMIT ?
      `,
        [userId, limit]
      );
      await db.close();
      return history;
    } catch (error) {
      console.error("Error getting backup history:", error);
      return [];
    }
  }

  // Start backup job
  async startBackup(userId, scheduleId = null) {
    try {
      const db = await openDB();

      // Create new backup job
      const jobResult = await db.run(
        `
        INSERT INTO backup_jobs (
          user_id, schedule_id, job_type, status, started_at, progress_percentage
        ) VALUES (?, ?, 'manual', 'running', CURRENT_TIMESTAMP, 0)
      `,
        [userId, scheduleId]
      );

      const jobId = jobResult.lastID;

      // Get folders to backup
      const folders = await this.getUserBackupFolders(userId);

      if (folders.length === 0) {
        await db.run(
          `
          UPDATE backup_jobs 
          SET status = 'failed', error_message = 'No hay carpetas configuradas para backup'
          WHERE id = ?
        `,
          [jobId]
        );
        await db.close();
        return {
          success: false,
          error: "No hay carpetas configuradas para backup",
        };
      }

      await db.close();

      // Start backup process
      this.activeJobs.set(jobId, {
        id: jobId,
        userId: userId,
        status: "running",
        progress: 0,
        folders: folders,
        startTime: new Date(),
      });

      // Simulate backup process
      this.simulateBackupProcess(jobId);

      return { success: true, jobId: jobId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Simulate backup process
  async simulateBackupProcess(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const db = await openDB();
    let progress = 0;

    // Simulate backup progress
    const progressInterval = setInterval(async () => {
      progress += Math.random() * 15; // Random progress increment

      if (progress > 100) {
        progress = 100;
        clearInterval(progressInterval);

        // Complete the backup
        await db.run(
          `
          UPDATE backup_jobs 
          SET status = 'completed', progress_percentage = 100, 
              completed_at = CURRENT_TIMESTAMP, processed_files = total_files
          WHERE id = ?
        `,
          [jobId]
        );

        // Calculate total size
        let totalSize = 0;
        for (const folder of job.folders) {
          totalSize += folder.total_size_bytes || 0;
        }

        await db.run(
          `
          UPDATE backup_jobs 
          SET total_size_bytes = ?, compressed_size_bytes = ?
          WHERE id = ?
        `,
          [totalSize, Math.floor(totalSize * 0.7), jobId]
        ); // Simulate 70% compression

        job.status = "completed";
        job.progress = 100;

        await db.close();
      } else {
        // Update progress
        await db.run(
          `
          UPDATE backup_jobs 
          SET progress_percentage = ?, current_operation = ?
          WHERE id = ?
        `,
          [Math.floor(progress), this.getRandomOperation(), jobId]
        );

        job.progress = progress;
      }
    }, 300); // Update every 300ms
  }

  // Get random operation for simulation
  getRandomOperation() {
    const operations = [
      "Escaneando archivos...",
      "Comprimiendo archivos...",
      "Subiendo a la nube...",
      "Verificando integridad...",
      "Actualizando índices...",
    ];
    return operations[Math.floor(Math.random() * operations.length)];
  }

  // Get backup job status
  async getBackupJobStatus(jobId) {
    try {
      const db = await openDB();
      const job = await db.get(
        `
        SELECT * FROM backup_jobs WHERE id = ?
      `,
        [jobId]
      );
      await db.close();
      return job;
    } catch (error) {
      console.error("Error getting backup job status:", error);
      return null;
    }
  }

  // Get backup statistics
  async getBackupStats(userId) {
    try {
      const db = await openDB();

      // Get total backups
      const totalBackups = await db.get(
        `
        SELECT COUNT(*) as total FROM backup_jobs WHERE user_id = ?
      `,
        [userId]
      );

      // Get successful backups
      const successfulBackups = await db.get(
        `
        SELECT COUNT(*) as total FROM backup_jobs 
        WHERE user_id = ? AND status = 'completed'
      `,
        [userId]
      );

      // Get failed backups
      const failedBackups = await db.get(
        `
        SELECT COUNT(*) as total FROM backup_jobs 
        WHERE user_id = ? AND status = 'failed'
      `,
        [userId]
      );

      // Get total size
      const totalSize = await db.get(
        `
        SELECT SUM(total_size_bytes) as total FROM backup_jobs 
        WHERE user_id = ? AND status = 'completed'
      `,
        [userId]
      );

      // Get last backup
      const lastBackup = await db.get(
        `
        SELECT * FROM backup_jobs 
        WHERE user_id = ? AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      `,
        [userId]
      );

      await db.close();

      return {
        totalBackups: totalBackups.total || 0,
        successfulBackups: successfulBackups.total || 0,
        failedBackups: failedBackups.total || 0,
        totalSize: totalSize.total || 0,
        lastBackup: lastBackup,
      };
    } catch (error) {
      console.error("Error getting backup stats:", error);
      return {
        totalBackups: 0,
        successfulBackups: 0,
        failedBackups: 0,
        totalSize: 0,
        lastBackup: null,
      };
    }
  }

  // Initialize storage providers
  async initStorageProviders() {
    try {
      const db = await openDB();

      // Check if providers already exist
      const existingProviders = await db.get(`
        SELECT COUNT(*) as count FROM storage_providers
      `);

      if (existingProviders.count === 0) {
        // Insert default storage providers
        const providers = [
          {
            name: "Google Drive",
            type: "google_drive",
            config_template: JSON.stringify({
              client_id: "",
              client_secret: "",
              refresh_token: "",
              folder_id: "",
            }),
          },
          {
            name: "Dropbox",
            type: "dropbox",
            config_template: JSON.stringify({
              access_token: "",
              app_key: "",
              app_secret: "",
            }),
          },
          {
            name: "OneDrive",
            type: "onedrive",
            config_template: JSON.stringify({
              client_id: "",
              client_secret: "",
              refresh_token: "",
            }),
          },
          {
            name: "Amazon S3",
            type: "aws_s3",
            config_template: JSON.stringify({
              access_key_id: "",
              secret_access_key: "",
              region: "us-east-1",
              bucket: "",
            }),
          },
        ];

        for (const provider of providers) {
          await db.run(
            `
            INSERT INTO storage_providers (name, type, config_template)
            VALUES (?, ?, ?)
          `,
            [provider.name, provider.type, provider.config_template]
          );
        }

        console.log("Storage providers initialized");
      }

      await db.close();
    } catch (error) {
      console.error("Error initializing storage providers:", error);
    }
  }
}

module.exports = new BackupService();
