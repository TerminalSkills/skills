---
name: knock
description: >-
  Build notification infrastructure with Knock's multi-channel platform. 
  Features include workflows, templates, preferences, channels (email, SMS, 
  push, in-app), and analytics. Use for user notifications, alerts, and 
  engagement campaigns.
license: Apache-2.0
compatibility: "Requires Knock API key and workflow setup"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: messaging
  tags: ["knock", "notifications", "email", "sms", "push", "workflows"]
---

# Knock Notification Infrastructure

Build scalable multi-channel notification systems with Knock's workflow engine.

## Setup & Authentication

### API Configuration

Get API keys from https://dashboard.knock.app/developers.

```bash
export KNOCK_API_KEY="your_secret_key"
export KNOCK_PUBLIC_KEY="your_public_key"  # For client-side
```

### Server-Side Client

```python
"""knock_server.py — Server-side Knock client."""
from knockapi import Knock
import json, time

class KnockNotifications:
    def __init__(self, api_key: str):
        self.knock = Knock(api_key=api_key)
    
    def identify_user(self, user_id: str, properties: dict):
        """Create or update user profile.
        
        Args:
            user_id: Unique user identifier.
            properties: User profile data.
        """
        return self.knock.users.identify(user_id, properties)
    
    def trigger_workflow(self, workflow_key: str, recipients: list, 
                        data: dict = None, actor: dict = None):
        """Trigger notification workflow.
        
        Args:
            workflow_key: Workflow identifier from Knock dashboard.
            recipients: List of user IDs or recipient objects.
            data: Template variables and data.
            actor: User who triggered the notification.
        
        Returns:
            Workflow run information.
        """
        payload = {
            "workflow": workflow_key,
            "recipients": recipients,
        }
        
        if data:
            payload["data"] = data
        
        if actor:
            payload["actor"] = actor
        
        return self.knock.workflows.trigger(**payload)
    
    def send_to_channel(self, channel_id: str, recipients: list, 
                       content: dict, data: dict = None):
        """Send direct message to specific channel.
        
        Args:
            channel_id: Channel identifier (email, sms, push, etc.).
            recipients: List of recipient user IDs.
            content: Message content for the channel.
            data: Additional template variables.
        """
        return self.knock.notify(
            channel_id=channel_id,
            recipients=recipients,
            content=content,
            data=data or {}
        )
    
    def set_user_preferences(self, user_id: str, preferences: dict):
        """Update user notification preferences.
        
        Args:
            user_id: User ID.
            preferences: Preference settings by workflow/channel.
        """
        return self.knock.users.set_preferences(user_id, preferences)
    
    def get_user_preferences(self, user_id: str):
        """Get user notification preferences.
        
        Args:
            user_id: User ID.
        
        Returns:
            Current preference settings.
        """
        return self.knock.users.get_preferences(user_id)
    
    def track_event(self, user_id: str, event: str, properties: dict = None):
        """Track user event for analytics and targeting.
        
        Args:
            user_id: User ID.
            event: Event name.
            properties: Event metadata.
        """
        return self.knock.track(user_id, event, properties or {})
    
    def cancel_workflow(self, workflow_run_id: str):
        """Cancel a running workflow.
        
        Args:
            workflow_run_id: Workflow run ID from trigger response.
        """
        return self.knock.workflows.cancel(workflow_run_id)
    
    def add_user_to_object(self, object_id: str, user_ids: list):
        """Add users to a notification object (team, project, etc.).
        
        Args:
            object_id: Object identifier.
            user_ids: List of user IDs to add.
        """
        return self.knock.objects.add_subscriptions(object_id, user_ids)
    
    def remove_user_from_object(self, object_id: str, user_ids: list):
        """Remove users from notification object.
        
        Args:
            object_id: Object identifier.
            user_ids: List of user IDs to remove.
        """
        return self.knock.objects.remove_subscriptions(object_id, user_ids)

# Initialize client
knock = KnockNotifications(api_key="your_api_key")

# Example usage
knock.identify_user("user123", {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "phone": "+1234567890",
    "avatar": "https://example.com/avatar.jpg"
})

# Trigger welcome workflow
knock.trigger_workflow("user-welcome", ["user123"], {
    "welcome_bonus": 50,
    "team_name": "Engineering"
})
```

