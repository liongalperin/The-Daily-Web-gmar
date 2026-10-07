/**
 * Authentication Controller
 * Handles user login, logout, registration, and session state.
 */

const { User } = require('../models');
const logger = require('../config/logger');

const authController = {
  /**
   * Log in user and establish persistent session with session fixation protection
   */
  async login(req, res, next) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required.'
        });
      }

      // Fetch user with password hash explicitly selected
      const user = await User.getUserByUsername(username, true);
      if (!user) {
        logger.audit('LOGIN_FAILED_UNKNOWN_USER', null, { username });
        return res.status(401).json({
          success: false,
          error: 'Invalid username or password.'
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        logger.audit('LOGIN_FAILED_INVALID_PASSWORD', user._id, { username: user.username });
        return res.status(401).json({
          success: false,
          error: 'Invalid username or password.'
        });
      }

      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          logger.error('Session regenerate error during login:', regenErr);
          return next(regenErr);
        }

        // Store authenticated user in session
        req.session.user = {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          fullName: user.fullName || user.username
        };

        // Save session explicitly before returning response
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error('Session save error during login:', saveErr);
            return next(saveErr);
          }

          logger.audit('LOGIN_SUCCESS', user._id, {
            username: user.username,
            role: user.role
          });

          const redirectUrl = user.role === 'Editor' ? '/editor/desk' : '/reporter/desk';

          return res.json({
            success: true,
            message: 'Logged in successfully',
            user: {
              id: user._id,
              username: user.username,
              role: user.role,
              fullName: user.fullName || user.username
            },
            redirectTo: redirectUrl
          });
        });
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Log out user and destroy persistent session
   */
  async logout(req, res, next) {
    try {
      const userId = req.session?.user?.id;
      if (userId) {
        logger.audit('USER_LOGOUT', userId, {});
      }

      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destroy error during logout:', err);
            return next(err);
          }

          res.clearCookie('connect.sid');
          return res.json({
            success: true,
            message: 'Logged out successfully',
            redirectTo: '/'
          });
        });
      } else {
        res.clearCookie('connect.sid');
        return res.json({
          success: true,
          message: 'Logged out successfully',
          redirectTo: '/'
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get current authenticated user session details
   */
  async getCurrentUser(req, res) {
    if (req.session && req.session.user) {
      return res.json({
        authenticated: true,
        user: req.session.user
      });
    }

    return res.json({
      authenticated: false,
      user: null
    });
  },

  /**
   * Register a new user
   * Public registration allows creating Reporter accounts.
   * Creating an Editor account requires existing Editor authentication (or seed/admin key).
   */
  async register(req, res, next) {
    try {
      const { username, password, role = 'Reporter', fullName } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required.'
        });
      }

      if (!['Reporter', 'Editor'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Role must be either Reporter or Editor.'
        });
      }

      // Privilege escalation protection: only authenticated Editors can create other Editors
      if (role === 'Editor') {
        const callerIsEditor = req.session?.user?.role === 'Editor';
        const isSetupKey = req.headers['x-admin-key'] === (process.env.SESSION_SECRET || 'dailyweb_default_session_secret_123');
        if (!callerIsEditor && !isSetupKey) {
          logger.audit('UNAUTHORIZED_EDITOR_CREATION_ATTEMPT', req.session?.user?.id || null, { username });
          return res.status(403).json({
            success: false,
            error: 'Forbidden: Only existing Editors can register new Editor accounts.'
          });
        }
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters long.'
        });
      }

      const existingUser = await User.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Username already in use.'
        });
      }

      const newUser = await User.createUser({
        username,
        password,
        role,
        fullName: fullName || username
      });

      logger.audit('USER_REGISTERED', newUser._id, {
        username: newUser.username,
        role: newUser.role
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: {
          id: newUser._id,
          username: newUser.username,
          role: newUser.role,
          fullName: newUser.fullName
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;
