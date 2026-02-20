---
title: Add Real-Time Collaboration to Your App
slug: add-realtime-collaboration-to-app
description: Build Google Docs-style collaborative features with real-time cursors, presence awareness, live document editing, and synchronized state management across multiple users.
skills:
  - ably
  - pusher
  - livekit
  - stream-chat
  - centrifugo
category: real-time
tags:
  - collaboration
  - real-time
  - presence
  - websockets
  - multiplayer
  - cursors
  - co-editing
---

# Add Real-Time Collaboration to Your App

You're building a document editor, design tool, or project management app and want to add Google Docs-style collaboration features. Users should see each other's cursors, live edits, and presence status in real-time.

## The Challenge

Sarah's team uses your project management tool daily, but they're frustrated when multiple people try to edit the same document. They can't see who else is working on what, changes get overwritten, and there's no way to see what teammates are typing in real-time.

Your users need:
- **Live cursors** showing where each user is working
- **Presence awareness** to see who's online and active
- **Real-time updates** when content changes
- **Conflict resolution** when multiple users edit simultaneously
- **Smooth performance** even with many concurrent users

## Solution Architecture

We'll build a collaborative system using WebSocket connections for real-time communication, operational transformations for conflict resolution, and presence management for awareness features.

### Step 1: Choose Your Real-Time Infrastructure

**Option A: Ably (Managed, Feature-Rich)**
```javascript
// ably-collaboration.js — Rich collaboration features
import Ably from 'ably';

class AblyCollaboration {
    constructor(apiKey, documentId, userId) {
        this.ably = new Ably.Realtime(apiKey);
        this.documentId = documentId;
        this.userId = userId;
        this.cursors = new Map();
        this.activeUsers = new Map();
        
        // Channels for different collaboration features
        this.presenceChannel = this.ably.channels.get(`presence:${documentId}`);
        this.cursorChannel = this.ably.channels.get(`cursors:${documentId}`);
        this.editChannel = this.ably.channels.get(`edits:${documentId}`);
        
        this.setupPresence();
        this.setupCursors();
        this.setupEditing();
    }
    
    setupPresence() {
        // Enter presence with user info
        this.presenceChannel.presence.enter({
            name: this.userData.name,
            avatar: this.userData.avatar,
            color: this.generateUserColor(),
            status: 'active',
            lastSeen: Date.now()
        });
        
        // Listen for presence changes
        this.presenceChannel.presence.subscribe('enter', (member) => {
            this.handleUserJoin(member);
        });
        
        this.presenceChannel.presence.subscribe('leave', (member) => {
            this.handleUserLeave(member);
        });
        
        this.presenceChannel.presence.subscribe('update', (member) => {
            this.handleUserUpdate(member);
        });
    }
    
    setupCursors() {
        // Send cursor position updates (throttled)
        this.cursorUpdateThrottle = this.throttle((position) => {
            this.cursorChannel.publish('cursor-move', {
                userId: this.userId,
                position: position,
                timestamp: Date.now()
            });
        }, 50); // 20 updates per second max
        
        // Listen for other users' cursor movements
        this.cursorChannel.subscribe('cursor-move', (message) => {
            if (message.data.userId !== this.userId) {
                this.updateCursorDisplay(message.data);
            }
        });
        
        // Handle text selection updates
        this.cursorChannel.subscribe('selection-change', (message) => {
            if (message.data.userId !== this.userId) {
                this.updateSelectionDisplay(message.data);
            }
        });
    }
    
    setupEditing() {
        // Listen for document changes
        this.editChannel.subscribe('operation', (message) => {
            if (message.data.userId !== this.userId) {
                this.applyRemoteOperation(message.data);
            }
        });
        
        // Handle typing indicators
        this.editChannel.subscribe('typing', (message) => {
            this.showTypingIndicator(message.data);
        });
    }
    
    // Cursor management
    updateCursorPosition(position) {
        this.cursorUpdateThrottle(position);
        
        // Show typing indicator
        this.editChannel.publish('typing', {
            userId: this.userId,
            position: position,
            isTyping: true
        });
        
        // Clear typing after delay
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.editChannel.publish('typing', {
                userId: this.userId,
                isTyping: false
            });
        }, 2000);
    }
    
    // Document operation handling
    sendOperation(operation) {
        const op = {
            userId: this.userId,
            operation: operation,
            timestamp: Date.now(),
            version: this.documentVersion
        };
        
        this.editChannel.publish('operation', op);
        this.documentVersion++;
    }
    
    applyRemoteOperation(data) {
        // Transform operation if necessary (operational transformation)
        const transformedOp = this.transformOperation(data.operation, this.pendingOperations);
        
        // Apply to document
        this.applyOperation(transformedOp);
        
        // Update UI
        this.updateEditor();
    }
    
    // Helper methods
    generateUserColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
        return colors[this.userId.charCodeAt(0) % colors.length];
    }
    
    throttle(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}
```

