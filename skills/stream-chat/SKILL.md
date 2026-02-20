---
name: stream-chat
description: >-
  Build scalable chat applications with Stream Chat SDK. Features include 
  channels, messages, reactions, threads, moderation, and offline support. 
  Use for messaging apps, social features, customer support, and gaming chat.
license: Apache-2.0
compatibility: "Requires Stream Chat API key and secret"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: messaging
  tags: ["stream", "chat", "messaging", "real-time", "sdk", "channels"]
---

# Stream Chat SDK

Build feature-rich chat experiences with Stream's scalable messaging infrastructure.

## Authentication Setup

### API Configuration

Get credentials from https://getstream.io/dashboard.

```bash
export STREAM_API_KEY="your_api_key"
export STREAM_API_SECRET="your_api_secret"
export STREAM_APP_ID="your_app_id"
```

### Server-Side Setup

```python
"""stream_server.py — Server-side Stream Chat client."""
from stream_chat import StreamChat
import jwt, time, json

class StreamChatServer:
    def __init__(self, api_key: str, api_secret: str):
        self.client = StreamChat(api_key=api_key, api_secret=api_secret)
        self.api_key = api_key
        self.api_secret = api_secret
    
    def create_user_token(self, user_id: str, exp: int = None) -> str:
        """Create user authentication token.
        
        Args:
            user_id: Unique user identifier.
            exp: Token expiration timestamp.
        
        Returns:
            JWT token for client authentication.
        """
        payload = {"user_id": user_id}
        
        if exp:
            payload["exp"] = exp
        else:
            payload["exp"] = int(time.time()) + 3600  # 1 hour
        
        return jwt.encode(payload, self.api_secret, algorithm="HS256")
    
    def upsert_user(self, user_id: str, user_data: dict):
        """Create or update user.
        
        Args:
            user_id: User ID.
            user_data: User profile data.
        """
        self.client.upsert_user({"id": user_id, **user_data})
    
    def create_channel(self, channel_type: str, channel_id: str, 
                      created_by_id: str, data: dict = None) -> dict:
        """Create a new channel.
        
        Args:
            channel_type: Channel type (messaging, team, etc.).
            channel_id: Unique channel identifier.
            created_by_id: User ID of creator.
            data: Additional channel data.
        
        Returns:
            Channel information.
        """
        channel = self.client.channel(channel_type, channel_id)
        
        channel_data = data or {}
        channel_data["created_by_id"] = created_by_id
        
        return channel.create(created_by_id, channel_data)
    
    def send_message(self, channel_type: str, channel_id: str, 
                    user_id: str, text: str, attachments: list = None) -> dict:
        """Send message to channel.
        
        Args:
            channel_type: Channel type.
            channel_id: Channel ID.
            user_id: Sender user ID.
            text: Message text.
            attachments: List of attachment objects.
        
        Returns:
            Message object.
        """
        channel = self.client.channel(channel_type, channel_id)
        
        message = {
            "text": text,
            "user": {"id": user_id}
        }
        
        if attachments:
            message["attachments"] = attachments
        
        return channel.send_message(message)
    
    def moderate_message(self, message_id: str, action: str, 
                        user_id: str = None) -> dict:
        """Moderate a message.
        
        Args:
            message_id: Message to moderate.
            action: 'flag', 'unflag', 'delete', 'bounce'.
            user_id: User performing action.
        
        Returns:
            Moderation result.
        """
        if action == "flag":
            return self.client.flag_message(message_id, user_id)
        elif action == "unflag":
            return self.client.unflag_message(message_id, user_id)
        elif action == "delete":
            return self.client.delete_message(message_id, hard=False)
        elif action == "bounce":
            return self.client.delete_message(message_id, hard=True)
    
    def ban_user(self, target_user_id: str, banned_by_id: str, 
                channel_type: str = None, channel_id: str = None,
                timeout: int = None, reason: str = None) -> dict:
        """Ban user from channel or app.
        
        Args:
            target_user_id: User to ban.
            banned_by_id: User performing ban.
            channel_type: Optional channel type for channel ban.
            channel_id: Optional channel ID for channel ban.
            timeout: Ban duration in minutes.
            reason: Ban reason.
        
        Returns:
            Ban result.
        """
        ban_data = {
            "target_user_id": target_user_id,
            "user_id": banned_by_id,
        }
        
        if timeout:
            ban_data["timeout"] = timeout
        if reason:
            ban_data["reason"] = reason
        
        if channel_type and channel_id:
            ban_data["type"] = channel_type
            ban_data["id"] = channel_id
            return self.client.ban_user(**ban_data)
        else:
            # App-level ban
            return self.client.ban_user(**ban_data)
    
    def query_channels(self, user_id: str, filters: dict, 
                      sort: list = None, limit: int = 20) -> dict:
        """Query channels for user.
        
        Args:
            user_id: User ID for context.
            filters: Channel filter criteria.
            sort: Sort order.
            limit: Max channels to return.
        
        Returns:
            Channel list with messages.
        """
        return self.client.query_channels(
            filters, sort or [{"last_message_at": -1}], 
            limit=limit, user_id=user_id
        )
    
    def search_messages(self, filters: dict, query: str, 
                       limit: int = 20) -> dict:
        """Search messages across channels.
        
        Args:
            filters: Channel filters.
            query: Search query.
            limit: Max results.
        
        Returns:
            Search results.
        """
        return self.client.search(filters, query, limit=limit)

# Usage
stream_server = StreamChatServer(
    api_key="your_api_key",
    api_secret="your_api_secret"
)

# Create users
stream_server.upsert_user("user1", {
    "name": "Alice Smith",
    "image": "https://example.com/avatar1.jpg",
    "role": "user"
})

# Create channel
channel_info = stream_server.create_channel(
    "messaging", "general", "user1",
    {"name": "General Discussion", "members": ["user1", "user2"]}
)
```

