const API_URL = '/api';

const app = {
    user: null,
    html5QrcodeScanner: null,
    startFromOne: false,

    init() {
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
        document.getElementById('btn-confirm-delivery').addEventListener('click', this.markDelivered.bind(this));
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
        this.renderNav();
        
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

    askSerialPreference() {
        const pref = confirm('Do you want to start Serial Numbers from 1 today?\n\nOK for START FROM 1\nCancel for CONTINUE FROM LAST');
        this.startFromOne = pref;
    },

    renderNav() {
        const navLinks = document.getElementById('nav-links');
        navLinks.innerHTML = `
            <li><span style="color:var(--primary)">${this.user.username} (${this.user.role})</span></li>
            <li><a onclick="app.logout()">Logout</a></li>
        `;
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        this.stopScanner();
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
            res.data.tokens.forEach(t => {
                const tr = document.createElement('tr');
                let actionBtn = '';
                if(t.status === 'PENDING_APPROVAL') {
                    actionBtn = `<button class="btn-success" onclick="app.approveToken('${t._id}')" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;">Approve</button>`;
                }
                if(t.status === 'PENDING') {
                    actionBtn += `<button onclick="app.manualDeliverToken('${t._id}')" style="background: var(--warning); padding: 5px 10px; font-size: 0.8rem; border: none; border-radius: 5px; cursor: pointer; color: #000; font-weight: bold;">Manual Deliver</button>`;
                }
                if(t.status === 'GENERATED') {
                    actionBtn += `<button onclick="app.deleteSingleToken('${t._id}')" style="background: var(--danger); padding: 5px 10px; font-size: 0.8rem; border: none; border-radius: 5px; cursor: pointer; color: #fff; font-weight: bold; margin-left: 5px;">Delete</button>`;
                }
                tr.innerHTML = `
                    <td>${t.serialNo}</td>
                    <td>${t.tokenId}</td>
                    <td>${t.consumerName || 'Not filled'}</td>
                    <td><span style="color: ${t.status === 'DELIVERED' ? 'var(--primary)' : t.status === 'PENDING_APPROVAL' ? 'var(--warning)' : t.status === 'GENERATED' ? '#ff5555' : '#fff'}">${t.status}</span></td>
                    <td>${actionBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch(err) {}
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
            console.error(err);
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

    async refreshPasswords() {
        if(!confirm('This will refresh the passwords for ALL staff and delivery users immediately. Continue?')) return;
        try {
            const res = await axios.post(`${API_URL}/admin/users/refresh-passwords`);
            alert(res.data.message);
            this.loadAdminUsers();
        } catch(err) { alert('Failed to refresh passwords'); }
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
        document.getElementById('admin-verify-result').innerHTML = 'Ready to scan...';
        this.startScanner('admin-verify-qr-reader', async (decodedText) => {
            try {
                const encoded = btoa(decodedText);
                const res = await axios.get(`${API_URL}/admin/verify/${encoded}`);
                if (res.data.success) {
                    const t = res.data.token;
                    document.getElementById('admin-verify-result').innerHTML = `
                        <p><strong>Status:</strong> <span style="color:var(--primary)">${t.status}</span></p>
                        <p><strong>Consumer:</strong> ${t.consumerName || 'N/A'}</p>
                        <p><strong>Contact:</strong> ${t.contactNo || 'N/A'}</p>
                        <p><strong>Token ID:</strong> ${t.tokenId}</p>
                        <p><strong>Serial:</strong> ${t.serialNo}</p>
                    `;
                    // Redirect or Success Tick? For verify, we just show data.
                }
            } catch(err) {
                document.getElementById('admin-verify-result').innerHTML = '<p style="color:var(--danger)">Invalid or not found.</p>';
            }
        });
    },

    async deleteUnusedTokens() {
        if(!confirm('Are you sure you want to delete all UNUSED tokens? (Tokens printed but not yet filled with data)')) return;
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
        } catch(err) {
            alert(err.response?.data?.message || 'Deletion failed');
        }
    },

    // --- STAFF METHODS ---
    async loadStaffStats() {
        try {
            const res = await axios.get(`${API_URL}/tokens/stats`);
            const s = res.data.stats;
            document.getElementById('staff-stat-total').innerText = s.totalIssued;
            document.getElementById('staff-stat-today').innerText = s.issuedToday;
            document.getElementById('staff-stat-pending').innerText = s.pending;
        } catch(err) {}
    },

    switchStaffMode(mode) {
        document.querySelectorAll('#staff-view .subview').forEach(el => el.classList.remove('active'));
        if (mode === 'generate') {
            document.getElementById('staff-generate-subview').classList.add('active');
            this.stopScanner();
        } else if (mode === 'scan') {
            document.getElementById('staff-scan-subview').classList.add('active');
            this.initStaffScanner();
        } else if (mode === 'deliver') {
            this.showView('delivery-view'); // Re-use delivery view logic
            this.loadDeliveryStats();
            this.initDeliveryScanner();
        }
    },

    async generateTokens() {
        const count = document.getElementById('token-count').value;
        const btn = document.querySelector('#staff-generate-subview .btn-primary');
        try {
            btn.innerText = 'Generating...';
            btn.disabled = true;
            const res = await axios.post(`${API_URL}/tokens/generate`, { count, startFromOne: this.startFromOne });
            if (res.data.success) {
                this.printTokens(res.data.tokens);
                this.showSuccess('Tokens Generated!', () => {
                    this.loadStaffStats();
                });
            }
        } catch(err) { 
            alert('Failed to generate tokens'); 
        } finally {
            btn.innerText = 'Generate & Print';
            btn.disabled = false;
        }
    },

    printTokens(tokens) {
        const printArea = document.getElementById('print-area');
        printArea.innerHTML = '';
        
        tokens.forEach(t => {
            printArea.innerHTML += `
                <div class="token-print-card">
                    <div class="token-header">KHESIA INDANE</div>
                    <div class="token-body">
                        <div class="token-info">
                            <h3>Token #${t.serialNo}</h3>
                            <p>ID: ${t.tokenId}</p>
                            <p style="font-size:8pt; margin-top:5mm;">Status: VALID</p>
                        </div>
                        <img src="${t.qrImage}" class="token-qr" alt="QR">
                    </div>
                    <div class="token-footer">
                        <div class="stamp-box">STAMP</div>
                        <div class="signature-area">
                            <div></div>
                            <span>Signature</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        window.print();
    },

    initStaffScanner() {
        this.startScanner('staff-qr-reader', async (decodedText) => {
            this.stopScanner();
            try {
                const encoded = btoa(decodedText);
                const res = await axios.get(`${API_URL}/tokens/scan/${encoded}`);
                
                if (res.data.success) {
                    const token = res.data.token;
                    if(token.consumerName) {
                        alert('Token already filled!');
                        this.switchStaffMode('generate');
                        return;
                    }
                    
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
                this.initStaffScanner(); // restart
            }
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
            btn.innerText = 'Submitting...';
            btn.disabled = true;
            const res = await axios.post(`${API_URL}/tokens/fill`, data);
            this.showSuccess(res.data.message, () => {
                document.getElementById('fill-data-form').reset();
                this.showView(this.user.role === 'Admin' ? 'admin-view' : 'staff-view');
                if(this.user.role !== 'Admin') this.switchStaffMode('generate');
            });
        } catch(err) {
            alert(err.response?.data?.message || 'Failed to fill data');
        } finally {
            btn.innerText = 'Submit Data';
            btn.disabled = false;
        }
    },

    // --- DELIVERY METHODS ---
    async loadDeliveryStats() {
        try {
            const res = await axios.get(`${API_URL}/delivery/dashboard`);
            const data = res.data;
            document.getElementById('del-stat-done').innerText = data.deliveredToday;
            
            const listContainer = document.getElementById('delivery-pending-list');
            listContainer.innerHTML = '';
            
            if (!data.pendingTodayList || data.pendingTodayList.length === 0) {
                listContainer.innerHTML = '<p style="color:var(--text-muted)">No pending deliveries scheduled for today.</p>';
                document.getElementById('del-stat-pending').innerText = '0';
                return;
            }
            
            document.getElementById('del-stat-pending').innerText = data.pendingTodayList.length;
            
            data.pendingTodayList.forEach(item => {
                listContainer.innerHTML += `
                    <div class="delivery-item">
                        <p><strong>Consumer:</strong> ${item.consumerName} (${item.consumerNo})</p>
                        <p><strong>Contact:</strong> ${item.contactNo}</p>
                        <p><strong>DAC:</strong> ${item.dacNumber}</p>
                    </div>
                `;
            });
        } catch(err) {}
    },

    initDeliveryScanner() {
        document.getElementById('delivery-scan-card').classList.remove('hidden');
        document.getElementById('delivery-action-card').classList.add('hidden');
        this.currentDeliveryData = null;

        this.startScanner('delivery-qr-reader', async (decodedText) => {
            try {
                const encoded = btoa(decodedText);
                const res = await axios.get(`${API_URL}/tokens/scan/${encoded}`);
                
                if (res.data.success) {
                    this.stopScanner();
                    const token = res.data.token;
                    this.currentDeliveryData = token;
                    
                    document.getElementById('delivery-scan-card').classList.add('hidden');
                    document.getElementById('delivery-action-card').classList.remove('hidden');
                    
                    document.getElementById('del-consumer-name').innerText = token.consumerName || 'N/A';
                    document.getElementById('del-contact-no').innerText = token.contactNo || 'N/A';
                    document.getElementById('del-expected-date').innerText = new Date(token.expectedDeliveryDate).toLocaleDateString() || 'N/A';
                    document.getElementById('del-status').innerText = token.status;
                }
            } catch(err) {
                alert(err.response?.data?.message || 'Invalid QR Code');
            }
        });
    },

    async markDelivered() {
        if (!this.currentDeliveryData) return;
        try {
            const res = await axios.put(`${API_URL}/delivery/deliver`, {
                tokenId: this.currentDeliveryData.tokenId,
                qrHash: this.currentDeliveryData.qrHash
            });
            this.showSuccess('Delivered!', () => {
                this.loadDeliveryStats();
                this.initDeliveryScanner();
            });
        } catch(err) {
            alert(err.response?.data?.message || 'Failed to mark as delivered');
            this.initDeliveryScanner();
        }
    },

    resetDeliveryScan() {
        this.initDeliveryScanner();
    },

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

    // --- SCANNER UTILS ---
    startScanner(elementId, onSuccess) {
        this.stopScanner();
        // Force environment (back) camera
        const config = { 
            fps: 10, 
            qrbox: {width: 250, height: 250},
            rememberLastUsedCamera: true,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        };
        this.html5QrcodeScanner = new Html5QrcodeScanner(elementId, config, false);
        this.html5QrcodeScanner.render(onSuccess, (err) => {});
        
        // Auto-select back camera if possible after some delay (Html5QrcodeScanner limitation)
        // Note: The library usually picks back camera by default for "environment".
    },

    stopScanner() {
        if (this.html5QrcodeScanner) {
            try {
                this.html5QrcodeScanner.clear();
            } catch(err) {}
            this.html5QrcodeScanner = null;
        }
    }
};

window.onload = () => app.init();
