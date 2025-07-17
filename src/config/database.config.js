const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("node:path");

sqlite3.verbose();

async function openDB() {
  return open({
    filename: path.join(__dirname, "backups.db"),
    driver: sqlite3.Database,
  });
}

async function initDB() {
  const db = await openDB();
  await db.exec(`
CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(30) NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    config_template TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    provider_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    destination_folder VARCHAR(500),
    credentials TEXT,
    settings TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_default BOOLEAN DEFAULT 0,
    last_connection_test DATETIME,
    connection_status VARCHAR(20) DEFAULT 'unknown',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES storage_providers(id)
);

CREATE TABLE IF NOT EXISTS backup_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    folder_path VARCHAR(1000) NOT NULL,
    folder_name VARCHAR(255),
    is_active BOOLEAN DEFAULT 1,
    include_subfolders BOOLEAN DEFAULT 1,
    exclude_patterns TEXT,
    last_scan_date DATETIME,
    last_backup_date DATETIME,
    total_size_bytes BIGINT DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    frequency_type VARCHAR(20) NOT NULL,
    frequency_value INTEGER DEFAULT 1,
    execution_time TIME,
    execution_days VARCHAR(20),
    execution_date INTEGER,
    retention_days INTEGER DEFAULT 30,
    compression_level VARCHAR(10) DEFAULT 'medium',
    verify_integrity BOOLEAN DEFAULT 1,
    incremental_backup BOOLEAN DEFAULT 0,
    email_notifications BOOLEAN DEFAULT 1,
    bandwidth_limit_mbps INTEGER,
    encrypt_files BOOLEAN DEFAULT 1,
    next_execution DATETIME,
    last_execution DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    folder_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES backup_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES backup_folders(id) ON DELETE CASCADE,
    UNIQUE(schedule_id, folder_id)
);

CREATE TABLE IF NOT EXISTS schedule_storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    storage_config_id INTEGER NOT NULL,
    is_primary BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES backup_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_config_id) REFERENCES storage_configs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    user_id INTEGER,
    job_type VARCHAR(20) DEFAULT 'scheduled',
    status VARCHAR(20) DEFAULT 'pending',
    started_at DATETIME,
    completed_at DATETIME,
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    compressed_size_bytes BIGINT DEFAULT 0,
    compression_ratio DECIMAL(5,2),
    upload_speed_mbps DECIMAL(8,2),
    error_message TEXT,
    progress_percentage INTEGER DEFAULT 0,
    current_operation VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES backup_schedules(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    storage_config_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000),
    file_size_bytes BIGINT,
    checksum VARCHAR(64),
    encryption_key_id VARCHAR(100),
    upload_started_at DATETIME,
    upload_completed_at DATETIME,
    verification_status VARCHAR(20) DEFAULT 'pending',
    is_deleted BOOLEAN DEFAULT 0,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_config_id) REFERENCES storage_configs(id)
);

CREATE TABLE IF NOT EXISTS backup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    level VARCHAR(10) NOT NULL,
    category VARCHAR(50),
    message TEXT NOT NULL,
    details TEXT,
    file_path VARCHAR(1000),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date DATE NOT NULL,
    total_backups INTEGER DEFAULT 0,
    successful_backups INTEGER DEFAULT 0,
    failed_backups INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    total_files INTEGER DEFAULT 0,
    average_duration_minutes INTEGER DEFAULT 0,
    storage_used_bytes BIGINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    job_id INTEGER,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT 0,
    sent_via_email BOOLEAN DEFAULT 0,
    email_sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES backup_jobs(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON backup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_user_date ON backup_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_backup_logs_job_level ON backup_logs(job_id, level);
CREATE INDEX IF NOT EXISTS idx_backup_files_job ON backup_files(job_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_backup_folders_user_active ON backup_folders(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_next_execution ON backup_schedules(next_execution, is_active);

        `);
  console.log("Database initialized successfully.");
}

module.exports = {
  openDB,
  initDB,
};