## Common Notification Workflows

### User Onboarding

```python
def setup_onboarding_workflows(user_id: str, user_data: dict):
    """Set up multi-step onboarding notifications.
    
    Args:
        user_id: New user ID.
        user_data: User profile information.
    """
    # Step 1: Immediate welcome
    knock.trigger_workflow("welcome-immediate", [user_id], {
        "user_name": user_data["name"],
        "setup_url": f"https://app.example.com/setup?user={user_id}"
    })
    
    # Step 2: Profile completion reminder (24h delay)
    knock.trigger_workflow("welcome-day-1", [user_id], {
        "completion_percentage": 30,
        "next_steps": ["Add profile photo", "Connect integrations"]
    })
    
    # Step 3: Feature introduction (3 days)
    knock.trigger_workflow("welcome-day-3", [user_id], {
        "feature_highlights": ["Dashboard", "Reports", "Integrations"],
        "tutorial_url": "https://app.example.com/tutorial"
    })
    
    # Step 4: Engagement check (1 week)
    knock.trigger_workflow("welcome-week-1", [user_id], {
        "support_url": "https://app.example.com/support",
        "community_url": "https://community.example.com"
    })

def trigger_milestone_notifications(user_id: str, milestone: str, data: dict):
    """Send milestone achievement notifications.
    
    Args:
        user_id: User who reached milestone.
        milestone: Milestone type.
        data: Milestone data.
    """
    milestones = {
        "first_project": "milestone-first-project",
        "10_projects": "milestone-power-user", 
        "team_invite": "milestone-team-builder",
        "integration_setup": "milestone-integration-master"
    }
    
    if milestone in milestones:
        knock.trigger_workflow(milestones[milestone], [user_id], data)
```

### Team Collaboration

```python
def setup_team_notifications(team_id: str, members: list):
    """Configure team-based notifications.
    
    Args:
        team_id: Team identifier.
        members: List of team member user IDs.
    """
    # Add members to team object
    knock.add_user_to_object(f"team:{team_id}", members)
    
    # Set up team notification preferences
    team_preferences = {
        "workflows": {
            "team-mention": {"channels": {"email": True, "in_app": True}},
            "project-update": {"channels": {"email": True, "slack": True}},
            "deadline-reminder": {"channels": {"email": True, "sms": False}}
        }
    }
    
    for member_id in members:
        knock.set_user_preferences(member_id, team_preferences)

def notify_team_activity(team_id: str, activity_type: str, 
                        actor_id: str, data: dict):
    """Send team activity notifications.
    
    Args:
        team_id: Team ID.
        activity_type: Type of activity.
        actor_id: User who performed action.
        data: Activity details.
    """
    workflows = {
        "mention": "team-mention",
        "comment": "team-comment", 
        "file_shared": "team-file-share",
        "deadline_approaching": "deadline-reminder"
    }
    
    if activity_type in workflows:
        knock.trigger_workflow(
            workflows[activity_type],
            [f"$object:team:{team_id}"],  # All team members
            data,
            actor={"id": actor_id}
        )
```

### Transactional Notifications