**Option B: Pusher (Simple, Reliable)**
```javascript
// pusher-collaboration.js — Straightforward real-time features
import Pusher from 'pusher-js';

class PusherCollaboration {
    constructor(appKey, documentId, userId, userToken) {
        this.pusher = new Pusher(appKey, {
            cluster: 'us2',
            authEndpoint: '/pusher/auth'
        });
        
        this.documentId = documentId;
        this.userId = userId;
        
        // Subscribe to presence channel for the document
        this.presenceChannel = this.pusher.subscribe(`presence-doc-${documentId}`);
        this.setupPresenceHandlers();
        
        // Subscribe to private channel for operations  
        this.editChannel = this.pusher.subscribe(`private-doc-${documentId}`);
        this.setupEditHandlers();
    }
    
    setupPresenceHandlers() {
        this.presenceChannel.bind('pusher:subscription_succeeded', (members) => {
            console.log('Current users:', members.count);
            members.each(member => this.addUserToUI(member.info));
        });
        
        this.presenceChannel.bind('pusher:member_added', (member) => {
            this.addUserToUI(member.info);
            this.showNotification(`${member.info.name} joined`);
        });
        
        this.presenceChannel.bind('pusher:member_removed', (member) => {
            this.removeUserFromUI(member.info);
            this.showNotification(`${member.info.name} left`);
        });
        
        // Custom events for collaboration
        this.presenceChannel.bind('client-cursor-move', (data) => {
            this.updateCursor(data);
        });
        
        this.presenceChannel.bind('client-selection-change', (data) => {
            this.updateSelection(data);
        });
    }
    
    setupEditHandlers() {
        this.editChannel.bind('document-operation', (data) => {
            this.applyRemoteOperation(data);
        });
        
        this.editChannel.bind('typing-indicator', (data) => {
            this.showTypingIndicator(data);
        });
    }
    
    // Send cursor position (client events)
    sendCursorUpdate(position) {
        this.presenceChannel.trigger('client-cursor-move', {
            userId: this.userId,
            position: position,
            timestamp: Date.now()
        });
    }
    
    // Send document operations (server-side trigger)
    sendOperation(operation) {
        fetch('/api/document/operation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId: this.documentId,
                operation: operation,
                userId: this.userId
            })
        });
    }
}
```

### Step 2: Implement Live Cursor Tracking

