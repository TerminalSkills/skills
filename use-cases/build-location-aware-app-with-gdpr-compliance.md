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

Your application needs to show nearby stores on a map and calculate delivery estimates based on user location. The product team wants to store location history for personalized recommendations. But location data is named in the GDPR's definition of personal data (Article 4(1)), and precise GPS coordinates can reveal a person's home address, workplace and daily movement patterns.

The previous implementation collected GPS coordinates on every page load, stored them indefinitely in a log table with no consent mechanism, and shared raw coordinates with three analytics services. An internal review found four problems, each tied to a GDPR principle: no lawful basis (Article 6), excessive retention (Article 5(1)(e), storage limitation), no purpose limitation (Article 5(1)(b)), and uncontrolled sharing with third parties. Infringements of Articles 5, 6 and 7 fall in the higher fine tier of Article 83(5): up to 20 million EUR or 4% of worldwide annual turnover, whichever is higher.

This page is engineering guidance, not legal advice. Have a lawyer confirm the lawful basis for each purpose in your jurisdiction.

## The Solution

Use the **maps-geolocation** skill to build the store finder and delivery estimate with the least location data each needs, and the **gdpr-compliance** skill to audit current collection, build consent records, enforce retention and handle erasure requests.

Official texts used below: Regulation (EU) 2016/679 on EUR-Lex (`https://eur-lex.europa.eu/eli/reg/2016/679/oj`).

## Step-by-Step Walkthrough

### 1. Audit current location data collection

Map the full scope of existing location data before building anything new. The gdpr-compliance skill flags `lat`, `lng` and `geo_*` columns and IP addresses as indirect identifiers and produces a data flow inventory (data type, storage, shared with, legal basis, retention).

> Audit the codebase for all location data collection points. Find every `navigator.geolocation` call, every API endpoint receiving latitude/longitude, every database column storing coordinates, and every third-party service receiving location data (analytics, maps, delivery APIs). Output the data flow inventory as a markdown table.

Typical findings, which are what this team's audit found and not a benchmark: several collection points with consent on only a few, coordinates in more than one table with no retention rule, and raw coordinates forwarded to analytics tools.

### 2. Implement purpose-specific consent

Consent is one lawful basis among several (Article 6(1)), and where you rely on it, it must be given for specific purposes (Article 6(1)(a)) and you must be able to demonstrate it (Article 7(1)). The browser's own permission prompt does not record which purpose a user agreed to, so show your own explanation first and call `navigator.geolocation` only after the user accepts.

> Create a consent flow explaining what location data we collect, why (store finder, recommendations), retention periods, and who receives it. Offer a separate opt-in per purpose, with nothing pre-ticked. Store consent records (purpose, accepted or declined, text version, timestamp) in the database, not only in a cookie, and store at most a hash of the IP address. Make withdrawal as easy as giving consent from account settings, with immediate effect.

Article 7(3) requires that it be "as easy to withdraw as to give consent". Delivery estimates need no consent flow of their own when the customer types a delivery address to place an order; that processing rests on the contract (Article 6(1)(b)), and the address is still subject to minimization and retention below.

### 3. Apply data minimization per feature

Use the least precision and the shortest retention each feature needs (Article 5(1)(c) and (e)).

> Store finder: let the user type a city or postcode and geocode it on our server; offer "use my location" only behind the consent from step 2, and send coordinates rounded to 2 decimals (about 1 km) to the nearest-store query, which uses PostGIS `ST_DWithin`. Do not write the query coordinates to any table or log. Delivery estimates: use the typed delivery address and keep it only with the order. Recommendations (consent required): store a 6-character geohash (a cell of roughly 1.2 km by 0.6 km) instead of coordinates, with a 30-day TTL enforced by a nightly job that first runs in dry-run mode.

Notes from the maps-geolocation skill that matter here: the public Nominatim server forbids type-ahead and requires an identifying User-Agent, a limit of one request per second and cached results, and anything you send to a third-party geocoder is shared personal data, so list it in the inventory or self-host the geocoder. The same applies to IP-based lookups: an IP address is an online identifier (Recital 30), so resolve it against a local GeoIP database rather than passing it to an outside service. Render maps with Leaflet and a tile provider whose terms fit production traffic.

### 4. Build right to erasure

Article 17(1) gives users the right to have personal data erased without undue delay when, for example, they withdraw consent and no other basis applies. Article 12(3) requires you to act on the request within one month of receipt (extendable by two months only with notice).

> Create an erasure endpoint that deletes all location data for a user ID across every table, cache and backup-restore list, and calls the deletion APIs of the analytics tools that hold it: Google Analytics 4 `properties.submitUserDeletion` in the Analytics Admin API (v1alpha) and the Mixpanel GDPR API. Return a receipt listing the systems and timestamps. The erasure log records that a deletion happened and when, never the deleted data.

The best way to make that cascade short is not to send coordinates to analytics tools in the first place. Keep the erasure log (request id, status, timestamps) as proof of when each request was handled.

### 5. Add compliance monitoring

> Create a monthly report covering: consent rates by purpose, records past their TTL, erasure requests with time to completion, and new location collection points added in code since the last report (search for `navigator.geolocation` and for latitude/longitude fields in new migrations).

Drift shows up as a flagged collection point or an overdue record instead of a surprise during the next review.

## Real-World Example

A food-delivery startup in Germany used to prompt for GPS on every page and keep the coordinates forever. After the rebuild, the store finder works from a typed city or postcode, so most visitors never see a permission prompt; the "use my location" button appears only after a purpose-specific consent. Delivery estimates use the address typed at checkout. Recommendations keep only a geohash for 30 days. Raw coordinates no longer reach the analytics tools, so an erasure request touches the order database and the recommendation store instead of three vendors. (Any usage and storage numbers from such a change come from the team's own analytics.)

## Related Skills

- **maps-geolocation** -- builds the store finder, geocoding and PostGIS nearest-store query with only the precision each feature needs
- **gdpr-compliance** -- audits location data flows, records consent, enforces retention and implements the erasure endpoint