```python
def send_transaction_notifications(user_id: str, transaction_type: str, 
                                 transaction_data: dict):
    """Send transaction-based notifications.
    
    Args:
        user_id: User ID.
        transaction_type: Transaction type.
        transaction_data: Transaction details.
    """
    notifications = {
        "payment_received": {
            "workflow": "payment-confirmation",
            "channels": ["email", "in_app"],
            "required_data": ["amount", "payment_method", "invoice_url"]
        },
        "subscription_expiring": {
            "workflow": "subscription-renewal",
            "channels": ["email", "in_app", "sms"],
            "required_data": ["plan_name", "expiry_date", "renewal_url"]
        },
        "security_alert": {
            "workflow": "security-notification",
            "channels": ["email", "sms"],
            "required_data": ["activity", "location", "timestamp"]
        }
    }
    
    if transaction_type in notifications:
        config = notifications[transaction_type]
        
        # Validate required data
        missing_fields = [
            field for field in config["required_data"]
            if field not in transaction_data
        ]
        
        if missing_fields:
            raise ValueError(f"Missing required fields: {missing_fields}")
        
        # Send notification
        knock.trigger_workflow(
            config["workflow"],
            [user_id],
            transaction_data
        )
```

## Client-Side Integration

### React In-App Notifications

```javascript
// KnockInApp.js — React component for in-app notifications
import React, { useEffect, useState } from 'react';
import { KnockProvider, KnockFeedProvider, NotificationIconButton, NotificationFeedPopover } from '@knocklabs/react-notification-feed';

const KnockInAppNotifications = ({ userId, userToken }) => {
    return (
        <KnockProvider 
            apiKey="your_public_key"
            userId={userId}
            userToken={userToken}
        >
            <KnockFeedProvider feedId="in-app-feed">
                <NotificationCenter />
            </KnockFeedProvider>
        </KnockProvider>
    );
};

const NotificationCenter = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="notification-center">
            <NotificationIconButton 
                onClick={() => setIsOpen(!isOpen)}
                className="notification-icon"
            />
            
            <NotificationFeedPopover
                isVisible={isOpen}
                onClose={() => setIsOpen(false)}
                renderItem={CustomNotificationItem}
                onItemClick={(item) => {
                    // Handle notification click
                    handleNotificationClick(item);
                    setIsOpen(false);
                }}
                onMarkAllAsRead={() => {
                    console.log('All notifications marked as read');
                }}
            />
        </div>
    );
};

const CustomNotificationItem = ({ item, ...props }) => {
    const getNotificationIcon = (type) => {
        const icons = {
            'team-mention': '💬',
            'project-update': '📋',
            'deadline-reminder': '⏰',
            'payment-confirmation': '💳',
            'security-alert': '🔒',
            default: '🔔'
        };
        return icons[type] || icons.default;
    };

    return (
        <div className={`notification-item ${item.read_at ? 'read' : 'unread'}`}>
            <div className="notification-icon">
                {getNotificationIcon(item.data.type)}
            </div>
            <div className="notification-content">
                <div className="notification-title">{item.data.title}</div>
                <div className="notification-body">{item.data.body}</div>
                <div className="notification-timestamp">
                    {new Date(item.inserted_at).toLocaleString()}
                </div>
            </div>
            {!item.read_at && <div className="unread-indicator"></div>}
        </div>
    );
};

const handleNotificationClick = (notification) => {
    // Mark as read
    notification.markAsRead();
    
    // Handle different notification types
    switch (notification.data.type) {
        case 'team-mention':
            window.location.href = `/team/${notification.data.team_id}`;
            break;
        case 'project-update':
            window.location.href = `/projects/${notification.data.project_id}`;
            break;
        case 'deadline-reminder':
            window.location.href = `/tasks/${notification.data.task_id}`;
            break;
        default:
            if (notification.data.action_url) {
                window.location.href = notification.data.action_url;
            }
    }
};

export default KnockInAppNotifications;
```

### Preference Management

