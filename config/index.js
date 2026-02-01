/**
 * Backend Configuration Module
 * 
 * Centralized configuration management for the Express server.
 * All environment variables are accessed through this module.
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Get environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {string} defaultValue - Default value if not found
 * @returns {string} Environment variable value
 */
const getEnvVar = (key, defaultValue = '') => {
  const value = process.env[key];
  
  if (!value && !defaultValue) {
    console.warn(`⚠️ Environment variable ${key} is not defined`);
  }
  
  return value || defaultValue;
};

/**
 * Parse allowed origins for CORS
 * @returns {string[]} Array of allowed origins
 */
const parseAllowedOrigins = () => {
  const origins = getEnvVar('ALLOWED_ORIGINS', 'http://localhost:5173');
  return origins.split(',').map(origin => origin.trim());
};

const config = {
  // Server Configuration
  server: {
    port: parseInt(getEnvVar('PORT', '5000'), 10),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    isDevelopment: getEnvVar('NODE_ENV', 'development') === 'development',
    isProduction: getEnvVar('NODE_ENV', 'production') === 'production',
  },
  
  // MongoDB Configuration
  mongodb: {
    uri: getEnvVar('MONGODB_URI'),
    options: {
      retryWrites: true,
      w: 'majority',
    },
  },
  
  // Cloudinary Configuration
  cloudinary: {
    cloudName: getEnvVar('CLOUDINARY_CLOUD_NAME'),
    apiKey: getEnvVar('CLOUDINARY_API_KEY'),
    apiSecret: getEnvVar('CLOUDINARY_API_SECRET'),
    uploadPreset: getEnvVar('CLOUDINARY_UPLOAD_PRESET'),
  },
  
  // CORS Configuration
  cors: {
    allowedOrigins: parseAllowedOrigins(),
    credentials: true,
  },
  
  // File Upload Configuration
  fileUpload: {
    maxFileSize: parseInt(getEnvVar('MAX_FILE_SIZE', '10485760'), 10), // 10MB default
    tempDir: getEnvVar('UPLOAD_TEMP_DIR', '/tmp/'),
    useTempFiles: true,
  },
  
  // API Configuration
  api: {
    prefix: '/api',
    version: 'v1',
  },
};

// Validate required configuration
const validateConfig = () => {
  const required = {
    'MongoDB URI': config.mongodb.uri,
    'Cloudinary Cloud Name': config.cloudinary.cloudName,
    'Cloudinary API Key': config.cloudinary.apiKey,
    'Cloudinary API Secret': config.cloudinary.apiSecret,
  };
  
  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Copy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }
};

// Log configuration in development
if (config.server.isDevelopment) {
  console.log('\n🔧 Server Configuration:');
  console.log(`   Environment: ${config.server.nodeEnv}`);
  console.log(`   Port: ${config.server.port}`);
  console.log(`   MongoDB: ${config.mongodb.uri ? '✅ Connected' : '❌ Not configured'}`);
  console.log(`   Cloudinary: ${config.cloudinary.cloudName || '❌ Not configured'}`);
  console.log(`   Allowed Origins: ${config.cors.allowedOrigins.join(', ')}`);
  console.log('');
}

// Validate configuration on startup
validateConfig();

export default config;
