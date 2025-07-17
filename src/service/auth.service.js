const bcrypt = require("bcrypt");
const { openDB } = require("../config/database.config.js");

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isLoggedIn = false;
    this.saltRounds = 10;
  }

  // Hash password using bcrypt
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  // Verify password
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Login user
  async login(username, password) {
    try {
      const db = await openDB();

      // Find user by username or email
      const user = await db.get(
        `
        SELECT id, username, email, password_hash, is_active 
        FROM users 
        WHERE (username = ? OR email = ?) AND is_active = 1
      `,
        [username, username]
      );

      if (!user) {
        throw new Error("Usuario no encontrado");
      }

      // Verify password
      if (!(await this.verifyPassword(password, user.password_hash))) {
        throw new Error("Contraseña incorrecta");
      }

      // Set current user
      this.currentUser = {
        id: user.id,
        username: user.username,
        email: user.email,
      };
      this.isLoggedIn = true;

      // Update last login
      await db.run(
        `
        UPDATE users 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `,
        [user.id]
      );

      await db.close();
      return { success: true, user: this.currentUser };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Register new user
  async register(userData) {
    try {
      const db = await openDB();

      // Check if username or email already exists
      const existingUser = await db.get(
        `
        SELECT id FROM users 
        WHERE username = ? OR email = ?
      `,
        [userData.username, userData.email]
      );

      if (existingUser) {
        throw new Error("El usuario o email ya existe");
      }

      // Hash password
      const passwordHash = await this.hashPassword(userData.password);

      // Insert new user
      const result = await db.run(
        `
        INSERT INTO users (username, email, password_hash, is_active)
        VALUES (?, ?, ?, 1)
      `,
        [userData.username, userData.email, passwordHash]
      );

      await db.close();
      return { success: true, userId: result.lastID };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is logged in
  isAuthenticated() {
    return this.isLoggedIn;
  }

  // Logout user
  logout() {
    this.currentUser = null;
    this.isLoggedIn = false;
  }

  // Initialize default admin user
  async initDefaultUser() {
    try {
      const db = await openDB();

      // Check if admin user exists
      const adminUser = await db.get(`
        SELECT id FROM users WHERE username = 'admin'
      `);

      if (!adminUser) {
        // Create default admin user
        const passwordHash = await this.hashPassword("admin123");
        await db.run(
          `
          INSERT INTO users (username, email, password_hash, is_active)
          VALUES ('admin', 'admin@localhost', ?, 1)
        `,
          [passwordHash]
        );
        console.log("Default admin user created: admin/admin123");
      }

      await db.close();
    } catch (error) {
      console.error("Error initializing default user:", error);
    }
  }
}

module.exports = new AuthService();