```javascript
// PreferenceManager.js — User notification preferences
import React, { useEffect, useState } from 'react';
import { useKnockClient } from '@knocklabs/react-notification-feed';

const NotificationPreferences = ({ userId }) => {
    const knock = useKnockClient();
    const [preferences, setPreferences] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPreferences();
    }, [userId]);

    const loadPreferences = async () => {
        try {
            const userPrefs = await knock.preferences.get(userId);
            setPreferences(userPrefs);
        } catch (error) {
            console.error('Failed to load preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const updatePreference = async (workflowKey, channelId, enabled) => {
        try {
            const newPrefs = {
                ...preferences,
                workflows: {
                    ...preferences.workflows,
                    [workflowKey]: {
                        ...preferences.workflows?.[workflowKey],
                        channels: {
                            ...preferences.workflows?.[workflowKey]?.channels,
                            [channelId]: enabled
                        }
                    }
                }
            };

            await knock.preferences.set(userId, newPrefs);
            setPreferences(newPrefs);
        } catch (error) {
            console.error('Failed to update preferences:', error);
        }
    };

    if (loading) return <div>Loading preferences...</div>;

    const workflowConfig = [
        {
            key: 'team-mention',
            name: 'Team Mentions',
            description: 'When someone mentions you in team discussions',
            channels: ['email', 'in_app', 'push']
        },
        {
            key: 'project-update',
            name: 'Project Updates',
            description: 'Updates on projects you\'re following',
            channels: ['email', 'in_app']
        },
        {
            key: 'deadline-reminder',
            name: 'Deadline Reminders',
            description: 'Reminders about upcoming deadlines',
            channels: ['email', 'sms', 'push']
        },
        {
            key: 'security-notification',
            name: 'Security Alerts',
            description: 'Important security-related notifications',
            channels: ['email', 'sms']
        }
    ];

    return (
        <div className="notification-preferences">
            <h2>Notification Preferences</h2>
            
            {workflowConfig.map(workflow => (
                <div key={workflow.key} className="workflow-section">
                    <h3>{workflow.name}</h3>
                    <p>{workflow.description}</p>
                    
                    <div className="channel-toggles">
                        {workflow.channels.map(channel => {
                            const channelLabels = {
                                email: 'Email',
                                sms: 'SMS',
                                push: 'Push',
                                in_app: 'In-App'
                            };

                            const isEnabled = preferences.workflows?.[workflow.key]?.channels?.[channel] ?? true;

                            return (
                                <label key={channel} className="channel-toggle">
                                    <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        onChange={(e) => updatePreference(
                                            workflow.key,
                                            channel,
                                            e.target.checked
                                        )}
                                    />
                                    {channelLabels[channel]}
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NotificationPreferences;
```

## Advanced Workflow Features

### Conditional Logic

```python
"""conditional_workflows.py — Advanced workflow logic."""

def create_smart_reminder_workflow(user_id: str, task_data: dict):
    """Create adaptive reminder based on user behavior.
    
    Args:
        user_id: User ID.
        task_data: Task information.
    """
    # Get user's historical engagement data
    user_profile = knock.users.get(user_id)
    last_login = user_profile.get("last_login_at")
    engagement_score = user_profile.get("engagement_score", 0.5)
    
    # Determine reminder frequency based on engagement
    if engagement_score > 0.8:
        # High engagement - fewer, more targeted reminders
        reminder_schedule = [{"delay": "1d"}, {"delay": "3d"}]
        channels = ["in_app"]
    elif engagement_score > 0.5:
        # Medium engagement - standard reminders
        reminder_schedule = [{"delay": "4h"}, {"delay": "1d"}, {"delay": "3d"}]
        channels = ["email", "in_app"]
    else:
        # Low engagement - more aggressive reminders
        reminder_schedule = [{"delay": "2h"}, {"delay": "6h"}, {"delay": "1d"}, {"delay": "2d"}]
        channels = ["email", "sms", "push"]
    
    # Trigger workflow with dynamic data
    workflow_data = {
        **task_data,
        "reminder_schedule": reminder_schedule,
        "preferred_channels": channels,
        "user_engagement": engagement_score
    }
    
    return knock.trigger_workflow("smart-task-reminder", [user_id], workflow_data)

def send_digest_notification(user_id: str, digest_type: str = "daily"):
    """Send personalized activity digest.
    
    Args:
        user_id: User ID.
        digest_type: 'daily', 'weekly', 'monthly'.
    """
    # Gather user's relevant activities
    activities = gather_user_activities(user_id, digest_type)
    
    if not activities:
        return  # Skip if no relevant activities
    
    # Personalize digest content
    digest_data = {
        "period": digest_type,
        "activity_count": len(activities),
        "top_activities": activities[:5],
        "unread_count": count_unread_items(user_id),
        "recommendations": get_personalized_recommendations(user_id),
        "digest_url": f"https://app.example.com/digest/{digest_type}?user={user_id}"
    }
    
    return knock.trigger_workflow(f"digest-{digest_type}", [user_id], digest_data)

def gather_user_activities(user_id: str, period: str) -> list:
    """Gather relevant activities for user digest."""
    # Implement your activity gathering logic
    return []

def count_unread_items(user_id: str) -> int:
    """Count unread notifications/messages."""
    # Implement your unread counting logic
    return 0

def get_personalized_recommendations(user_id: str) -> list:
    """Generate personalized recommendations."""
    # Implement your recommendation logic
    return []
```