## Client-Side Implementation

### React Integration

```javascript
// StreamChatClient.js — React component with Stream Chat
import React, { useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import {
    Chat,
    Channel,
    ChannelList,
    MessageList,
    MessageInput,
    Thread,
    Window,
    ChannelHeader,
    TypingIndicator,
    MessageListNotifications,
} from 'stream-chat-react';

import 'stream-chat-react/dist/css/index.css';

const StreamChatClient = ({ userId, userName, userToken }) => {
    const [client, setClient] = useState(null);
    const [channel, setChannel] = useState(null);

    useEffect(() => {
        const initChat = async () => {
            // Initialize Stream Chat client
            const chatClient = StreamChat.getInstance('your_api_key');
            
            // Connect user
            await chatClient.connectUser(
                {
                    id: userId,
                    name: userName,
                    image: `https://getstream.io/random_svg/?name=${userName}`,
                },
                userToken
            );

            // Create/join channel
            const channel = chatClient.channel('messaging', 'general', {
                name: 'General Chat',
                members: [userId],
            });
            
            await channel.create();
            
            setClient(chatClient);
            setChannel(channel);
        };

        if (userId && userToken) {
            initChat();
        }

        // Cleanup on unmount
        return () => {
            if (client) {
                client.disconnectUser();
            }
        };
    }, [userId, userToken]);

    if (!client || !channel) {
        return <div>Loading chat...</div>;
    }

    const filters = { 
        type: 'messaging', 
        members: { $in: [userId] } 
    };
    
    const sort = { last_message_at: -1 };
    
    const options = { limit: 20 };

    return (
        <div className="chat-container" style={{ height: '100vh' }}>
            <Chat client={client} theme="messaging light">
                <div className="chat-layout" style={{ display: 'flex', height: '100%' }}>
                    {/* Channel List */}
                    <div className="channel-list" style={{ width: '300px' }}>
                        <ChannelList 
                            filters={filters}
                            sort={sort}
                            options={options}
                            setActiveChannelOnMount={false}
                        />
                    </div>
                    
                    {/* Main Chat Area */}
                    <div className="channel-container" style={{ flex: 1 }}>
                        <Channel channel={channel}>
                            <Window>
                                <ChannelHeader />
                                <MessageList />
                                <MessageInput focus />
                                <TypingIndicator />
                            </Window>
                            <Thread />
                        </Channel>
                    </div>
                </div>
            </Chat>
        </div>
    );
};

export default StreamChatClient;
```

### Custom Message Components

```javascript
// CustomMessage.js — Custom message rendering
import React from 'react';
import { MessageSimple } from 'stream-chat-react';

const CustomMessage = (props) => {
    const { message } = props;
    
    // Custom message types
    if (message.type === 'system') {
        return (
            <div className="system-message">
                <span className="system-text">{message.text}</span>
            </div>
        );
    }
    
    if (message.type === 'poll') {
        return <PollMessage message={message} />;
    }
    
    // Default message rendering with customizations
    return (
        <div className="custom-message-wrapper">
            <MessageSimple {...props} />
            
            {/* Custom actions */}
            <div className="custom-actions">
                <button onClick={() => translateMessage(message.id)}>
                    Translate
                </button>
                <button onClick={() => saveMessage(message.id)}>
                    Save
                </button>
            </div>
        </div>
    );
};