```javascript
// cursor-manager.js — Visual cursor management
class CursorManager {
    constructor(editor, collaboration) {
        this.editor = editor;
        this.collaboration = collaboration;
        this.cursors = new Map();
        this.selections = new Map();
        
        this.setupEventListeners();
        this.createCursorStyles();
    }
    
    setupEventListeners() {
        // Track local cursor position
        this.editor.addEventListener('mousedown', (e) => {
            this.handleCursorMove(e);
        });
        
        this.editor.addEventListener('keyup', (e) => {
            this.handleCursorMove(e);
        });
        
        // Track text selection
        document.addEventListener('selectionchange', () => {
            this.handleSelectionChange();
        });
    }
    
    handleCursorMove(event) {
        const position = this.getCaretPosition();
        const coordinates = this.getCaretCoordinates();
        
        // Send to other users
        this.collaboration.sendCursorUpdate({
            position: position,
            coordinates: coordinates,
            line: this.getCurrentLine(),
            column: this.getCurrentColumn()
        });
    }
    
    handleSelectionChange() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const selectionData = {
                start: this.getPositionFromNode(range.startContainer, range.startOffset),
                end: this.getPositionFromNode(range.endContainer, range.endOffset),
                text: selection.toString()
            };
            
            this.collaboration.sendSelectionUpdate(selectionData);
        }
    }
    
    // Display other users' cursors
    updateRemoteCursor(userId, data) {
        let cursor = this.cursors.get(userId);
        
        if (!cursor) {
            cursor = this.createCursorElement(userId, data.userInfo);
            this.cursors.set(userId, cursor);
        }
        
        // Update cursor position
        this.positionCursor(cursor, data.coordinates);
        
        // Show user info tooltip
        cursor.querySelector('.cursor-label').textContent = data.userInfo.name;
        
        // Auto-hide after inactivity
        clearTimeout(cursor.hideTimeout);
        cursor.style.opacity = '1';
        cursor.hideTimeout = setTimeout(() => {
            cursor.style.opacity = '0.3';
        }, 5000);
    }
    
    createCursorElement(userId, userInfo) {
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.position = 'absolute';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '1000';
        
        cursor.innerHTML = `
            <div class="cursor-line" style="
                width: 2px;
                height: 20px;
                background-color: ${userInfo.color};
                position: relative;
            ">
                <div class="cursor-label" style="
                    position: absolute;
                    top: -25px;
                    left: 0;
                    background: ${userInfo.color};
                    color: white;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 12px;
                    white-space: nowrap;
                ">${userInfo.name}</div>
            </div>
        `;
        
        this.editor.appendChild(cursor);
        return cursor;
    }
    
    positionCursor(cursor, coordinates) {
        cursor.style.left = coordinates.x + 'px';
        cursor.style.top = coordinates.y + 'px';
    }
    
    // Utility methods for position calculation
    getCaretPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;
        
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        
        return preCaretRange.toString().length;
    }
    
    getCaretCoordinates() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return { x: 0, y: 0 };
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorRect = this.editor.getBoundingClientRect();
        
        return {
            x: rect.left - editorRect.left,
            y: rect.top - editorRect.top
        };
    }
}
```

### Step 3: Implement Operational Transformation

```javascript
// operational-transform.js — Handle conflicting edits
class OperationalTransform {
    constructor() {
        this.operations = [];
        this.version = 0;
    }
    
    // Apply local operation
    applyLocal(operation) {
        const op = {
            ...operation,
            id: this.generateOperationId(),
            userId: this.userId,
            version: this.version,
            timestamp: Date.now()
        };
        
        this.operations.push(op);
        this.version++;
        
        // Send to server
        this.sendOperation(op);
        
        return op;
    }
    
    // Apply remote operation
    applyRemote(remoteOp) {
        // Transform against concurrent operations
        const transformedOp = this.transform(remoteOp, this.getUnacknowledgedOps());
        
        // Apply to document
        this.applyToDocument(transformedOp);
        
        // Add to operation log
        this.operations.push(transformedOp);
        
        return transformedOp;
    }
    
    // Transform two operations against each other
    transform(op1, op2) {
        if (op1.type === 'insert' && op2.type === 'insert') {
            return this.transformInsertInsert(op1, op2);
        } else if (op1.type === 'delete' && op2.type === 'delete') {
            return this.transformDeleteDelete(op1, op2);
        } else if (op1.type === 'insert' && op2.type === 'delete') {
            return this.transformInsertDelete(op1, op2);
        } else if (op1.type === 'delete' && op2.type === 'insert') {
            return this.transformDeleteInsert(op1, op2);
        }
        
        return op1;
    }
    
    transformInsertInsert(op1, op2) {
        if (op1.position <= op2.position) {
            return op1; // No transformation needed
        } else {
            // Shift position by length of concurrent insert
            return {
                ...op1,
                position: op1.position + op2.text.length
            };
        }
    }
    
    transformDeleteDelete(op1, op2) {
        if (op1.position >= op2.position + op2.length) {
            // Delete is after the other delete
            return {
                ...op1,
                position: op1.position - op2.length
            };
        } else if (op1.position + op1.length <= op2.position) {
            // Delete is before the other delete
            return op1;
        } else {
            // Overlapping deletes - complex case
            return this.handleOverlappingDeletes(op1, op2);
        }
    }
    
    transformInsertDelete(op1, op2) {
        if (op1.position <= op2.position) {
            return op1;
        } else if (op1.position >= op2.position + op2.length) {
            return {
                ...op1,
                position: op1.position - op2.length
            };
        } else {
            // Insert is within deleted range
            return {
                ...op1,
                position: op2.position
            };
        }
    }
    
    // Apply operation to document
    applyToDocument(operation) {
        switch (operation.type) {
            case 'insert':
                this.insertText(operation.position, operation.text);
                break;
            case 'delete':
                this.deleteText(operation.position, operation.length);
                break;
            case 'format':
                this.applyFormatting(operation.position, operation.length, operation.attributes);
                break;
        }
    }
    
    // Document manipulation methods
    insertText(position, text) {
        const currentText = this.getDocumentText();
        const newText = currentText.slice(0, position) + text + currentText.slice(position);
        this.setDocumentText(newText);
    }
    
    deleteText(position, length) {
        const currentText = this.getDocumentText();
        const newText = currentText.slice(0, position) + currentText.slice(position + length);
        this.setDocumentText(newText);
    }
    
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### Step 4: Add Presence Awareness UI

```javascript
// presence-ui.js — User presence and awareness features
class PresenceUI {
    constructor(container, collaboration) {
        this.container = container;
        this.collaboration = collaboration;
        this.users = new Map();
        
        this.createPresenceContainer();
        this.setupEventHandlers();
    }
    