### A/B Testing Notifications

```python
"""notification_ab_testing.py — A/B testing for notifications."""

def send_ab_test_notification(user_id: str, workflow_base: str, 
                             variants: dict, data: dict):
    """Send A/B test notification variants.
    
    Args:
        user_id: User ID.
        workflow_base: Base workflow name.
        variants: Variant configurations.
        data: Shared notification data.
    """
    # Determine user's test group
    user_group = get_test_group(user_id, len(variants))
    variant_name = list(variants.keys())[user_group]
    variant_config = variants[variant_name]
    
    # Add variant tracking data
    enhanced_data = {
        **data,
        "ab_test": {
            "experiment": workflow_base,
            "variant": variant_name,
            "user_group": user_group
        },
        **variant_config.get("data", {})
    }
    
    # Trigger the variant workflow
    workflow_key = f"{workflow_base}-{variant_name}"
    result = knock.trigger_workflow(workflow_key, [user_id], enhanced_data)
    
    # Track the experiment
    track_ab_test_send(user_id, workflow_base, variant_name, result)
    
    return result

def get_test_group(user_id: str, num_variants: int) -> int:
    """Determine user's A/B test group consistently.
    
    Args:
        user_id: User ID.
        num_variants: Number of test variants.
    
    Returns:
        Test group index (0-based).
    """
    import hashlib
    
    # Use hash of user ID for consistent grouping
    hash_value = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
    return hash_value % num_variants

def track_ab_test_send(user_id: str, experiment: str, variant: str, result: dict):
    """Track A/B test notification send event."""
    knock.track_event(user_id, "notification_ab_test", {
        "experiment": experiment,
        "variant": variant,
        "workflow_run_id": result.get("workflow_run_id"),
        "timestamp": time.time()
    })

# Example usage
variants = {
    "subject_a": {
        "data": {"subject_line": "Don't miss out - Complete your profile!"}
    },
    "subject_b": {
        "data": {"subject_line": "Quick task - Finish setting up your account"}
    },
    "subject_c": {
        "data": {"subject_line": "⚡ 2 minutes to complete your profile"}
    }
}

send_ab_test_notification("user123", "onboarding-reminder", variants, {
    "user_name": "Alice",
    "completion_percentage": 60
})
```

## Guidelines

- Design workflows in Knock dashboard with proper branching logic and delays before implementing triggers
- Use user objects and preferences to personalize notification frequency and content 
- Implement proper fallback channels in case primary channels (like email) fail to deliver
- Track notification engagement metrics to optimize content and delivery timing
- Use conditional workflows to avoid notification fatigue and improve relevance
- Set up proper webhook handlers to process delivery status, engagement events, and user feedback
- Implement unsubscribe flows and preference management to comply with email regulations
- Use A/B testing for subject lines, content, and timing to improve engagement rates
- Consider time zone and user activity patterns when scheduling notifications
- Monitor delivery rates and bounce handling across different channels (email, SMS, push)
- Use batch operations when sending notifications to large user groups to optimize API usage
- Implement proper error handling and retry logic for failed notification deliveries