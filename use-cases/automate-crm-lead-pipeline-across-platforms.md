---
title: "Automate CRM Lead Pipeline Across Salesforce and Zoho"
slug: automate-crm-lead-pipeline-across-platforms
description: "Build an automated lead qualification and routing pipeline that scores inbound leads, syncs them between Salesforce and Zoho, and triggers follow-up sequences."
skills:
  - salesforce
  - zoho
  - lead-qualification
category: business
tags:
  - crm
  - lead-scoring
  - sales-pipeline
  - automation
---

# Automate CRM Lead Pipeline Across Salesforce and Zoho

## The Problem

A B2B software company receives 300 inbound leads per week from webinars, content downloads, and demo requests. The marketing team captures leads in Zoho CRM, but the enterprise sales team works exclusively in Salesforce. Leads sit in Zoho for days before someone manually copies qualified ones into Salesforce.

By then, competitors have already responded. The sales director estimates they lose 15-20% of high-intent leads to slow handoff. There is no scoring system to distinguish a VP requesting a demo from an intern browsing the blog, so every lead gets the same treatment.

## The Solution

Use the **zoho** skill to pull new leads out of Zoho CRM, the **lead-qualification** skill to score and tier them, and the **salesforce** skill to upsert the qualified ones into Salesforce, assign an owner, and create follow-up tasks. A scheduled run (cron, or any job runner) repeats the loop every hour.

Before the first run, create the custom fields the pipeline writes to. In Zoho (Setup, Modules and Fields, Leads): `Lead_Score` (number) and `Lead_Tier` (text); note their API names. In Salesforce (Object Manager, Lead): `Lead_Score__c` (number), `Lead_Tier__c` (text) and `Zoho_Lead_Id__c` (text, marked **External ID** and unique). Add the picklist values you plan to use to Lead Source and Lead Status. Authenticate both APIs with the OAuth flows in the two skills (Zoho Self Client, Salesforce Connected App with the JWT flow) and keep every secret in environment variables.

## Step-by-Step Walkthrough

### 1. Define lead scoring criteria

A first model that adds up to 100 points, and reflects intent more than company size:

> Score each lead out of 100: demo request as lead source 30, pricing-page visit 15, title at director level or above 20, more than 50 employees 20, target industry (technology, financial services) 15. Tiers: Hot 80 and above, Warm 60-79, Nurture 40-59, Cold below 40. Anything 60 or above is an MQL.

The **lead-qualification** skill scores a table of leads in pandas (CSV or DataFrame) and returns score, tier, reasons and a recommended action, with the weights configurable. Adjust thresholds monthly by comparing scores with which leads actually became opportunities. Only score with data you already hold in the CRM or the signup form; do not send lead names and emails to third-party enrichment tools without a documented basis for sharing them.

### 2. Pull new leads from Zoho

Query the leads that have not been worked yet with COQL (needs the `ZohoCRM.coql.READ` scope; COQL takes absolute timestamps, so compute "seven days ago" in the script, and it returns 200 rows per call by default and at most 2000, so page with `LIMIT offset, count`):

> Run a COQL query against Zoho CRM v8 for leads where `Lead_Status = 'Not Contacted'` and `Created_Time` is after the cutoff, selecting `id`, `First_Name`, `Last_Name`, `Email`, `Phone`, `Company`, `Designation`, `Lead_Source`, `No_of_Employees` and `Industry`. Save the rows to `leads.csv`.

The exact status values come from your org's Lead Status picklist, and the custom field API names come from Setup; check both before the first run.

### 3. Score the leads and write the result back to Zoho

> Score `leads.csv` with the model from step 1. Then update each Zoho lead with `PUT /crm/v8/Leads`, sending `id`, `Lead_Score` and `Lead_Tier`, 100 records per request, with `trigger: []` so the write does not fire your other workflow rules. Read the per-record `status` in the response, because a batch can partly succeed.

Tiers drive different follow-up cadences: Hot and Warm leads go to sales, Nurture leads enter a marketing sequence, Cold leads stay in Zoho.

### 4. Upsert MQLs into Salesforce

Using the external ID field means a lead that is synced twice updates the same Salesforce record instead of creating a duplicate:

> For each lead with `Lead_Score` of 60 or above, call `PATCH /services/data/vNN.0/sobjects/Lead/Zoho_Lead_Id__c/<zoho id>` with `FirstName`, `LastName`, `Company`, `Email`, `Phone`, `Title`, `LeadSource`, `Lead_Score__c`, `Lead_Tier__c` and `OwnerId`. `LastName` and `Company` are required on a Salesforce Lead. Take the API version from the highest entry returned by `GET /services/data/`.

Owners are Salesforce user IDs, not names. Look them up once (`SELECT Id, Username FROM User WHERE IsActive = true`) and keep a territory map in config, for example West leads to one rep, East to another, international to a third, derived from the lead's country or state. The call answers 201 when it creates a lead and 204 when it updates one.

### 5. Create follow-up tasks and campaign membership

> For each lead that was newly created, insert a `Task` with `Subject` "Initial outreach - <Company>", `WhoId` set to the lead's ID, `OwnerId` set to the lead's owner, `ActivityDate` tomorrow and `Priority` High. For Hot leads, set `ActivityDate` to today. Insert a `CampaignMember` with the lead's ID and the ID of your active inbound campaign.

The standard Task Priority values are High, Normal and Low; there is no "Urgent" unless an admin added it, so express urgency with the due date.

### 6. Generate the weekly pipeline summary

> From Zoho, count leads created this week, how many are MQLs, and the average `Lead_Score` per `Lead_Source`, using COQL with `GROUP BY`. From Salesforce, count leads upserted this week and how many were converted, using SOQL. Show the tiers side by side.

The report shows which channels produce high scorers, so marketing can move budget accordingly.

## Real-World Example

A webinar on Tuesday produces 87 new leads in Zoho. By Wednesday morning the hourly job has scored all of them: 23 reach 60 or above and are upserted into Salesforce, 31 are Nurture and 33 are Cold. Each of the 23 has a territory owner and a task due the next day (today, for the Hot ones), so the West Coast rep works her 8 leads before lunch. Before automation, those leads sat in Zoho until Friday, when someone remembered to export a CSV.

After a month, the team compares lead-to-first-touch time and MQL-to-opportunity conversion before and after the change, and re-weights the model from those numbers. The report also shows that webinar leads average well above whitepaper leads, so marketing shifts part of its content budget to live events. Those figures belong to the team; yours will differ, so measure your own baseline before you start.

## Related Skills

- **zoho**: pulls new leads with COQL and writes scores back through the CRM v8 API
- **lead-qualification**: scores and tiers the leads (BANT-style weights you configure)
- **salesforce**: upserts MQLs by external ID, assigns owners, creates tasks and campaign members