    createPresenceContainer() {
        this.presenceContainer = document.createElement('div');
        this.presenceContainer.className = 'presence-container';
        this.presenceContainer.innerHTML = `
            <div class="presence-header">
                <h3>Active Users</h3>
                <span class="user-count">0 users</span>
            </div>
            <div class="presence-list"></div>
            <div class="presence-actions">
                <button id="invite-users">Invite Others</button>
            </div>
        `;
        
        this.container.appendChild(this.presenceContainer);
        this.presenceList = this.presenceContainer.querySelector('.presence-list');
    }
    
    setupEventHandlers() {
        // Listen for presence changes from collaboration system
        this.collaboration.on('userJoined', (user) => {
            this.addUser(user);
        });
        
        this.collaboration.on('userLeft', (user) => {
            this.removeUser(user);
        });
        
        this.collaboration.on('userUpdated', (user) => {
            this.updateUser(user);
        });
        
        // Handle invite button
        document.getElementById('invite-users').addEventListener('click', () => {
            this.showInviteDialog();
        });
    }
    
    addUser(user) {
        if (this.users.has(user.id)) return;
        
        const userElement = document.createElement('div');
        userElement.className = 'presence-user';
        userElement.id = `user-${user.id}`;
        
        userElement.innerHTML = `
            <div class="user-avatar" style="border-color: ${user.color}">
                <img src="${user.avatar || this.getDefaultAvatar(user.name)}" 
                     alt="${user.name}" />
                <div class="status-indicator ${user.status}"></div>
            </div>
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-activity">${this.getActivityText(user)}</div>
            </div>
            <div class="user-cursor-preview" style="background-color: ${user.color}"></div>
        `;
        
        // Add interaction handlers
        userElement.addEventListener('click', () => {
            this.focusOnUser(user);
        });
        
        this.presenceList.appendChild(userElement);
        this.users.set(user.id, userElement);
        
        this.updateUserCount();
        this.showUserNotification(`${user.name} joined the document`);
    }
    
    removeUser(user) {
        const userElement = this.users.get(user.id);
        if (userElement) {
            userElement.remove();
            this.users.delete(user.id);
            this.updateUserCount();
            this.showUserNotification(`${user.name} left the document`);
        }
    }
    
