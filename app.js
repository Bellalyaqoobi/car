// Real Time Chat Application - Complete Fixed Version
class RealTimeChatApp {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.users = [];
        this.groups = [];
        this.messages = [];
        this.currentGroup = null;
        this.subscriptions = [];
        this.groupMembers = [];
        this.publicGroupId = null;
        this.isAdmin = false;
        this.isOnline = true;

        this.initializeApp();
    }

    async initializeApp() {
        try {
            console.log('🚀 Initializing Chat Application...');
            
            // ایجاد Supabase client
            this.supabase = supabase.createClient(
                CONFIG.SUPABASE_URL, 
                CONFIG.SUPABASE_ANON_KEY
            );
            
            // بررسی اتصال
            const { data, error } = await this.supabase.from('users').select('count');
            if (error) throw error;

            console.log('✅ Connected to Supabase successfully');
            
            await this.checkLoginStatus();
            this.bindEvents();
            this.setupOnlineStatusListener();
            
        } catch (error) {
            console.error('❌ Error initializing app:', error);
            this.showNotification('خطا در اتصال به سرور', 'error');
        }
    }

    setupOnlineStatusListener() {
        // بررسی وضعیت آنلاین بودن کاربر
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showNotification('اتصال اینترنت برقرار شد', 'success');
            if (this.currentUser) {
                this.setUserOnlineStatus(true);
            }
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showNotification('اتصال اینترنت قطع شد', 'warning');
        });

        // بررسی دوره‌ای وضعیت آنلاین
        setInterval(() => {
            if (this.currentUser && this.isOnline) {
                this.setUserOnlineStatus(true);
            }
        }, CONFIG.ONLINE_STATUS_TIMEOUT);
    }

    async checkLoginStatus() {
        const savedUser = localStorage.getItem('chatUser');
        const savedTime = localStorage.getItem('chatLoginTime');
        
        // بررسی انقضای session
        if (savedUser && savedTime) {
            const loginTime = parseInt(savedTime);
            const currentTime = new Date().getTime();
            
            if (currentTime - loginTime > CONFIG.SESSION_TIMEOUT) {
                // Session منقضی شده
                localStorage.removeItem('chatUser');
                localStorage.removeItem('chatLoginTime');
                this.showLoginPage();
                return;
            }
        }

        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.isAdmin = this.currentUser.role === CONFIG.ADMIN_USER_ROLE;
            await this.setUserOnlineStatus(true);
            this.showMainApp();
            await this.loadInitialData();
            this.setupRealtimeSubscriptions();
        } else {
            this.showLoginPage();
        }
    }

    async setUserOnlineStatus(online) {
        if (!this.currentUser) return;
        
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ 
                    online: online,
                    last_seen: new Date().toISOString()
                })
                .eq('id', this.currentUser.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating online status:', error);
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            this.showNotification('لطفاً نام کاربری و رمز عبور را وارد کنید', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            // بررسی کاربر در دیتابیس
            const { data: user, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (error || !user) {
                this.showNotification('نام کاربری یا رمز عبور نادرست است', 'error');
                return;
            }

            this.currentUser = user;
            this.isAdmin = user.role === CONFIG.ADMIN_USER_ROLE;
            
            // ذخیره اطلاعات login
            localStorage.setItem('chatUser', JSON.stringify(user));
            localStorage.setItem('chatLoginTime', new Date().getTime().toString());
            
            // آپدیت وضعیت آنلاین
            await this.setUserOnlineStatus(true);
            
            this.showMainApp();
            await this.loadInitialData();
            this.setupRealtimeSubscriptions();
            this.showNotification(`خوش آمدید ${user.name}`, 'success');

        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('خطا در ورود به سیستم', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleLogout() {
        if (this.currentUser) {
            await this.setUserOnlineStatus(false);
        }

        // لغو تمام subscription‌ها
        this.subscriptions.forEach(subscription => {
            subscription.unsubscribe();
        });

        localStorage.removeItem('chatUser');
        localStorage.removeItem('chatLoginTime');
        this.currentUser = null;
        this.isAdmin = false;
        this.showLoginPage();
        this.showNotification('شما از سیستم خارج شدید', 'info');
    }

    async loadInitialData() {
        this.showLoading(true);
        try {
            await Promise.all([
                this.loadUsers(),
                this.loadGroups(),
                this.ensurePublicGroup()
            ]);
            console.log('✅ Initial data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading initial data:', error);
            this.showNotification('خطا در بارگذاری اطلاعات اولیه', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadUsers() {
        try {
            const { data: users, error } = await this.supabase
                .from('users')
                .select('*')
                .order('name')
                .limit(CONFIG.USERS_PER_PAGE);

            if (error) throw error;

            this.users = users || [];
            this.updateUsersUI();
            this.updateAllUsersUI();

        } catch (error) {
            console.error('Error loading users:', error);
            throw error;
        }
    }

    async loadGroups() {
        try {
            const { data: groups, error } = await this.supabase
                .from('groups')
                .select(`
                    *,
                    group_members (
                        user_id,
                        users (
                            id,
                            name,
                            avatar,
                            online
                        )
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(CONFIG.GROUPS_PER_PAGE);

            if (error) throw error;

            this.groups = (groups || []).map(group => {
                const members = group.group_members || [];
                const onlineCount = members.filter(m => m.users?.online).length;
                
                return {
                    ...group,
                    onlineCount,
                    totalCount: members.length,
                    unread: 0
                };
            });

            this.updateGroupsUI();

        } catch (error) {
            console.error('Error loading groups:', error);
            throw error;
        }
    }

    async ensurePublicGroup() {
        try {
            // بررسی وجود گروه عمومی
            const { data: publicGroup, error } = await this.supabase
                .from('groups')
                .select('*')
                .eq('name', CONFIG.PUBLIC_GROUP_NAME)
                .single();

            if (error || !publicGroup) {
                // ایجاد گروه عمومی
                const { data: newGroup, error: createError } = await this.supabase
                    .from('groups')
                    .insert({
                        name: CONFIG.PUBLIC_GROUP_NAME,
                        description: 'گروه عمومی برای تمام کاربران',
                        avatar: CONFIG.DEFAULT_GROUP_AVATAR,
                        created_by: this.currentUser.id,
                        is_public: true
                    })
                    .select()
                    .single();

                if (createError) throw createError;
                
                this.publicGroupId = newGroup.id;
                console.log('✅ Public group created:', newGroup.id);
            } else {
                this.publicGroupId = publicGroup.id;
            }

            // اطمینان از اینکه کاربر فعلی در گروه عمومی عضو است
            await this.ensureUserInPublicGroup(this.currentUser.id);

            // اطمینان از اینکه تمام کاربران در گروه عمومی عضو هستند
            await this.addAllUsersToPublicGroup();

        } catch (error) {
            console.error('Error ensuring public group:', error);
            throw error;
        }
    }

    async ensureUserInPublicGroup(userId) {
        try {
            const { data: membership, error } = await this.supabase
                .from('group_members')
                .select('*')
                .eq('group_id', this.publicGroupId)
                .eq('user_id', userId)
                .single();

            if (error || !membership) {
                const { error: addError } = await this.supabase
                    .from('group_members')
                    .insert({
                        group_id: this.publicGroupId,
                        user_id: userId
                    });

                if (addError) throw addError;
            }
        } catch (error) {
            console.error('Error ensuring user in public group:', error);
            throw error;
        }
    }

    async addAllUsersToPublicGroup() {
        try {
            // دریافت تمام کاربران
            const { data: allUsers, error } = await this.supabase
                .from('users')
                .select('id');

            if (error) throw error;

            // بررسی عضویت هر کاربر در گروه عمومی
            for (const user of allUsers) {
                try {
                    await this.ensureUserInPublicGroup(user.id);
                } catch (error) {
                    console.error(`Error adding user ${user.id} to public group:`, error);
                }
            }

            // بارگذاری مجدد گروه‌ها
            await this.loadGroups();

        } catch (error) {
            console.error('Error adding all users to public group:', error);
            throw error;
        }
    }

    async loadGroupMessages(groupId) {
        try {
            console.log('📥 Loading messages for group:', groupId);
            
            const { data: messages, error } = await this.supabase
                .from('messages')
                .select(`
                    *,
                    users (
                        id,
                        name,
                        avatar
                    )
                `)
                .eq('group_id', groupId)
                .order('created_at', { ascending: true })
                .limit(CONFIG.MESSAGES_PER_PAGE);

            if (error) {
                console.error('❌ Error loading messages:', error);
                throw error;
            }

            this.messages = messages || [];
            console.log(`✅ Loaded ${this.messages.length} messages`);
            this.updateMessagesUI();

        } catch (error) {
            console.error('Error loading messages:', error);
            throw error;
        }
    }

    async loadGroupMembers(groupId) {
        try {
            const { data: members, error } = await this.supabase
                .from('group_members')
                .select(`
                    user_id,
                    users (
                        id,
                        name,
                        avatar,
                        online,
                        role
                    )
                `)
                .eq('group_id', groupId);

            if (error) throw error;

            this.groupMembers = members || [];
            this.updateGroupMembersUI();

        } catch (error) {
            console.error('Error loading group members:', error);
            throw error;
        }
    }

    async sendMessage() {
        if (!this.currentUser || !this.currentGroup) {
            this.showNotification('لطفاً ابتدا یک گروه انتخاب کنید', 'warning');
            return;
        }

        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (!content) {
            this.showNotification('لطفاً متن پیام را وارد کنید', 'warning');
            return;
        }

        if (!this.isOnline) {
            this.showNotification('اتصال اینترنت قطع است. پیام ارسال نشد.', 'error');
            return;
        }

        try {
            console.log('📤 Sending message:', {
                group_id: this.currentGroup.id,
                user_id: this.currentUser.id,
                content: content
            });

            const { data: message, error } = await this.supabase
                .from('messages')
                .insert({
                    group_id: this.currentGroup.id,
                    user_id: this.currentUser.id,
                    content: content,
                    message_type: 'text'
                })
                .select()
                .single();

            if (error) {
                console.error('❌ Error sending message:', error);
                this.showNotification('خطا در ارسال پیام: ' + error.message, 'error');
                return;
            }

            console.log('✅ Message sent successfully:', message);

            // پاک کردن input
            input.value = '';
            input.style.height = 'auto';

            // اضافه کردن پیام به لیست محلی و نمایش آن
            await this.handleNewMessageLocally(message);

        } catch (error) {
            console.error('❌ Error in sendMessage:', error);
            this.showNotification('خطا در ارسال پیام', 'error');
        }
    }

    async handleNewMessageLocally(message) {
        try {
            // ایجاد یک پیام موقت با اطلاعات کاربر فعلی
            const tempMessage = {
                ...message,
                users: {
                    id: this.currentUser.id,
                    name: this.currentUser.name,
                    avatar: this.currentUser.avatar
                }
            };

            // اضافه کردن پیام به لیست محلی
            this.messages.push(tempMessage);
            
            // آپدیت UI
            this.updateMessagesUI();
            
            // اسکرول به پایین
            if (CONFIG.AUTO_SCROLL_MESSAGES) {
                const messagesContainer = document.getElementById('messagesContainer');
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            console.log('✅ Message added to local UI');

        } catch (error) {
            console.error('Error in handleNewMessageLocally:', error);
        }
    }

    setupRealtimeSubscriptions() {
        console.log('🔔 Setting up real-time subscriptions...');

        // لغو subscription های قبلی
        this.subscriptions.forEach(subscription => {
            subscription.unsubscribe();
        });
        this.subscriptions = [];

        // Subscription برای پیام‌های جدید
        const messagesSubscription = this.supabase
            .channel('custom-messages-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages'
                },
                async (payload) => {
                    console.log('📨 New message received via real-time:', payload);
                    await this.handleRealtimeMessage(payload.new);
                }
            )
            .subscribe((status) => {
                console.log('📡 Messages subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to messages');
                }
            });

        // Subscription برای تغییرات کاربران
        const usersSubscription = this.supabase
            .channel('custom-users-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'users'
                },
                (payload) => {
                    console.log('👤 User change via real-time:', payload);
                    this.handleUserChange(payload);
                }
            )
            .subscribe();

        // Subscription برای تغییرات گروه‌ها
        const groupsSubscription = this.supabase
            .channel('custom-groups-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'groups'
                },
                () => {
                    console.log('📁 Groups changed, reloading...');
                    this.loadGroups();
                }
            )
            .subscribe();

        this.subscriptions.push(messagesSubscription, usersSubscription, groupsSubscription);
        console.log('✅ Real-time subscriptions established');
    }

    async handleRealtimeMessage(message) {
        console.log('🔄 Handling real-time message:', message);
        
        // اگر پیام مربوط به گروه فعلی است، آن را نمایش دهید
        if (this.currentGroup && message.group_id === this.currentGroup.id) {
            try {
                // بررسی تکراری نبودن پیام
                const messageExists = this.messages.some(m => m.id === message.id);
                if (messageExists) {
                    console.log('📭 Message already exists, skipping...');
                    return;
                }

                // دریافت اطلاعات کاربر برای پیام
                const { data: user, error } = await this.supabase
                    .from('users')
                    .select('id, name, avatar')
                    .eq('id', message.user_id)
                    .single();

                if (error) {
                    console.error('Error fetching user for message:', error);
                    return;
                }

                // اضافه کردن اطلاعات کاربر به پیام
                const messageWithUser = {
                    ...message,
                    users: user
                };

                this.messages.push(messageWithUser);
                this.updateMessagesUI();
                
                // اسکرول به پایین
                if (CONFIG.AUTO_SCROLL_MESSAGES) {
                    const messagesContainer = document.getElementById('messagesContainer');
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }

                console.log('✅ Real-time message added to UI:', messageWithUser);

            } catch (error) {
                console.error('Error in handleRealtimeMessage:', error);
            }
        } else {
            console.log('📭 Message not for current group:', {
                messageGroup: message.group_id,
                currentGroup: this.currentGroup?.id
            });
        }
    }

    handleUserChange(payload) {
        if (payload.eventType === 'UPDATE') {
            const index = this.users.findIndex(u => u.id === payload.new.id);
            if (index !== -1) {
                this.users[index] = payload.new;
                this.updateUsersUI();
                this.updateAllUsersUI();
            }
        } else if (payload.eventType === 'INSERT') {
            // کاربر جدید اضافه شده
            this.users.push(payload.new);
            this.updateUsersUI();
            this.updateAllUsersUI();
            
            // اضافه کردن کاربر جدید به گروه عمومی
            if (this.publicGroupId) {
                this.addUserToGroup(payload.new.id, this.publicGroupId);
            }
        } else if (payload.eventType === 'DELETE') {
            // کاربر حذف شده
            this.users = this.users.filter(u => u.id !== payload.old.id);
            this.updateUsersUI();
            this.updateAllUsersUI();
        }
    }

    async createNewGroup() {
        const name = prompt('نام گروه جدید را وارد کنید:');
        if (!name) return;

        if (!this.isOnline) {
            this.showNotification('اتصال اینترنت قطع است. امکان ایجاد گروه وجود ندارد.', 'error');
            return;
        }

        try {
            const { data: group, error } = await this.supabase
                .from('groups')
                .insert({
                    name: name,
                    description: `گروه ${name}`,
                    avatar: name.charAt(0) || CONFIG.DEFAULT_GROUP_AVATAR,
                    created_by: this.currentUser.id
                })
                .select()
                .single();

            if (error) throw error;

            // اضافه کردن کاربر به گروه
            const { error: memberError } = await this.supabase
                .from('group_members')
                .insert({
                    group_id: group.id,
                    user_id: this.currentUser.id
                });

            if (memberError) throw memberError;

            await this.loadGroups();
            this.showNotification(`گروه ${name} ایجاد شد`, 'success');

        } catch (error) {
            console.error('Error creating group:', error);
            this.showNotification('خطا در ایجاد گروه', 'error');
        }
    }

    async addUserToGroup(userId, groupId) {
        try {
            const { error } = await this.supabase
                .from('group_members')
                .insert({
                    group_id: groupId,
                    user_id: userId
                });

            if (error) throw error;

            this.showNotification('کاربر به گروه اضافه شد', 'success');
            await this.loadGroupMembers(groupId);
            await this.loadGroups();

        } catch (error) {
            console.error('Error adding user to group:', error);
            this.showNotification('خطا در اضافه کردن کاربر به گروه', 'error');
        }
    }

    async removeUserFromGroup(userId, groupId) {
        try {
            const { error } = await this.supabase
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', userId);

            if (error) throw error;

            this.showNotification('کاربر از گروه حذف شد', 'success');
            await this.loadGroupMembers(groupId);
            await this.loadGroups();

        } catch (error) {
            console.error('Error removing user from group:', error);
            this.showNotification('خطا در حذف کاربر از گروه', 'error');
        }
    }

    async addNewUser(username, password, fullName, avatar, role = CONFIG.DEFAULT_USER_ROLE) {
        try {
            // اعتبارسنجی
            if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
                this.showNotification(`رمز عبور باید حداقل ${CONFIG.MIN_PASSWORD_LENGTH} کاراکتر باشد`, 'error');
                return false;
            }

            // بررسی وجود کاربر با همین نام کاربری
            const { data: existingUser, error: checkError } = await this.supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (existingUser) {
                this.showNotification('نام کاربری قبلاً استفاده شده است', 'error');
                return false;
            }

            // ایجاد کاربر جدید
            const { data: newUser, error } = await this.supabase
                .from('users')
                .insert({
                    username: username,
                    password: password,
                    name: fullName,
                    avatar: avatar || fullName.charAt(0) || CONFIG.DEFAULT_USER_AVATAR,
                    role: role,
                    online: false,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            // اضافه کردن کاربر جدید به گروه عمومی
            if (this.publicGroupId) {
                await this.addUserToGroup(newUser.id, this.publicGroupId);
            }

            this.showNotification(`کاربر ${fullName} با موفقیت ایجاد شد`, 'success');
            return true;

        } catch (error) {
            console.error('Error adding new user:', error);
            this.showNotification('خطا در ایجاد کاربر جدید', 'error');
            return false;
        }
    }

    async bulkAddUsers(count, prefix, password) {
        if (!this.isOnline) {
            this.showNotification('اتصال اینترنت قطع است. امکان ایجاد کاربر وجود ندارد.', 'error');
            return;
        }

        this.showLoading(true);
        
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.width = '0%';
        progressBar.appendChild(progressFill);
        
        const loadingSpinner = document.querySelector('.loading-spinner');
        loadingSpinner.appendChild(progressBar);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 1; i <= count; i++) {
            const username = `${prefix}${i}`;
            const fullName = `کاربر ${i}`;
            
            try {
                const success = await this.addNewUser(username, password, fullName, '', CONFIG.DEFAULT_USER_ROLE);
                if (success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
            }

            // آپدیت progress bar
            const progress = (i / count) * 100;
            progressFill.style.width = `${progress}%`;

            // اجازه دهید UI آپدیت شود
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.showLoading(false);
        
        this.showNotification(
            `ایجاد کاربران تکمیل شد: ${successCount} موفق, ${errorCount} خطا`,
            errorCount === 0 ? 'success' : 'warning'
        );

        // بارگذاری مجدد کاربران و گروه‌ها
        await this.loadUsers();
        await this.loadGroups();
    }

    async deleteUser(userId) {
        if (userId === this.currentUser.id) {
            this.showNotification('شما نمی‌توانید حساب خود را حذف کنید', 'error');
            return;
        }

        if (!confirm('آیا از حذف این کاربر اطمینان دارید؟')) return;

        if (!this.isOnline) {
            this.showNotification('اتصال اینترنت قطع است. امکان حذف کاربر وجود ندارد.', 'error');
            return;
        }

        try {
            // حذف کاربر از تمام گروه‌ها
            const { error: memberError } = await this.supabase
                .from('group_members')
                .delete()
                .eq('user_id', userId);

            if (memberError) throw memberError;

            // حذف پیام‌های کاربر
            const { error: messageError } = await this.supabase
                .from('messages')
                .delete()
                .eq('user_id', userId);

            if (messageError) throw messageError;

            // حذف کاربر
            const { error } = await this.supabase
                .from('users')
                .delete()
                .eq('id', userId);

            if (error) throw error;

            await this.loadUsers();
            await this.loadGroups();
            this.showNotification('کاربر با موفقیت حذف شد', 'success');

        } catch (error) {
            console.error('Error deleting user:', error);
            this.showNotification('خطا در حذف کاربر', 'error');
        }
    }

    // متدهای UI
    showLoginPage() {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        console.log('🔐 Login page shown');
    }

    showMainApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        if (this.currentUser) {
            document.getElementById('userDisplayName').textContent = this.currentUser.name;
            document.getElementById('userAvatar').textContent = this.currentUser.avatar || this.currentUser.name.charAt(0);
            
            // نمایش بخش مدیریت کاربران برای ادمین
            if (this.isAdmin) {
                document.getElementById('adminSection').style.display = 'block';
                document.getElementById('manageUsersBtn').style.display = 'block';
            }
        }
        console.log('🏠 Main app shown');
    }

    showLoading(show) {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (show) {
            loadingOverlay.classList.add('show');
        } else {
            loadingOverlay.classList.remove('show');
            // پاک کردن progress bar
            const progressBar = loadingOverlay.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.remove();
            }
        }
    }

    updateUsersUI() {
        const onlineUsersContainer = document.getElementById('onlineUsers');
        onlineUsersContainer.innerHTML = '';

        const onlineUsers = this.users.filter(user => user.online);
        
        if (onlineUsers.length === 0) {
            onlineUsersContainer.innerHTML = `
                <div class="message-system" style="margin: 0; padding: 10px;">
                    هیچ کاربر آنلاینی وجود ندارد
                </div>
            `;
            return;
        }
        
        onlineUsers.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = `
                <div class="user-avatar-small user-online">${user.avatar || user.name.charAt(0)}</div>
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-status">آنلاین</div>
                </div>
            `;
            onlineUsersContainer.appendChild(userElement);
        });
    }

    updateAllUsersUI() {
        const allUsersList = document.getElementById('allUsersList');
        allUsersList.innerHTML = '';

        if (this.users.length === 0) {
            allUsersList.innerHTML = `
                <div class="message-system" style="margin: 0; padding: 10px;">
                    هیچ کاربری وجود ندارد
                </div>
            `;
            return;
        }

        this.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item-admin';
            
            userElement.innerHTML = `
                <div class="user-avatar-small ${user.online ? 'user-online' : ''}">
                    ${user.avatar || user.name.charAt(0)}
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name} (${user.username})</div>
                    <div class="user-status">${user.online ? 'آنلاین' : 'آفلاین'} • ${user.role === 'admin' ? 'مدیر' : 'کاربر'}</div>
                </div>
                <div class="user-actions">
                    ${user.id !== this.currentUser.id ? 
                        `<button class="btn btn-small btn-danger delete-user" data-user-id="${user.id}">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                </div>
            `;

            allUsersList.appendChild(userElement);
        });

        // اضافه کردن event listener برای دکمه‌های حذف
        document.querySelectorAll('.delete-user').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                this.deleteUser(userId);
            });
        });
    }

    updateGroupsUI() {
        const groupsList = document.getElementById('groupsList');
        groupsList.innerHTML = '';

        if (this.groups.length === 0) {
            groupsList.innerHTML = `
                <div class="message-system" style="margin: 0; padding: 10px;">
                    هیچ گروهی وجود ندارد
                </div>
            `;
            return;
        }

        this.groups.forEach(group => {
            const groupElement = document.createElement('div');
            groupElement.className = `group-item ${this.currentGroup && this.currentGroup.id === group.id ? 'active' : ''}`;
            groupElement.dataset.groupId = group.id;
            
            groupElement.innerHTML = `
                <div class="group-avatar">${group.avatar || group.name.charAt(0)}</div>
                <div class="group-info">
                    <div class="group-name">${group.name}</div>
                    <div class="group-meta">${group.totalCount} عضو • ${group.onlineCount} آنلاین</div>
                </div>
                ${group.unread > 0 ? `<div class="unread-badge">${group.unread}</div>` : ''}
            `;

            groupElement.addEventListener('click', () => {
                this.switchGroup(group);
            });

            groupsList.appendChild(groupElement);
        });
    }

    updateMessagesUI() {
        const messagesContainer = document.getElementById('messagesContainer');
        
        // پاک کردن محتوای قبلی
        while (messagesContainer.firstChild) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }

        if (this.messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="message-system">
                    <i class="fas fa-info-circle"></i>
                    هیچ پیامی در این گروه وجود ندارد. اولین نفر باشید که پیام می‌فرستد!
                </div>
            `;
            return;
        }

        console.log(`🔄 Updating UI with ${this.messages.length} messages`);

        this.messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            messagesContainer.appendChild(messageElement);
        });

        if (CONFIG.AUTO_SCROLL_MESSAGES) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    updateGroupMembersUI() {
        const groupMembersList = document.getElementById('groupMembersList');
        groupMembersList.innerHTML = '';

        if (this.groupMembers.length === 0) {
            groupMembersList.innerHTML = `
                <div class="message-system" style="margin: 0; padding: 10px;">
                    هیچ عضوی در این گروه وجود ندارد
                </div>
            `;
            return;
        }

        this.groupMembers.forEach(member => {
            const memberElement = document.createElement('div');
            memberElement.className = 'member-item';
            
            const isCurrentUser = member.user_id === this.currentUser.id;
            const isGroupCreator = this.currentGroup && this.currentGroup.created_by === member.user_id;
            
            memberElement.innerHTML = `
                <div class="user-avatar-small ${member.users.online ? 'user-online' : ''}">
                    ${member.users.avatar || member.users.name.charAt(0)}
                </div>
                <div class="user-info">
                    <div class="user-name">${member.users.name} ${isGroupCreator ? '(سازنده)' : ''} ${member.users.role === 'admin' ? '👑' : ''}</div>
                    <div class="user-status">${member.users.online ? 'آنلاین' : 'آفلاین'}</div>
                </div>
                <div class="member-actions">
                    ${!isCurrentUser && this.currentGroup && this.currentGroup.created_by === this.currentUser.id ? 
                        `<button class="btn-icon remove-member" data-user-id="${member.user_id}">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                </div>
            `;

            groupMembersList.appendChild(memberElement);
        });

        // اضافه کردن event listener برای دکمه‌های حذف
        document.querySelectorAll('.remove-member').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                this.removeUserFromGroup(userId, this.currentGroup.id);
            });
        });
    }

    updateAvailableUsersUI() {
        const availableUsersList = document.getElementById('availableUsersList');
        availableUsersList.innerHTML = '';

        // کاربرانی که در گروه نیستند
        const currentMemberIds = this.groupMembers.map(member => member.user_id);
        const availableUsers = this.users.filter(user => !currentMemberIds.includes(user.id));

        if (availableUsers.length === 0) {
            availableUsersList.innerHTML = `
                <div class="message-system" style="margin: 0; padding: 10px;">
                    همه کاربران در این گروه عضو هستند
                </div>
            `;
            return;
        }

        availableUsers.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'available-user-item';
            userElement.dataset.userId = user.id;
            
            userElement.innerHTML = `
                <div class="user-avatar-small ${user.online ? 'user-online' : ''}">
                    ${user.avatar || user.name.charAt(0)}
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name} (${user.username}) ${user.role === 'admin' ? '👑' : ''}</div>
                    <div class="user-status">${user.online ? 'آنلاین' : 'آفلاین'}</div>
                </div>
            `;

            userElement.addEventListener('click', () => {
                this.addUserToGroup(user.id, this.currentGroup.id);
                this.hideAddMemberModal();
            });

            availableUsersList.appendChild(userElement);
        });
    }

    createMessageElement(message) {
        const messageElement = document.createElement('div');
        const isSent = message.user_id === this.currentUser.id;
        
        const time = new Date(message.created_at).toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        messageElement.innerHTML = `
            ${!isSent ? `<div class="message-sender">${message.users?.name || 'کاربر'}</div>` : ''}
            <div class="message-text">${this.escapeHtml(message.content)}</div>
            <div class="message-time">${time}</div>
        `;

        return messageElement;
    }

    async switchGroup(group) {
        this.currentGroup = group;
        
        // آپدیت UI
        document.querySelectorAll('.group-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-group-id="${group.id}"]`).classList.add('active');
        
        document.getElementById('currentGroupName').textContent = group.name;
        document.getElementById('currentGroupAvatar').textContent = group.avatar || group.name.charAt(0);
        document.getElementById('currentGroupMeta').textContent = `${group.totalCount} عضو • ${group.onlineCount} آنلاین`;
        
        // نمایش دکمه اعضای گروه
        document.getElementById('groupMembersBtn').style.display = 'block';
        document.getElementById('chatSettingsBtn').style.display = 'block';
        
        // فعال کردن input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('messageInput').placeholder = 'پیام خود را بنویسید...';
        document.getElementById('sendButton').disabled = false;
        
        // بارگذاری پیام‌ها و اعضای گروه
        this.showLoading(true);
        try {
            await Promise.all([
                this.loadGroupMessages(group.id),
                this.loadGroupMembers(group.id)
            ]);
            console.log(`✅ Switched to group: ${group.name}`);
        } catch (error) {
            console.error('Error switching group:', error);
            this.showNotification('خطا در بارگذاری گروه', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showGroupMembersModal() {
        const modal = document.getElementById('groupMembersModal');
        modal.classList.add('show');
    }

    hideGroupMembersModal() {
        const modal = document.getElementById('groupMembersModal');
        modal.classList.remove('show');
    }

    showAddUserModal() {
        const modal = document.getElementById('addUserModal');
        modal.classList.add('show');
    }

    hideAddUserModal() {
        const modal = document.getElementById('addUserModal');
        modal.classList.remove('show');
        document.getElementById('addUserForm').reset();
    }

    showBulkAddUsersModal() {
        const modal = document.getElementById('bulkAddUsersModal');
        modal.classList.add('show');
    }

    hideBulkAddUsersModal() {
        const modal = document.getElementById('bulkAddUsersModal');
        modal.classList.remove('show');
    }

    showAddMemberModal() {
        this.updateAvailableUsersUI();
        const modal = document.getElementById('addMemberModal');
        modal.classList.add('show');
    }

    hideAddMemberModal() {
        const modal = document.getElementById('addMemberModal');
        modal.classList.remove('show');
    }

    bindEvents() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            this.handleLogin(e);
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // New group
        document.getElementById('newGroupBtn').addEventListener('click', () => {
            this.createNewGroup();
        });

        // Group members
        document.getElementById('groupMembersBtn').addEventListener('click', () => {
            this.showGroupMembersModal();
        });

        // Add member to group
        document.getElementById('addMemberBtn').addEventListener('click', () => {
            this.showAddMemberModal();
        });

        // Close modals
        document.getElementById('closeMembersModal').addEventListener('click', () => {
            this.hideGroupMembersModal();
        });

        document.getElementById('closeAddUserModal').addEventListener('click', () => {
            this.hideAddUserModal();
        });

        document.getElementById('closeBulkAddModal').addEventListener('click', () => {
            this.hideBulkAddUsersModal();
        });

        document.getElementById('closeAddMemberModal').addEventListener('click', () => {
            this.hideAddMemberModal();
        });

        // Add user
        document.getElementById('addUserBtn').addEventListener('click', () => {
            this.showAddUserModal();
        });

        // Bulk add users
        document.getElementById('bulkAddUsersBtn').addEventListener('click', () => {
            this.showBulkAddUsersModal();
        });

        // Add user form
        document.getElementById('addUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('newUsername').value.trim();
            const password = document.getElementById('newPassword').value;
            const fullName = document.getElementById('newFullName').value.trim();
            const avatar = document.getElementById('newAvatar').value.trim();
            const role = document.getElementById('newUserRole').value;
            
            if (!username || !password || !fullName) {
                this.showNotification('لطفاً تمام فیلدهای ضروری را پر کنید', 'error');
                return;
            }
            
            this.addNewUser(username, password, fullName, avatar, role);
            this.hideAddUserModal();
        });

        // Bulk add users
        document.getElementById('confirmBulkAdd').addEventListener('click', () => {
            const count = parseInt(document.getElementById('userCount').value);
            const prefix = document.getElementById('usernamePrefix').value.trim();
            const password = document.getElementById('defaultPassword').value;

            if (!prefix) {
                this.showNotification('لطفاً پیشوند نام کاربری را وارد کنید', 'error');
                return;
            }

            if (count > CONFIG.MAX_BULK_USERS) {
                this.showNotification(`حداکثر تعداد کاربران ${CONFIG.MAX_BULK_USERS} است`, 'error');
                return;
            }
            
            this.bulkAddUsers(count, prefix, password);
            this.hideBulkAddUsersModal();
        });

        document.getElementById('cancelBulkAdd').addEventListener('click', () => {
            this.hideBulkAddUsersModal();
        });

        // Send message
        document.getElementById('sendButton').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        document.getElementById('messageInput').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (modal.id === 'groupMembersModal') this.hideGroupMembersModal();
                    if (modal.id === 'addUserModal') this.hideAddUserModal();
                    if (modal.id === 'bulkAddUsersModal') this.hideBulkAddUsersModal();
                    if (modal.id === 'addMemberModal') this.hideAddMemberModal();
                }
            });
        });

        // Search functionality
        const searchInput = document.querySelector('.search-input');
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value.toLowerCase();
                this.filterGroups(searchTerm);
            }, CONFIG.DEBOUNCE_DELAY);
        });

        // Clear search on escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.target.value = '';
                this.filterGroups('');
            }
        });

        console.log('✅ All events bound successfully');
    }

    filterGroups(searchTerm) {
        const groupItems = document.querySelectorAll('.group-item');
        let visibleCount = 0;
        
        groupItems.forEach(item => {
            const groupName = item.querySelector('.group-name').textContent.toLowerCase();
            if (groupName.includes(searchTerm)) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        // اگر هیچ نتیجه‌ای پیدا نشد
        if (visibleCount === 0 && searchTerm) {
            const groupsList = document.getElementById('groupsList');
            const noResults = document.createElement('div');
            noResults.className = 'message-system';
            noResults.style.margin = '0';
            noResults.style.padding = '10px';
            noResults.innerHTML = `هیچ گروهی با "${searchTerm}" یافت نشد`;
            
            // حذف پیام قبلی اگر وجود دارد
            const existingNoResults = groupsList.querySelector('.message-system');
            if (existingNoResults) {
                existingNoResults.remove();
            }
            
            groupsList.appendChild(noResults);
        } else {
            // حذف پیام عدم وجود نتیجه
            const existingNoResults = document.querySelector('#groupsList .message-system');
            if (existingNoResults && searchTerm) {
                existingNoResults.remove();
            }
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notificationText');
        
        notificationText.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, CONFIG.NOTIFICATION_TIMEOUT);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new RealTimeChatApp();
});

// Handle page unload
window.addEventListener('beforeunload', async () => {
    if (window.chatApp && window.chatApp.currentUser) {
        await window.chatApp.setUserOnlineStatus(false);
    }
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    if (window.chatApp && window.chatApp.currentUser) {
        if (document.hidden) {
            // صفحه مخفی شده - کاربر ممکن است آنلاین نباشد
            window.chatApp.setUserOnlineStatus(false);
        } else {
            // صفحه visible شده - کاربر برگشته
            window.chatApp.setUserOnlineStatus(true);
        }
    }
});