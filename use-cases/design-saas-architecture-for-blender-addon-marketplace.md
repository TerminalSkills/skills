---
title: "Design a SaaS Architecture for a Blender Add-on Marketplace"
slug: design-saas-architecture-for-blender-addon-marketplace
description: "Architect a multi-tenant SaaS platform for distributing Blender add-ons, combining marketplace design patterns with Blender-specific plugin development."
skills:
  - saas-architecture-advisor
  - blender-addon-dev
category: development
tags:
  - saas
  - blender
  - marketplace
  - architecture
---

# Design a SaaS Architecture for a Blender Add-on Marketplace

## The Problem

You want to build a marketplace where Blender artists sell and distribute add-ons. The challenges span two domains that rarely overlap: SaaS platform architecture (multi-tenancy, billing, license management) and Blender add-on development (Python packaging, version compatibility, viewport performance).

The platform must handle license validation from within Blender sessions, distribute version-compatible packages, and provide seller dashboards. The add-ons must follow Blender's packaging conventions and handle installation and license checks without degrading the 3D viewport. A synchronous HTTP call during a license check that freezes Blender for 2 seconds makes the marketplace unusable for artists working on complex scenes.

## The Solution

Use the **saas-architecture-advisor** skill to design the marketplace with proper multi-tenancy, billing, and API architecture. Use the **blender-addon-dev** skill to build the client add-on SDK that handles license validation, auto-updates, and compatibility checks inside Blender.

## Step-by-Step Walkthrough

### 1. Design the multi-tenant marketplace architecture

Define the platform structure for sellers and buyers:

> Design a SaaS architecture for a Blender add-on marketplace. Sellers upload add-ons, set pricing, and view analytics. Buyers purchase and install in Blender. The platform needs: multi-tenant dashboards, Stripe Connect for payouts, license key generation, CDN distribution, and a REST API for the Blender client.

The architecture uses a shared database with seller ID tenant isolation. Stripe Connect handles split payments (85/15). License keys are signed JWTs with buyer ID, add-on ID, and expiration. The CDN serves versioned zips with signed URLs expiring after 24 hours. The API supports version negotiation so Blender 3.6 users do not receive 4.0-only packages.

### 2. Build the Blender client add-on

Create the add-on that runs inside Blender for browsing, installing, and updating:

> Build a "Marketplace Client" add-on for Blender's N-sidebar. It should authenticate via OAuth, browse add-ons with search and filtering, install to the correct addons directory, check updates on startup, and validate licenses in the background without blocking the viewport.

The client uses a background thread for all network operations. License validation runs asynchronously on startup and caches results for 24 hours. Installation handles Blender's directory structure, registers the add-on, and enables it without requiring a restart.

### 3. Implement version compatibility management

Ensure users never install incompatible add-ons:

> Design a system where sellers declare supported Blender versions. The platform validates by checking the add-on's bl_info dictionary. The client only shows compatible versions and warns about unsupported Blender versions.

Sellers upload packages tagged with version ranges. The platform extracts `bl_info` and validates the declared `blender` tuple. The API filters by requesting client's Blender version. When a new Blender version releases, sellers receive notifications listing add-ons needing compatibility testing.

### 4. Add seller analytics and payout dashboards

Build the seller-facing SaaS features:

> Design the seller dashboard with real-time sales analytics, per-add-on metrics, version adoption rates, and Stripe Connect payout history with upcoming estimates.

Version adoption rates show how many users run outdated versions, informing support lifecycle decisions. Payout estimates factor in the 15% fee, pending refunds within the 14-day window, and Stripe's rolling schedule.

### 5. Build the add-on SDK for third-party developers

Create a lightweight SDK that sellers embed in their add-ons for license checking:

> Build a Python SDK that Blender add-on developers import to handle license validation, usage analytics, and update notifications. It must run entirely in background threads, cache license status locally, and degrade gracefully when offline so the add-on remains functional.

The SDK provides three functions: `validate_license()`, `check_for_updates()`, and `report_usage()`. All run asynchronously. When offline, the SDK uses the cached license status (valid for 7 days after last check). This means add-ons keep working during internet outages, but pirated copies stop working within a week.

## Real-World Example

Two developers built the marketplace over 4 months. The SaaS advisor steered them away from per-seller databases -- a pattern that works for 10 sellers but becomes expensive at 200. The Blender skill ensured the client ran all network operations in background threads, critical because early prototypes froze the viewport for 2-3 seconds during license checks.

At launch with 45 add-ons from 12 sellers, the background license validation and version filtering eliminated 90% of support tickets similar marketplaces reported. Users never saw incompatible add-ons or experienced viewport freezes.

Within 6 months, the seller count grew to 40 with 180 add-ons, and the shared-database architecture handled growth without infrastructure changes.
