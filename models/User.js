/**
 * User Model
 * Roles: Reporter, Editor (Guests do not have accounts)
 * Passwords are one-way hashed with bcryptjs.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [50, 'Username cannot exceed 50 characters']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Never leak password hash in default queries or .lean()
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['Reporter', 'Editor'],
        message: 'Role must be either Reporter or Editor'
      }
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Password hashing helper
userSchema.statics.hashPassword = async function (plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string' || plainPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
};

// Compare password instance method with guard against missing/invalid inputs
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || typeof candidatePassword !== 'string' || !this.passwordHash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Full CRUD Static Helpers for academic rubric requirement
userSchema.statics.createUser = async function (userData) {
  const data = { ...userData };
  if (data.username) {
    data.username = data.username.trim().toLowerCase();
  }
  if (data.password) {
    data.passwordHash = await this.hashPassword(data.password);
    delete data.password;
  }
  return this.create(data);
};

userSchema.statics.getUserById = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findById(id);
};

userSchema.statics.getUserByUsername = function (username, includePassword = false) {
  if (!username || typeof username !== 'string') return null;
  const cleanUsername = username.trim().toLowerCase();
  const query = this.findOne({ username: cleanUsername });
  return includePassword ? query.select('+passwordHash') : query;
};

userSchema.statics.searchUsers = function (filters = {}, pagination = { page: 1, limit: 50 }) {
  const query = {};
  if (filters.role) query.role = filters.role;
  if (filters.search && typeof filters.search === 'string') {
    const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.username = { $regex: escaped, $options: 'i' };
  }
  const skip = (Math.max(1, pagination.page) - 1) * pagination.limit;
  return this.find(query).skip(skip).limit(pagination.limit).sort({ createdAt: -1 });
};

userSchema.statics.updateUserById = async function (id, updates) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const safeUpdates = { ...updates };
  if (safeUpdates.password) {
    safeUpdates.passwordHash = await this.hashPassword(safeUpdates.password);
    delete safeUpdates.password;
  }
  if (safeUpdates.username) {
    safeUpdates.username = safeUpdates.username.trim().toLowerCase();
  }
  return this.findByIdAndUpdate(id, safeUpdates, { returnDocument: 'after', runValidators: true });
};

userSchema.statics.deleteUserById = function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return this.findByIdAndDelete(id);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