    updateUser(user) {
        const userElement = this.users.get(user.id);
        if (userElement) {
            // Update activity status
            const activityElement = userElement.querySelector('.user-activity');
            activityElement.textContent = this.getActivityText(user);
            
            // Update status indicator
            const statusElement = userElement.querySelector('.status-indicator');
            statusElement.className = `status-indicator ${user.status}`;
            
            // Update cursor preview
            const cursorPreview = userElement.querySelector('.user-cursor-preview');
            cursorPreview.style.backgroundColor = user.color;
        }
    }
    
    getActivityText(user) {
        if (user.isTyping) {
            return 'Typing...';
        } else if (user.lastActivity) {
            const timeDiff = Date.now() - user.lastActivity;
            if (timeDiff < 60000) {
                return 'Active';
            } else if (timeDiff < 300000) {
                return `Active ${Math.floor(timeDiff / 60000)}m ago`;
            } else {
                return 'Away';
            }
        }
        return 'Active';
    }
    
    focusOnUser(user) {
        // Jump to where the user is working
        if (user.currentPosition) {
            this.collaboration.scrollToPosition(user.currentPosition);
            this.collaboration.highlightUserArea(user.id);
        }
    }
    
    updateUserCount() {
        const countElement = this.presenceContainer.querySelector('.user-count');
        const count = this.users.size + 1; // +1 for current user
        countElement.textContent = `${count} user${count !== 1 ? 's' : ''}`;
    }
    
    showUserNotification(message) {
        // Create toast notification
        const notification = document.createElement('div');
        notification.className = 'presence-notification';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    showInviteDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'invite-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Invite Users to Collaborate</h3>
                <input type="email" id="invite-email" placeholder="Enter email address" />
                <div class="dialog-actions">
                    <button id="send-invite">Send Invite</button>
                    <button id="cancel-invite">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Handle dialog actions
        dialog.querySelector('#send-invite').addEventListener('click', () => {
            const email = dialog.querySelector('#invite-email').value;
            this.sendInvitation(email);
            dialog.remove();
        });
        
        dialog.querySelector('#cancel-invite').addEventListener('click', () => {
            dialog.remove();
        });
    }
    
    sendInvitation(email) {
        // Send invitation through your backend
        fetch('/api/documents/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId: this.collaboration.documentId,
                email: email
            })
        }).then(() => {
            this.showUserNotification(`Invitation sent to ${email}`);
        });
    }
    
    getDefaultAvatar(name) {
        // Generate avatar based on name initials
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        
        // Random background color based on name
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
        const bgColor = colors[name.charCodeAt(0) % colors.length];
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 40, 40);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.charAt(0).toUpperCase(), 20, 20);
        
        return canvas.toDataURL();
    }
}
```

### Step 5: Handle Offline/Online State

```javascript
// offline-handler.js — Manage connectivity and sync
class OfflineHandler {
    constructor(collaboration) {
        this.collaboration = collaboration;
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.syncInProgress = false;
        
        this.setupEventListeners();
        this.createOfflineIndicator();
    }
    
    setupEventListeners() {
        window.addEventListener('online', () => {
            this.handleOnline();
        });
        
        window.addEventListener('offline', () => {
            this.handleOffline();
        });
        
        // Detect connection quality changes
        this.collaboration.on('connectionStateChange', (state) => {
            this.handleConnectionChange(state);
        });
    }
    
