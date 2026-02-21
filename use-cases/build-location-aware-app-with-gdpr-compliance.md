---
title: "Build a Location-Aware Application with GDPR-Compliant Data Handling"
slug: build-location-aware-app-with-gdpr-compliance
description: "Implement geolocation features with proper consent flows, data minimization, and GDPR-compliant storage to avoid regulatory fines."
skills:
  - maps-geolocation
  - gdpr-compliance
category: development
tags:
  - geolocation
  - gdpr
  - privacy
  - maps
  - compliance
---

# Build a Location-Aware Application with GDPR-Compliant Data Handling

## The Problem

Your application needs to show nearby stores on a map and calculate delivery estimates based on user location. The product team wants to store location history for personalized recommendations. But location data is classified as personal data under GDPR, and precise GPS coordinates can identify a person's home address, workplace, and daily movement patterns.

The previous implementation collected GPS coordinates on every page load, stored them indefinitely in a log table with no consent mechanism, and shared raw coordinates with three analytics services. A GDPR audit flagged four violations: no lawful basis, excessive retention, lack of purpose limitation, and unauthorized third-party sharing. Potential fines total up to 4% of annual revenue.

## The Solution

Use the **maps-geolocation** skill to implement location features with privacy-first architecture, and the **gdpr-compliance** skill to build consent flows, data minimization, retention policies, and right-to-erasure for all location data.

## Step-by-Step Walkthrough

### 1. Audit current location data collection

Map the full scope of existing location data before building anything new:

> Audit the codebase for all location data collection points. Find every navigator.geolocation call, every API endpoint receiving latitude/longitude, every database table storing coordinates, and every third-party service receiving location data. Map the complete data flow.

The audit reveals 7 collection points, 3 database tables storing coordinates, and data flowing to Google Analytics, Mixpanel, and a delivery API. Only 2 of 7 collection points have consent. The user_locations table has 14 months of precise GPS data with no retention policy.

### 2. Implement purpose-specific consent

Build GDPR-compliant consent with granular options:

> Create a consent flow explaining what location data we collect, why (store finder, delivery estimates, recommendations), retention periods, and sharing. Offer granular accept/decline per purpose. Store consent records with timestamps and text version. Make withdrawal easy from account settings.

The flow presents three purposes with plain-language explanations. Each can be accepted independently. Consent records include the text version shown, timestamp, and IP. A settings page lets users change choices at any time with immediate effect.

### 3. Apply data minimization per feature

Reduce precision and retention to the minimum each feature needs:

> Store finder needs city-level only. Delivery estimates need street-level during the session only. Recommendations need neighborhood-level for 30 days max. Implement these three precision levels with automatic deletion per retention period.

The store finder switches to IP-based geolocation -- no GPS prompt, city-level accuracy. Delivery estimates round GPS to 3 decimal places (about 110 meters) and discard after session end. Recommendations use geohash prefixes with a 30-day TTL enforced by a nightly job.

### 4. Build right to erasure

Implement deletion across all systems:

> Create an erasure endpoint that deletes all location data for a user ID across all three tables, removes location analytics from Mixpanel and Google Analytics via their deletion APIs, and returns a confirmation receipt. The erasure log records only that deletion occurred, not the deleted data.

The endpoint cascades through all storage and analytics platforms. The receipt lists affected systems and timestamps. The erasure log avoids the irony of creating a privacy violation in the compliance record.

### 5. Add compliance monitoring

Set up ongoing compliance checks:

> Create a monthly GDPR compliance report covering: consent rates by purpose, data retention compliance (any records past their TTL), erasure request response times, and a list of any new location data collection points added in code since the last report.

The report catches drift before it becomes a violation. New collection points added by developers are flagged for consent integration. Retention violations trigger automatic cleanup rather than accumulating silently.

## Real-World Example

A food delivery startup in Germany launched with GPS tracking on every page, indefinite storage, and no consent. A GDPR audit flagged 4 violations with potential fines of 180,000 EUR.

After implementing consent, minimization, and erasure, the follow-up audit found zero violations. The store finder worked equally well with IP-based location, eliminating the GPS prompt that 38% of users had been declining. Delivery estimates still used GPS but only during checkout, reducing stored records by 94%.

The removal of unnecessary GPS prompts increased store finder usage by 22% because users were no longer blocked by a permission dialog. Storage dropped from 2.3 GB to 47 MB per month.