const PollMessage = ({ message }) => {
    const [votes, setVotes] = useState(message.poll_results || {});
    const [userVote, setUserVote] = useState(null);

    const vote = async (option) => {
        // Custom poll voting logic
        try {
            const response = await fetch('/api/poll/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: message.id,
                    option: option,
                    userId: message.user.id
                })
            });
            
            const result = await response.json();
            setVotes(result.votes);
            setUserVote(option);
            
        } catch (error) {
            console.error('Failed to vote:', error);
        }
    };

    return (
        <div className="poll-message">
            <h4>{message.poll_question}</h4>
            {message.poll_options.map((option, index) => (
                <div key={index} className="poll-option">
                    <button 
                        className={userVote === option ? 'voted' : ''}
                        onClick={() => vote(option)}
                        disabled={userVote !== null}
                    >
                        {option} ({votes[option] || 0} votes)
                    </button>
                </div>
            ))}
        </div>
    );
};

// Helper functions
const translateMessage = async (messageId) => {
    // Implement translation
    console.log('Translating message:', messageId);
};

const saveMessage = async (messageId) => {
    // Save to user's saved messages
    console.log('Saving message:', messageId);
};
```

### Advanced Features

```javascript
// AdvancedChatFeatures.js — Additional chat functionality
import { useChannelStateContext, useChatContext } from 'stream-chat-react';

