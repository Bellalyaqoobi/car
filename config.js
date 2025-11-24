// Configuration File for Chat Application
const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://atichswkxinwqewtpvkr.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aWNoc3dreGlud3Fld3RwdmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODA2NjAsImV4cCI6MjA3NzE1NjY2MH0.UmJ7mQt4bmwIpvlrnp7J1TigQ8JqB09w_0OgcIVCtFA',

    // App Settings
    APP_NAME: 'چت حرفه‌ای',
    VERSION: '1.0.0',
    
    // Group Settings
    PUBLIC_GROUP_NAME: 'گروه عمومی',
    DEFAULT_GROUP_AVATAR: 'گ',
    
    // User Settings
    DEFAULT_USER_AVATAR: '👤',
    DEFAULT_USER_ROLE: 'user',
    ADMIN_USER_ROLE: 'admin',
    
    // Features
    ENABLE_BULK_USER_CREATION: true,
    MAX_BULK_USERS: 1000,
    ENABLE_FILE_UPLOAD: false,
    ENABLE_TYPING_INDICATOR: true,
    
    // UI Settings
    MESSAGE_ANIMATION: true,
    SHOW_ONLINE_STATUS: true,
    AUTO_SCROLL_MESSAGES: true,
    SHOW_READ_RECEIPTS: false,
    
    // Timeouts
    NOTIFICATION_TIMEOUT: 3000,
    TYPING_INDICATOR_TIMEOUT: 2000,
    ONLINE_STATUS_TIMEOUT: 30000,
    
    // Pagination
    MESSAGES_PER_PAGE: 50,
    USERS_PER_PAGE: 100,
    GROUPS_PER_PAGE: 20,
    
    // Security
    MIN_PASSWORD_LENGTH: 4,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
    
    // Performance
    DEBOUNCE_DELAY: 300,
    MESSAGE_CACHE_SIZE: 1000,
    
    // Default User Credentials for Testing
    DEFAULT_USERS: [
        { username: 'admin', password: '1234', name: 'مدیر سیستم', role: 'admin' },
        { username: 'user1', password: '1234', name: 'کاربر نمونه یک', role: 'user' },
        { username: 'user2', password: '1234', name: 'کاربر نمونه دو', role: 'user' },
        { username: 'user3', password: '1234', name: 'کاربر نمونه سه', role: 'user' }
    ]
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