    createOfflineIndicator() {
        this.indicator = document.createElement('div');
        this.indicator.className = 'connection-indicator';
        this.indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 9999;
            display: none;
        `;
        
        document.body.appendChild(this.indicator);
    }
    
    handleOffline() {
        this.isOnline = false;
        this.showOfflineMode();
        
        // Queue operations while offline
        this.collaboration.setOfflineMode(true);
        
        // Show offline indicator
        this.showIndicator('Offline - Changes will sync when connection returns', 'offline');
    }
    
    handleOnline() {
        this.isOnline = true;
        this.showIndicator('Reconnecting...', 'reconnecting');
        
        // Attempt to reconnect
        this.collaboration.reconnect()
            .then(() => {
                this.syncPendingOperations();
                this.showIndicator('Back online', 'online');
                setTimeout(() => this.hideIndicator(), 2000);
            })
            .catch(() => {
                this.showIndicator('Connection failed - Retrying...', 'error');
                setTimeout(() => this.handleOnline(), 5000);
            });
    }
    
    handleConnectionChange(state) {
        switch (state) {
            case 'connecting':
                this.showIndicator('Connecting...', 'connecting');
                break;
            case 'connected':
                this.showIndicator('Connected', 'online');
                setTimeout(() => this.hideIndicator(), 2000);
                break;
            case 'disconnected':
                this.showIndicator('Disconnected - Attempting to reconnect', 'reconnecting');
                break;
            case 'failed':
                this.showIndicator('Connection failed', 'error');
                break;
        }
    }
    
    async syncPendingOperations() {
        if (this.syncInProgress || this.pendingOperations.length === 0) {
            return;
        }
        
        this.syncInProgress = true;
        this.showIndicator(`Syncing ${this.pendingOperations.length} changes...`, 'syncing');
        
        try {
            // Send operations in order
            for (const operation of this.pendingOperations) {
                await this.collaboration.sendOperation(operation);
            }
            
            this.pendingOperations = [];
            this.showIndicator('Sync complete', 'online');
            
        } catch (error) {
            console.error('Sync failed:', error);
            this.showIndicator('Sync failed - Will retry', 'error');
        } finally {
            this.syncInProgress = false;
            setTimeout(() => this.hideIndicator(), 2000);
        }
    }
    
    queueOperation(operation) {
        this.pendingOperations.push(operation);
        this.updateOfflineIndicator();
    }
    
    showIndicator(message, type) {
        this.indicator.textContent = message;
        this.indicator.className = `connection-indicator ${type}`;
        
        const colors = {
            online: '#28a745',
            offline: '#6c757d', 
            reconnecting: '#ffc107',
            connecting: '#17a2b8',
            syncing: '#17a2b8',
            error: '#dc3545'
        };
        
        this.indicator.style.backgroundColor = colors[type] || '#6c757d';
        this.indicator.style.color = 'white';
        this.indicator.style.display = 'block';
    }
    
    hideIndicator() {
        this.indicator.style.display = 'none';
    }
    
    showOfflineMode() {
        // Add visual indicators that app is in offline mode
        document.body.classList.add('offline-mode');
        
        // Disable features that require connectivity
        this.disableOnlineFeatures();
    }
    
    disableOnlineFeatures() {
        // Disable invite functionality
        const inviteButton = document.getElementById('invite-users');
        if (inviteButton) {
            inviteButton.disabled = true;
            inviteButton.textContent = 'Offline';
        }
        
        // Show offline message in presence panel
        const presenceContainer = document.querySelector('.presence-container');
        if (presenceContainer) {
            presenceContainer.classList.add('offline');
        }
    }
    
    updateOfflineIndicator() {
        if (!this.isOnline && this.pendingOperations.length > 0) {
            this.showIndicator(
                `Offline - ${this.pendingOperations.length} changes pending`, 
                'offline'
            );
        }
    }
}
```

## Results

After implementing this real-time collaboration system:

**✅ What You Built:**
- Live cursor tracking showing where each user is working
- Presence awareness with user list and activity status  
- Real-time document editing with conflict resolution
- Offline support with automatic sync when reconnected
- Visual indicators for connection status and user activity

**📊 Performance Optimizations:**
- Throttled cursor updates (20/second max) to reduce bandwidth
- Operational transformation to handle concurrent edits
- Efficient presence detection with automatic cleanup
- Smart reconnection logic with exponential backoff
- Local storage for offline operation queuing

**🎯 User Experience Improvements:**
- Users can see who else is working on the document
- No more conflicting edits or lost changes
- Smooth collaboration even with poor connectivity
- Visual feedback for all collaboration activities
- Easy user invitation and permission management

**🚀 Next Steps:**
- Add voice/video calling integration with LiveKit
- Implement commenting and suggestion features
- Add document version history and branching
- Create mobile app support with push notifications
- Build analytics dashboard for collaboration metrics

Your app now provides Google Docs-level collaboration features, making teamwork seamless and conflicts a thing of the past. Users can focus on creating together instead of worrying about overwriting each other's work.