const AdvancedChatFeatures = () => {
    const { client } = useChatContext();
    const { channel } = useChannelStateContext();

    // File upload with progress
    const uploadFile = async (file) => {
        try {
            const response = await channel.sendFile(file);
            
            // Send message with file attachment
            await channel.sendMessage({
                text: `Shared a file: ${file.name}`,
                attachments: [{
                    type: 'file',
                    asset_url: response.file,
                    title: file.name,
                    file_size: file.size,
                    mime_type: file.type,
                }]
            });
            
        } catch (error) {
            console.error('File upload failed:', error);
        }
    };

    // Message reactions
    const addReaction = async (messageId, reactionType) => {
        try {
            await client.sendReaction(messageId, { type: reactionType });
        } catch (error) {
            console.error('Failed to add reaction:', error);
        }
    };

    // Start typing indicator
    const startTyping = () => {
        channel.keystroke();
    };

    const stopTyping = () => {
        channel.stopTyping();
    };

    // Mute/unmute user
    const muteUser = async (userId) => {
        try {
            await client.muteUser(userId);
        } catch (error) {
            console.error('Failed to mute user:', error);
        }
    };

    const unmuteUser = async (userId) => {
        try {
            await client.unmuteUser(userId);
        } catch (error) {
            console.error('Failed to unmute user:', error);
        }
    };

    // Create thread
    const createThread = async (parentMessage, text) => {
        try {
            await channel.sendMessage({
                text: text,
                parent_id: parentMessage.id,
                thread_participants: [parentMessage.user.id],
            });
        } catch (error) {
            console.error('Failed to create thread:', error);
        }
    };

    // Mark messages as read
    const markAsRead = () => {
        channel.markRead();
    };

    // Search messages in current channel
    const searchInChannel = async (query) => {
        try {
            const results = await client.search(
                { cid: channel.cid },
                query,
                { limit: 20 }
            );
            return results;
        } catch (error) {
            console.error('Search failed:', error);
            return { results: [] };
        }
    };

    // Export chat history
    const exportChatHistory = async () => {
        try {
            const messages = await channel.query({
                messages: { limit: 1000 }
            });
            
            const chatHistory = messages.messages.map(msg => ({
                user: msg.user.name,
                text: msg.text,
                timestamp: msg.created_at,
                attachments: msg.attachments
            }));
            
            // Download as JSON
            const blob = new Blob([JSON.stringify(chatHistory, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-history-${channel.id}.json`;
            a.click();
            
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    // Message moderation
    const flagMessage = async (messageId) => {
        try {
            await client.flagMessage(messageId);
        } catch (error) {
            console.error('Failed to flag message:', error);
        }
    };

    const deleteMessage = async (messageId) => {
        try {
            await client.deleteMessage(messageId);
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
    };

    // Presence and status
    const updateUserPresence = async (status) => {
        try {
            await client.upsertUser({
                id: client.userID,
                custom: { status: status } // 'online', 'away', 'busy'
            });
        } catch (error) {
            console.error('Failed to update presence:', error);
        }
    };

    // Push notifications
    const registerForPushNotifications = async (deviceToken) => {
        try {
            await client.addDevice(deviceToken, 'firebase');
        } catch (error) {
            console.error('Failed to register for push notifications:', error);
        }
    };

    return {
        uploadFile,
        addReaction,
        startTyping,
        stopTyping,
        muteUser,
        unmuteUser,
        createThread,
        markAsRead,
        searchInChannel,
        exportChatHistory,
        flagMessage,
        deleteMessage,
        updateUserPresence,
        registerForPushNotifications
    };
};

export default AdvancedChatFeatures;
```

## Moderation & Security

```python
"""stream_moderation.py — Chat moderation and security."""

class StreamModeration:
    def __init__(self, stream_client):
        self.client = stream_client
    
    def setup_automod(self, channel_type: str, automod_config: dict):
        """Configure automatic moderation.
        
        Args:
            channel_type: Channel type to configure.
            automod_config: Automod settings.
        """
        # Configure automod thresholds
        config = {
            "automod": "AI",
            "automod_behavior": "block",  # or "flag"
            "automod_thresholds": {
                "explicit": {"block": 0.8, "flag": 0.6},
                "spam": {"block": 0.9, "flag": 0.7},
                "toxic": {"block": 0.85, "flag": 0.6}
            },
            **automod_config
        }
        
        return self.client.update_channel_type(channel_type, **config)
    
    def create_moderation_dashboard(self, moderator_user_id: str):
        """Create admin channel for moderation.
        
        Args:
            moderator_user_id: Admin user ID.
        
        Returns:
            Moderation channel.
        """
        channel = self.client.channel("admin", "moderation", {
            "name": "Moderation Dashboard",
            "members": [moderator_user_id],
            "permissions": {
                "admin": ["*"],
                "moderator": ["read", "create", "update"],
                "user": []  # No regular user access
            }
        })
        
        channel.create(moderator_user_id)
        return channel
    
    def handle_automod_event(self, event_data: dict):
        """Process automod flagged content.
        
        Args:
            event_data: Webhook event data.
        """
        message = event_data.get("message", {})
        automod_result = event_data.get("automod_result", {})
        
        if automod_result.get("action") == "block":
            # Message was blocked
            self.log_blocked_message(message, automod_result)
            self.notify_moderators(message, "blocked")
            
        elif automod_result.get("action") == "flag":
            # Message was flagged for review
            self.queue_for_moderation(message, automod_result)
            self.notify_moderators(message, "flagged")
    
    def log_blocked_message(self, message: dict, reason: dict):
        """Log blocked message for review."""
        log_entry = {
            "timestamp": message.get("created_at"),
            "user_id": message.get("user", {}).get("id"),
            "message_id": message.get("id"),
            "text": message.get("text"),
            "reason": reason,
            "action": "blocked"
        }
        
        # Save to moderation log
        self.save_moderation_log(log_entry)
    
    def bulk_moderate_user(self, user_id: str, action: str, 
                          channels: list = None):
        """Apply moderation action to user across channels.
        
        Args:
            user_id: Target user ID.
            action: 'mute', 'ban', 'timeout'.
            channels: Specific channels (None for all).
        """
        if action == "ban":
            # Ban from all channels or specified channels
            if channels:
                for channel_id in channels:
                    self.client.ban_user(user_id, channel_id=channel_id)
            else:
                self.client.ban_user(user_id)  # App-level ban
                
        elif action == "mute":
            # Mute user
            self.client.mute_user(user_id)
            
        elif action == "timeout":
            # Temporary ban (24 hours)
            self.client.ban_user(user_id, timeout=1440)  # minutes
    
    def save_moderation_log(self, log_entry: dict):
        """Save moderation action to database."""
        # Implement your logging storage
        pass
    
    def notify_moderators(self, message: dict, action: str):
        """Send notification to moderators."""
        # Send to moderation channel
        moderation_channel = self.client.channel("admin", "moderation")
        moderation_channel.send_message({
            "text": f"Message {action}: {message.get('text', '')[:100]}...",
            "attachments": [{
                "type": "moderation",
                "title": f"Content {action}",
                "fields": [
                    {"title": "User", "value": message.get("user", {}).get("name"), "short": True},
                    {"title": "Channel", "value": message.get("cid"), "short": True},
                    {"title": "Message ID", "value": message.get("id"), "short": True},
                    {"title": "Action", "value": action, "short": True}
                ]
            }]
        })
```

## Guidelines

- Use server-side token generation to avoid exposing API secrets in client code
- Implement proper user authentication and channel permissions for security
- Configure automoderation thresholds based on your community standards and content policy
- Use custom message components to add features like polls, file sharing, and rich media
- Implement offline support with proper message queuing and sync when connection returns
- Monitor message delivery and connection status to provide user feedback
- Use threads for organizing conversations and reducing main channel noise
- Implement push notifications for mobile apps to maintain user engagement
- Set up proper webhook handlers to process events, moderate content, and update external systems
- Consider message retention policies and data export features for compliance requirements
- Use typing indicators, read receipts, and presence status to enhance user experience
- Implement search functionality across channels and message history for better usability