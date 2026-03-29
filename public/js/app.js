const API_URL = '/api';

const app = {
    user: null,
    scanner: null,
    startFromOne: false,
    syncInterval: null,
    currentView: null,
    i18n: {
        current: localStorage.getItem('lang') || 'en',
        en: {
            app_title: 'KHESIA INDANE',
            admin_dash: 'Admin Dashboard',
            staff_dash: 'Staff Dashboard',
            del_dash: 'Delivery Boy Panel',
            reg: 'Customer Register',
            gen: 'Generate Tokens',
            scan_fill: 'Scan & Fill Data',
            scan_del: 'Scan & Deliver',
            logout: 'Logout',
            total_issued: 'Total Issued',
            issued_today: 'Issued Today',
            pending: 'Delivery Pending',
            confirm_del: 'Confirm Delivery',
            unfilled_tokens: 'Delete Unused Tokens',
            add_staff: 'Add Staff/User',
            refresh_pass: 'Refresh Passwords',
            clear_unused: 'Clear Unused Tokens',
            verify_token: 'Verify Token',
            delivered_today: 'Delivered Today',
            token_list: 'Token List',
            daily_report: 'Daily Report',
            monthly_report: 'Monthly Report',
            new_user: '+ New User',
            token_count: 'Number of Tokens',
            gen_print: 'Generate & Print',
            all_rec: 'All Records',
            day_wise: 'Day-wise',
            week_wise: 'Week-wise',
            month_wise: 'Month-wise',
            quarterly: 'Quarterly',
            due_wise: 'Due Date-wise',
            export: 'Export to Excel',
            scan_del_title: 'Scan QR for Delivery',
            scan_del_hint: 'Scan Token to Mark as Delivered'
        },
        hi: {
            app_title: 'खेसिया इंडेन',
            admin_dash: 'एडमिन डैशबोर्ड',
            staff_dash: 'स्टाफ डैशबोर्ड',
            del_dash: 'वितरण कर्मचारी पैनल',
            reg: 'ग्राहक रजिस्टर',
            gen: 'टोकन जनरेट करें',
            scan_fill: 'पंजीकरण (स्कैन)',
            scan_del: 'वितरण करें (स्कैन)',
            logout: 'लॉगआउट',
            total_issued: 'कुल जारी',
            issued_today: 'आज जारी',
            pending: 'वितरण लंबित',
            confirm_del: 'वितरण की पुष्टि करें',
            unfilled_tokens: 'अप्रयुक्त हटाएं',
            add_staff: 'स्टाफ जोड़ें',
            refresh_pass: 'पासवर्ड बदलें',
            clear_unused: 'टोकन साफ करें',
            verify_token: 'सत्यापित करें',
            delivered_today: 'आज का वितरण',
            token_list: 'टोकन सूची',
            daily_report: 'दैनिक रिपोर्ट',
            monthly_report: 'मासिक रिपोर्ट',
            new_user: '+ नया यूजर',
            token_count: 'टोकन की संख्या',
            gen_print: 'जनरेट & प्रिंट',
            all_rec: 'सभी रिकॉर्ड',
            day_wise: 'दैनिक',
            week_wise: 'साप्ताहिक',
            month_wise: 'मासिक',
            quarterly: 'तिमाही',
            due_wise: 'देय तिथि अनुसार',
            export: 'एक्सेल में निकालें',
            scan_del_title: 'डिलिवरी स्कैन करें',
            scan_del_hint: 'वितरण के लिए टोकन स्कैन करें'
        }
    },

    t(key) {
        return this.i18n[this.i18n.current][key] || key;
    },

    toggleLanguage() {
        this.i18n.current = this.i18n.current === 'en' ? 'hi' : 'en';
        localStorage.setItem('lang', this.i18n.current);
        this.updateStaticTranslations();
        this.renderSidebar();
        if (this.user) {
            if (this.currentView === 'admin-view') { this.loadAdminStats(); this.loadAdminTokens(); }
            if (this.currentView === 'staff-view') this.loadStaffStats();
            if (this.currentView === 'delivery-view') this.loadDeliveryStats();
        }
    },

    updateStaticTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerText = this.t(key);
        });
        const btn = document.getElementById('lang-toggle');
        if (btn) btn.innerText = this.i18n.current === 'en' ? 'हिन्दी / EN' : 'ENGLISH / HI';
    },

    async init() {
        this.updateStaticTranslations();
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (token && user) {
            this.user = JSON.parse(user);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            this.showMainLayout();
        } else {
            this.showView('login-view');
        }

        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('login-form').addEventListener('submit', this.handleLogin.bind(this));
        document.getElementById('create-user-form').addEventListener('submit', this.handleCreateUser.bind(this));
        document.getElementById('fill-data-form').addEventListener('submit', this.handleStaffFill.bind(this));
        const confirmBtn = document.getElementById('btn-confirm-delivery');
        if(confirmBtn) confirmBtn.addEventListener('click', this.markDelivered.bind(this));
    },

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await axios.post(`${API_URL}/auth/login`, { username, password });
            if (res.data.success) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                this.user = res.data.user;
                axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
                this.showMainLayout();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Login failed');
        }
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.user = null;
        delete axios.defaults.headers.common['Authorization'];
        document.getElementById('navbar').classList.add('hidden');
        this.showView('login-view');
        this.stopScanner();
    },

    showMainLayout() {
        document.getElementById('navbar').classList.remove('hidden');
        this.renderSidebar();
        this.startAutoSync();
        
        if (this.user.role === 'Admin') {
            this.showView('admin-view');
            this.loadAdminStats();
            this.loadAdminTokens();
            this.loadAdminUsers();
        } else if (this.user.role === 'Staff' || this.user.role === 'Staff_Arvind') {
            this.showView('staff-view');
            this.loadStaffStats();
            this.switchStaffMode('generate');
            this.askSerialPreference();
        } else if (this.user.role === 'Delivery') {
            this.showView('delivery-view');
            this.loadDeliveryStats();
            this.initDeliveryScanner();
        }
    },

    startAutoSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => {
            if (this.user) {
                if (this.currentView === 'admin-view') this.loadAdminStats();
                if (this.currentView === 'staff-view') this.loadStaffStats();
                if (this.currentView === 'delivery-view') this.loadDeliveryStats();
            }
        }, 5000);
    },

    askSerialPreference() {
        const pref = confirm('Do you want to start Serial Numbers from 1 today?\n\nOK for START FROM 1\nCancel for CONTINUE FROM LAST');
        this.startFromOne = pref;
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebar-overlay').classList.toggle('active');
    },

    renderSidebar() {
        const sidebarLinks = document.getElementById('sidebar-links');
        const userDisplay = document.getElementById('user-display');
        
        const username = this.user?.username || 'User';
        userDisplay.innerHTML = `<span style="color:var(--primary)">${username}</span>`;
        
        // Update Logo in Sidebar
        document.querySelectorAll('.logo').forEach(l => l.innerText = this.t('app_title'));

        let links = '';
        if (this.user.role === 'Admin') {
            links = `
                <li onclick="app.showView('admin-view'); app.toggleSidebar()">${this.t('admin_dash')}</li>
                <li onclick="app.showRegister()">${this.t('reg')}</li>
                <li onclick="app.showModal('create-user-modal'); app.toggleSidebar()">${this.t('add_staff')}</li>
                <li onclick="app.refreshPasswords(); app.toggleSidebar()">${this.t('refresh_pass')}</li>
                <li onclick="app.deleteUnusedTokens(); app.toggleSidebar()">${this.t('clear_unused')}</li>
                <li onclick="app.logout()">${this.t('logout')}</li>
            `;
        } else if (this.user.role.startsWith('Staff')) {
            links = `
                <li onclick="app.showView('staff-view'); app.toggleSidebar()">${this.t('staff_dash')}</li>
                <li onclick="app.showRegister()">${this.t('reg')}</li>
                <li onclick="app.switchStaffMode('generate'); app.toggleSidebar()">${this.t('gen')}</li>
                <li onclick="app.switchStaffMode('scan'); app.toggleSidebar()">${this.t('scan_fill')}</li>
                <li onclick="app.switchStaffMode('deliver'); app.toggleSidebar()">${this.t('scan_del')}</li>
                <li onclick="app.deleteUnusedTokens(); app.toggleSidebar()">${this.t('clear_unused')}</li>
                <li onclick="app.logout()">${this.t('logout')}</li>
            `;
        } else if (this.user.role === 'Delivery') {
            links = `
                <li onclick="app.showView('delivery-view'); app.toggleSidebar()">${this.t('del_dash')}</li>
                <li onclick="app.logout()">${this.t('logout')}</li>
            `;
        }
        sidebarLinks.innerHTML = links;
    },

    showView(viewId) {
        this.currentView = viewId;
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) view.classList.add('active');
        this.stopScanner();
        this.renderSidebar(); // Keep user info updated
    },

    // --- UTILS: SCANNER (low-level Html5Qrcode) ---
    async getBestCamera() {
        try {
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length > 0) {
                const backCamera = cameras.find(c => 
                    c.label.toLowerCase().includes('back') || 
                    c.label.toLowerCase().includes('rear') || 
                    c.label.toLowerCase().includes('environment')
                );
                return backCamera ? backCamera.id : cameras[0].id;
            }
        } catch (err) { console.error("Camera detection error:", err); }
        return null;
    },

    async startScanner(elementId, callback) {
        await this.stopScanner();
        this.scanner = new Html5Qrcode(elementId);
        
        // Responsive qrbox: 70% of the smaller dimension
        const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
        };

        const config = { 
            fps: 20, 
            qrbox: qrboxFunction,
            aspectRatio: 1.0
        };
        
        try {
            const cameraId = await this.getBestCamera();
            if (cameraId) {
                await this.scanner.start(cameraId, config, callback);
            } else {
                await this.scanner.start({ facingMode: "environment" }, config, callback);
            }
        } catch (err) {
            console.error("Scanner start failure:", err);
            try {
                await this.scanner.start({ facingMode: "user" }, config, callback);
            } catch (e) {
                alert("Could not start camera. Please ensure permissions are granted.");
            }
        }
    },

    async stopScanner() {
        if (this.scanner && this.scanner.isScanning) {
            try {
                await this.scanner.stop();
            } catch (err) { console.error("Scanner stop error:", err); }
        }
        this.scanner = null;
    },

    // --- ADMIN METHODS ---
    async loadAdminStats() {
        try {
            const res = await axios.get(`${API_URL}/admin/stats`);
            const s = res.data.stats;
            document.getElementById('stat-total').innerText = s.total;
            if(document.getElementById('stat-issued-today')) document.getElementById('stat-issued-today').innerText = s.issuedToday || 0;
            document.getElementById('stat-delivered').innerText = s.deliveredToday;
            document.getElementById('stat-pending').innerText = s.pending;
        } catch(err) { console.error('Failed to load stats'); }
    },

    async loadAdminTokens() {
        try {
            const status = document.getElementById('filter-status').value;
            const date = document.getElementById('filter-date').value;
            const res = await axios.get(`${API_URL}/admin/tokens`, { params: { status, date } });
            
            const tbody = document.getElementById('admin-token-tbody');
            tbody.innerHTML = '';
            document.getElementById('select-all-tokens').checked = false;
            this.updateBulkDeleteVisibility();

            res.data.tokens.forEach(t => {
                const tr = document.createElement('tr');
                let actionBtn = '';
                
                if (t.status === 'UPDATE_PENDING') {
                    actionBtn = `<button class="btn-primary" onclick="app.openReviewModal('${t._id}')" style="background:var(--secondary); padding: 5px 10px; font-size: 0.8rem;">Review Update</button>`;
                } else if (t.status === 'PENDING_APPROVAL') {
                    actionBtn = `<button class="btn-success" onclick="app.approveToken('${t._id}')" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;">Approve</button>`;
                }
                
                if (t.status === 'PENDING' && t.consumerName) {
                    actionBtn += `<button onclick="app.manualDeliverToken('${t._id}')" style="background: var(--warning); padding: 5px 10px; font-size: 0.8rem; border: none; border-radius: 5px; cursor: pointer; color: #000; font-weight: bold; margin-right:5px;">Manual Deliver</button>`;
                }

                if (!t.consumerName || t.status === 'GENERATED' || this.user.role === 'Admin') {
                    actionBtn += `<button onclick="app.deleteSingleToken('${t._id}')" style="background: var(--danger); padding: 5px 10px; font-size: 0.8rem; border: none; border-radius: 5px; cursor: pointer; color: #fff; font-weight: bold;">Delete</button>`;
                }
                
                const checkbox = (!t.consumerName || t.status === 'GENERATED') 
                    ? `<input type="checkbox" class="token-checkbox" value="${t._id}" onclick="app.updateBulkDeleteVisibility()">`
                    : '';

                tr.innerHTML = `
                    <td>${checkbox}</td>
                    <td>${t.serialNo}</td>
                    <td>${t.tokenId}</td>
                    <td>${t.consumerName || 'Not filled'} (${t.status})</td>
                    <td><span style="color: ${t.status === 'DELIVERED' ? 'var(--primary)' : t.status === 'UPDATE_PENDING' ? '#facc15' : t.status === 'PENDING_APPROVAL' ? 'var(--warning)' : t.status === 'GENERATED' ? '#ff5555' : '#fff'}">${t.status}</span></td>
                    <td>${actionBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch(err) {}
    },

    async openReviewModal(id) {
        try {
            const res = await axios.get(`${API_URL}/admin/tokens`);
            const token = res.data.tokens.find(t => t._id === id);
            if (!token) return;

            const diff = token.pendingUpdate;
            const container = document.getElementById('review-diff-container');
            container.innerHTML = `
                <div class="review-diff">
                    <div class="diff-box">
                        <h4>Current Data</h4>
                        <p class="diff-item">Name: <span>${token.consumerName}</span></p>
                        <p class="diff-item">Contact: <span>${token.contactNo}</span></p>
                        <p class="diff-item">Consumer #: <span>${token.consumerNo}</span></p>
                        <p class="diff-item">DAC: <span>${token.dacNumber}</span></p>
                    </div>
                    <div class="diff-box">
                        <h4>Proposed Changes</h4>
                        <p class="diff-item ${token.consumerName !== diff.consumerName ? 'changed' : ''}">Name: <span>${diff.consumerName}</span></p>
                        <p class="diff-item ${token.contactNo !== diff.contactNo ? 'changed' : ''}">Contact: <span>${diff.contactNo}</span></p>
                        <p class="diff-item ${token.consumerNo !== diff.consumerNo ? 'changed' : ''}">Consumer #: <span>${diff.consumerNo}</span></p>
                        <p class="diff-item ${token.dacNumber !== diff.dacNumber ? 'changed' : ''}">DAC: <span>${diff.dacNumber}</span></p>
                    </div>
                </div>
            `;
            
            document.getElementById('btn-approve-update').onclick = () => this.processUpdate(id, 'approve');
            document.getElementById('btn-reject-update').onclick = () => this.processUpdate(id, 'reject');
            this.showModal('review-update-modal');
        } catch(err) {}
    },

    async processUpdate(id, action) {
        try {
            const res = await axios.put(`${API_URL}/admin/tokens/${id}/process-update`, { action });
            this.showSuccess(res.data.message, () => {
                this.closeModal();
                this.loadAdminStats();
                this.loadAdminTokens();
            });
        } catch(err) { alert('Action failed'); }
    },

    toggleSelectAll(checked) {
        document.querySelectorAll('.token-checkbox').forEach(cb => cb.checked = checked);
        this.updateBulkDeleteVisibility();
    },

    updateBulkDeleteVisibility() {
        const checkedCount = document.querySelectorAll('.token-checkbox:checked').length;
        document.getElementById('bulk-delete-btn').style.display = checkedCount > 0 ? 'inline-block' : 'none';
    },

    async deleteSelectedTokens() {
        const selected = Array.from(document.querySelectorAll('.token-checkbox:checked')).map(cb => cb.value);
        if (selected.length === 0) return;

        if(!confirm(`Are you sure you want to delete ${selected.length} selected tokens?`)) return;

        try {
            const res = await axios.delete(`${API_URL}/admin/tokens/bulk`, { data: { ids: selected } });
            this.showSuccess(res.data.message, () => {
                this.loadAdminStats();
                this.loadAdminTokens();
            });
        } catch(err) {
            alert(err.response?.data?.message || 'Bulk deletion failed');
        }
    },

    async deleteSingleToken(id) {
        if(!confirm('Delete this unused token?')) return;
        try {
            const res = await axios.delete(`${API_URL}/admin/tokens/${id}`);
            this.showSuccess(res.data.message, () => {
                this.loadAdminStats();
                this.loadAdminTokens();
            });
        } catch(err) { 
            alert(err.response?.data?.message || 'Failed to delete token'); 
        }
    },

    async loadAdminUsers() {
        try {
            const res = await axios.get(`${API_URL}/admin/users`);
            const tbody = document.getElementById('admin-users-tbody');
            tbody.innerHTML = '';
            res.data.users.forEach(u => {
                tbody.innerHTML += `<tr>
                    <td>${u.username}</td>
                    <td>${u.role}</td>
                    <td style="font-family: monospace; letter-spacing: 2px;">${u.currentPassword || '******'}</td>
                    <td>
                        <button onclick="app.deleteUser('${u._id}')" class="btn-danger" style="background: var(--danger); color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">Delete</button>
                    </td>
                </tr>`;
            });
        } catch(err) {}
    },

    async approveToken(id) {
        const reason = prompt('Please enter the reason for early delivery approval:');
        if (!reason || !reason.trim()) return alert('Reason is required!');
        try {
            await axios.put(`${API_URL}/admin/tokens/${id}/approve`, { reason });
            this.loadAdminStats();
            this.loadAdminTokens();
        } catch(err) { alert(err.response?.data?.message || 'Approval failed'); }
    },

    async deleteUser(id) {
        if(!confirm('Are you sure you want to delete this staff member?')) return;
        try {
            await axios.delete(`${API_URL}/admin/users/${id}`);
            this.loadAdminUsers();
        } catch(err) { alert('Failed to delete user'); }
    },

    async manualDeliverToken(id) {
        const reason = prompt('Please enter the reason for manual delivery (Backlog):');
        if (!reason || !reason.trim()) return alert('Reason is required for manual delivery!');
        try {
            await axios.put(`${API_URL}/admin/tokens/${id}/manual-deliver`, { reason });
            this.showSuccess('Manual delivery saved!', () => {
                this.loadAdminStats();
                this.loadAdminTokens();
            });
        } catch(err) { alert(err.response?.data?.message || 'Manual delivery failed'); }
    },

    exportExcel(type) {
        window.open(`${API_URL}/admin/export?reportType=${type}&token=${localStorage.getItem('token')}`, '_blank');
    },

    showModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal() { document.querySelectorAll('.modal').forEach(el => el.classList.add('hidden')); this.stopScanner(); },

    async handleCreateUser(e) {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const role = document.getElementById('new-user-role').value;
        try {
            await axios.post(`${API_URL}/admin/users`, { username, role });
            this.closeModal();
            this.loadAdminUsers();
            e.target.reset();
        } catch(err) { alert('Failed to create user'); }
    },

    openVerifyScanner() {
        this.showModal('verify-modal');
        document.getElementById('admin-verify-result').innerHTML = '<p style="text-align:center; color:#64748b;">Waiting for scan...</p>';
        this.startScanner('admin-verify-qr-reader', async (decodedText) => {
            try {
                const res = await axios.get(`${API_URL}/admin/verify/${btoa(decodedText)}`);
                if (res.data.success) {
                    const t = res.data.token;
                    document.getElementById('admin-verify-result').innerHTML = `
                        <div style="border-left:4px solid var(--primary); padding-left:10px;">
                            <h4 style="color:var(--primary); margin-bottom:10px;">Token Verified</h4>
                            <p><strong>Consumer:</strong> ${t.consumerName || 'Not filled'}</p>
                            <p><strong>Status:</strong> <span style="color:${t.status === 'DELIVERED' ? 'var(--primary)' : 'var(--warning)'}">${t.status}</span></p>
                            <p><strong>Token ID:</strong> ${t.tokenId}</p>
                            <p><strong>Serial:</strong> ${t.serialNo}</p>
                        </div>
                    `;
                }
            } catch(err) {
                document.getElementById('admin-verify-result').innerHTML = '<p style="color:var(--danger); text-align:center;">Invalid Token or QR mismatch</p>';
            }
        });
    },

    async refreshPasswords() {
        if(!confirm('This will refresh the passwords for ALL staff and delivery users immediately. Continue?')) return;
        try {
            const res = await axios.post(`${API_URL}/admin/users/refresh-passwords`);
            alert(res.data.message);
            this.loadAdminUsers();
        } catch(err) { alert('Failed to refresh passwords'); }
    },

    async deleteUnusedTokens() {
        if(!confirm('Are you sure you want to delete all UNUSED tokens? (Tokens printed but not yet filled)')) return;
        try {
            const res = await axios.delete(`${API_URL}/tokens/unused`);
            if (res.data.success) {
                this.showSuccess(res.data.message, () => {
                    if (this.user.role === 'Admin') {
                        this.loadAdminStats();
                        this.loadAdminTokens();
                    } else {
                        this.loadStaffStats();
                    }
                });
            }
        } catch(err) { alert(err.response?.data?.message || 'Deletion failed'); }
    },

    // --- STAFF METHODS ---
    async loadStaffStats() {
        const indicator = document.getElementById('sync-indicator');
        try {
            if (indicator) indicator.classList.add('syncing');
            const res = await axios.get(`${API_URL}/tokens/stats`);
            if (indicator) indicator.classList.remove('offline');
            const s = res.data.stats;
            document.getElementById('staff-stat-total').innerText = s.totalIssued;
            document.getElementById('staff-stat-today').innerText = s.issuedToday;
            document.getElementById('staff-stat-pending').innerText = s.pending;
        } catch(err) {
            if (indicator) indicator.classList.add('offline');
        } finally {
            if (indicator) setTimeout(() => indicator.classList.remove('syncing'), 500);
        }
    },

    switchStaffMode(mode) {
        this.stopScanner();
        
        if (mode === 'deliver') {
            this.showView('delivery-view');
            this.loadDeliveryStats();
            this.initDeliveryScanner();
            return;
        }

        document.querySelectorAll('#staff-view .subview').forEach(s => s.classList.remove('active'));
        const subview = document.getElementById(`staff-${mode}-subview`);
        if (subview) subview.classList.add('active');

        if (mode === 'scan') {
            this.startScanner('staff-qr-reader', (decodedText) => {
                this.handleStaffScan(decodedText);
            });
        }
    },

    async handleStaffScan(decodedText) {
        try {
            const res = await axios.get(`${API_URL}/tokens/scan/${btoa(decodedText)}`);
            if (res.data.success) {
                const token = res.data.token;
                if(token.status !== 'GENERATED' && token.consumerName) {
                    alert('Data already filled for this token!');
                    return;
                }
                this.stopScanner();
                document.getElementById('staff-scan-subview').classList.remove('active');
                document.getElementById('staff-fill-subview').classList.add('active');
                document.getElementById('staff-fill-subview').classList.remove('hidden');
                
                document.getElementById('fill-token-id').innerText = token.tokenId;
                document.getElementById('fill-serial-no').innerText = token.serialNo;
                document.getElementById('fill-tid').value = token.tokenId;
                document.getElementById('fill-hash').value = token.qrHash;
            }
        } catch(err) {
            alert(err.response?.data?.message || 'Invalid QR Code');
        }
    },

    async generateTokens() {
        const count = document.getElementById('token-count').value;
        const startFromOne = document.getElementById('start-from-one').checked;
        try {
            const res = await axios.post(`${API_URL}/tokens/generate`, { count, startFromOne });
            this.printTokens(res.data.tokens);
            this.loadStaffStats();
        } catch(err) { 
            alert('Failed to generate tokens'); 
        }
    },

    printTokens(tokens) {
        const printArea = document.getElementById('print-area');
        printArea.innerHTML = '';
        
        // Batch into pages of 6
        for (let i = 0; i < tokens.length; i += 6) {
            const pageTokens = tokens.slice(i, i + 6);
            const pageDiv = document.createElement('div');
            pageDiv.className = 'print-page-exact';
            
            pageTokens.forEach(t => {
                const card = document.createElement('div');
                card.className = 'token-print-card';
                card.innerHTML = `
                    <div class="token-print-header">
                        <h2>Token No: #${t.serialNo}</h2>
                    </div>
                    <div class="token-print-body">
                        <div class="token-print-info">
                            <h3 style="font-size: 14pt; margin-bottom: 5px;">TOKEN ID</h3>
                            <p style="font-size: 16pt; margin: 0;">${t.tokenId}</p>
                            <span style="font-size: 8pt; display: block; margin-top: 10px;">Scan to Register / Confirm Delivery</span>
                        </div>
                        <img src="${t.qrImage}" class="token-print-qr">
                    </div>
                    <div class="token-print-footer">
                        <div class="stamp-box">STAMP</div>
                        <div class="signature-box">Signature</div>
                    </div>
                `;
                pageDiv.appendChild(card);
            });
            
            // Add empty slots if less than 6 (as requested: do NOT stretch)
            for (let j = pageTokens.length; j < 6; j++) {
                const empty = document.createElement('div');
                empty.className = 'token-print-card';
                empty.style.border = '1px dashed #eee'; // Subtle hint of slot
                pageDiv.appendChild(empty);
            }
            
            printArea.appendChild(pageDiv);
        }
        
        // Wait for all QR images to be fully decoded by the browser
        const images = Array.from(printArea.querySelectorAll('img.token-print-qr'));
        const decodePromises = images.map(img => {
            // Some older browsers might not support img.decode()
            if (img.decode) return img.decode().catch(e => console.warn("Image decode wait failed", e));
            return Promise.resolve();
        });

        Promise.all(decodePromises).then(() => {
            // Mandatory 1s delay as a safety net for print preview generation
            setTimeout(() => {
                window.print();
            }, 1000);
        });
    },

    async handleStaffFill(e) {
        e.preventDefault();
        const data = {
            tokenId: document.getElementById('fill-tid').value,
            qrHash: document.getElementById('fill-hash').value,
            dacNumber: document.getElementById('fill-dac-number').value,
            consumerName: document.getElementById('fill-consumer-name').value,
            contactNo: document.getElementById('fill-contact-no').value,
            consumerNo: document.getElementById('fill-consumer-no').value,
            expectedDeliveryDate: document.getElementById('fill-expected-date').value,
            nextDueDays: document.getElementById('fill-due-days').value,
            isEarlyRequest: document.getElementById('fill-is-early').checked
        };
        const btn = document.querySelector('#fill-data-form button[type="submit"]');
        try {
            btn.innerText = 'Submitting...'; btn.disabled = true;
            const res = await axios.post(`${API_URL}/tokens/fill`, data);
            this.showSuccess(res.data.message, () => {
                document.getElementById('fill-data-form').reset();
                this.showView('staff-view');
                this.switchStaffMode('generate');
                this.loadStaffStats();
            });
        } catch(err) { alert(err.response?.data?.message || 'Failed to fill data'); }
        finally { btn.innerText = 'Submit Data'; btn.disabled = false; }
    },

    // --- DELIVERY METHODS ---
    async loadDeliveryStats() {
        const indicator = document.getElementById('sync-indicator');
        try {
            if (indicator) indicator.classList.add('syncing');
            const res = await axios.get(`${API_URL}/delivery/dashboard`);
            if (indicator) indicator.classList.remove('offline');
            const data = res.data;
            document.getElementById('del-stat-done').innerText = data.deliveredToday;
            document.getElementById('del-stat-pending').innerText = data.pendingTodayList.length;
            const listContainer = document.getElementById('delivery-pending-list');
            listContainer.innerHTML = '';
            if (data.pendingTodayList.length === 0) {
                listContainer.innerHTML = '<p style="color:var(--text-muted)">No pending deliveries for today.</p>';
            } else {
                data.pendingTodayList.forEach(item => {
                    listContainer.innerHTML += `
                        <div class="delivery-item">
                            <p><strong>Consumer:</strong> ${item.consumerName}</p>
                            <p><strong>Contact:</strong> ${item.contactNo}</p>
                            <p><strong>DAC:</strong> ${item.dacNumber}</p>
                        </div>
                    `;
                });
            }
        } catch(err) {
            if (indicator) indicator.classList.add('offline');
        } finally {
            if (indicator) setTimeout(() => indicator.classList.remove('syncing'), 500);
        }
    },

    initDeliveryScanner() {
        document.getElementById('delivery-scan-card').classList.remove('hidden');
        document.getElementById('delivery-action-card').classList.add('hidden');
        this.startScanner('delivery-qr-reader', (decodedText) => this.handleDeliveryScan(decodedText));
    },

    async handleDeliveryScan(decodedText) {
        try {
            const res = await axios.get(`${API_URL}/tokens/scan/${btoa(decodedText)}`);
            if (res.data.success) {
                this.stopScanner();
                const t = res.data.token;
                document.getElementById('delivery-scan-card').classList.add('hidden');
                document.getElementById('delivery-action-card').classList.remove('hidden');
                // Safe Fallbacks for data visibility
                document.getElementById('del-consumer-name').innerText = t.consumerName || 'Not Registered';
                document.getElementById('del-contact-no').innerText = t.contactNo || 'N/A';
                document.getElementById('del-expected-date').innerText = t.expectedDeliveryDate ? new Date(t.expectedDeliveryDate).toLocaleDateString() : 'TBD';
                document.getElementById('del-status').innerText = t.status;

                const confirmBtn = document.getElementById('btn-confirm-delivery');
                if (t.status === 'GENERATED') {
                    confirmBtn.disabled = true;
                    confirmBtn.innerText = 'Registration Pending';
                    confirmBtn.style.opacity = '0.5';
                    confirmBtn.style.cursor = 'not-allowed';
                } else {
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Confirm Delivery';
                    confirmBtn.style.opacity = '1';
                    confirmBtn.style.cursor = 'pointer';
                    confirmBtn.onclick = () => this.confirmDelivery(t.tokenId, t.qrHash);
                }
            }
        } catch (err) { alert(err.response?.data?.message || 'Invalid or expired token'); }
    },

    async handleManualDelivery() {
        const tokenId = document.getElementById('manual-token-id').value.trim();
        if (!tokenId || tokenId.length < 5) return alert('Please enter a valid Token ID');
        
        try {
            // We use the same scan endpoint since it takes base64 data. 
            // format of our scan data: KINDANE|TOKEN_ID|SERIAL_NO|HASH
            // However, the scan endpoint expects specific format. 
            // Better to add a dedicated simple search or just warn the user.
            // Actually, we can fetch token directly by ID for delivery search.
            const res = await axios.get(`${API_URL}/tokens/scan-manual/${tokenId}`);
            if (res.data.success) {
                const t = res.data.token;
                document.getElementById('delivery-scan-card').classList.add('hidden');
                document.getElementById('delivery-action-card').classList.remove('hidden');
                // Safe Fallbacks for data visibility
                document.getElementById('del-consumer-name').innerText = t.consumerName || 'Not Registered';
                document.getElementById('del-contact-no').innerText = t.contactNo || 'N/A';
                document.getElementById('del-expected-date').innerText = t.expectedDeliveryDate ? new Date(t.expectedDeliveryDate).toLocaleDateString() : 'TBD';
                document.getElementById('del-status').innerText = t.status;

                const confirmBtn = document.getElementById('btn-confirm-delivery');
                if (t.status === 'GENERATED') {
                    confirmBtn.disabled = true;
                    confirmBtn.innerText = 'Registration Pending';
                    confirmBtn.style.opacity = '0.5';
                    confirmBtn.style.cursor = 'not-allowed';
                } else {
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Confirm Delivery';
                    confirmBtn.style.opacity = '1';
                    confirmBtn.style.cursor = 'pointer';
                    confirmBtn.onclick = () => this.confirmDelivery(t.tokenId, t.qrHash);
                }
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Token not found or not ready for delivery');
        }
    },

    async confirmDelivery(tokenId, qrHash) {
        try {
            const res = await axios.put(`${API_URL}/delivery/deliver`, { tokenId, qrHash });
            if (res.data.success) {
                this.showSuccess('Token Delivered Successfully!', () => {
                    this.loadDeliveryStats();
                    this.initDeliveryScanner();
                });
            }
        } catch (err) { alert(err.response?.data?.message || 'Delivery confirmation failed'); }
    },

    resetDeliveryScan() { this.initDeliveryScanner(); },
    
    showSuccess(msg, next) {
        const overlay = document.getElementById('success-tick-overlay');
        const message = document.getElementById('success-message');
        message.innerText = msg;
        overlay.classList.remove('hidden');
        setTimeout(() => {
            overlay.classList.add('hidden');
            if(next) next();
        }, 1500);
    },
    // --- STAFF EDIT ---
    async findAndEditToken() {
        const query = prompt('Enter Token ID or Consumer Name:');
        if (!query) return;
        try {
            const res = await axios.get(`${API_URL}/admin/tokens`); 
            const t = res.data.tokens.find(tk => tk.tokenId === query || tk.consumerName?.toLowerCase().includes(query.toLowerCase()));
            if (t) {
                if (t.status === 'DELIVERED') return alert('Cannot edit delivered tokens');
                if (t.status === 'GENERATED') return alert('Token is unfilled. Please use Scan & Fill.');
                this.openEditRequestModal(t);
            } else {
                alert('Token not found or no access');
            }
        } catch(err) {}
    },

    openEditRequestModal(t) {
        document.getElementById('edit-req-id').value = t._id;
        document.getElementById('edit-req-name').value = t.consumerName || '';
        document.getElementById('edit-req-contact').value = t.contactNo || '';
        document.getElementById('edit-req-consumer-no').value = t.consumerNo || '';
        document.getElementById('edit-req-dac').value = t.dacNumber || '';
        document.getElementById('edit-req-date').value = t.expectedDeliveryDate ? t.expectedDeliveryDate.split('T')[0] : '';
        document.getElementById('edit-req-due').value = t.nextDueDays || 35;
        this.showModal('edit-request-modal');
    },

    async handleEditRequest(e) {
        e.preventDefault();
        const id = document.getElementById('edit-req-id').value;
        const data = {
            consumerName: document.getElementById('edit-req-name').value,
            contactNo: document.getElementById('edit-req-contact').value,
            consumerNo: document.getElementById('edit-req-consumer-no').value,
            dacNumber: document.getElementById('edit-req-dac').value,
            expectedDeliveryDate: document.getElementById('edit-req-date').value,
            nextDueDays: document.getElementById('edit-req-due').value
        };
        try {
            await axios.post(`${API_URL}/tokens/${id}/request-update`, data);
            this.showSuccess('Change request sent to Admin!', () => {
                this.closeModal();
                this.loadStaffStats();
            });
        } catch(err) { alert(err.response?.data?.message || 'Request failed'); }
    },

    // --- REGISTER METHODS ---
    showRegister() {
        this.showView('register-view');
        this.filterRegister('all');
        this.toggleSidebar();
    },

    async filterRegister(viewType) {
        let startDate = null, endDate = null;
        const now = new Date();
        document.getElementById('register-filter-info').innerText = `Viewing: ${viewType.toUpperCase()} Reports`;

        if (viewType !== 'all' && viewType !== 'due') {
            let start = new Date();
            if (viewType === 'day') {
                start.setHours(0,0,0,0);
            } else if (viewType === 'week') {
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                start = new Date(now.setDate(diff));
                start.setHours(0,0,0,0);
            } else if (viewType === 'month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (viewType === 'quarter') {
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
                startDate = start.toISOString();
                endDate = end.toISOString();
            }
            if (viewType !== 'quarter') {
                startDate = start.toISOString();
                endDate = new Date().toISOString();
            }
        } else if (viewType === 'due') {
            // For due date, show starting from today onwards for next 30 days by default
            const start = new Date();
            const end = new Date();
            end.setDate(start.getDate() + 30);
            startDate = start.toISOString();
            endDate = end.toISOString();
            document.getElementById('register-filter-info').innerText = "Viewing: Next 30 Days Due Dates";
        }

        this.loadCustomerRegister(viewType, startDate, endDate);
    },

    async loadCustomerRegister(viewType, startDate, endDate) {
        try {
            const params = { viewType };
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const res = await axios.get(`${API_URL}/tokens/register`, { params });
            const tbody = document.getElementById('register-tbody');
            tbody.innerHTML = '';

            res.data.tokens.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Date Filled">${t.filledAt ? new Date(t.filledAt).toLocaleDateString() : 'N/A'}</td>
                    <td data-label="Consumer">${t.consumerName}</td>
                    <td data-label="ID">${t.consumerNo}</td>
                    <td data-label="Contact">${t.contactNo}</td>
                    <td data-label="DAC">${t.dacNumber}</td>
                    <td data-label="Status"><span style="color:${t.status === 'DELIVERED' ? 'var(--primary)' : 'var(--warning)'}">${t.status}</span></td>
                    <td data-label="Expected">${t.expectedDeliveryDate ? new Date(t.expectedDeliveryDate).toLocaleDateString() : 'N/A'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch(err) { console.error(err); }
    },

    searchRegister(query) {
        const tbody = document.getElementById('register-tbody');
        const rows = tbody.querySelectorAll('tr');
        query = query.toLowerCase();
        
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    },

    exportRegister() {
        const viewType = document.getElementById('register-view-type').value;
        const now = new Date();
        let startDate = '', endDate = '';

        if (viewType !== 'all') {
             // Logic repeated for simplicity or extract to helper
             let start = new Date();
             if (viewType === 'day') start.setHours(0,0,0,0);
             else if (viewType === 'week') {
                 const day = now.getDay();
                 const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                 start = new Date(now.setDate(diff));
             } else if (viewType === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
             
             startDate = start.toISOString();
             endDate = new Date().toISOString();

             if (viewType === 'quarter') {
                 const quarter = Math.floor(now.getMonth() / 3);
                 startDate = new Date(now.getFullYear(), quarter * 3, 1).toISOString();
                 endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0).toISOString();
             }
        }
        
        const url = `${API_URL}/tokens/export-register?viewType=${viewType}&startDate=${startDate}&endDate=${endDate}`;
        window.location.href = url;
    },

    init() {
        const token = localStorage.getItem('token');
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const decoded = JSON.parse(atob(token.split('.')[1]));
            this.user = decoded;
            this.showMainLayout();
        } else {
            document.getElementById('login-view').classList.add('active');
        }

        document.getElementById('login-form').addEventListener('submit', this.handleLogin.bind(this));
        document.getElementById('new-user-form').addEventListener('submit', this.handleCreateUser.bind(this));
        if (document.getElementById('fill-data-form')) {
            document.getElementById('fill-data-form').addEventListener('submit', this.handleStaffFill.bind(this));
        }
        document.getElementById('edit-request-form').addEventListener('submit', this.handleEditRequest.bind(this));
    }
};

window.onload = () => app.init();
