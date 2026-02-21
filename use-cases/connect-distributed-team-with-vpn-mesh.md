---
title: "Connect a Distributed Team with a VPN Mesh Network"
slug: connect-distributed-team-with-vpn-mesh
description: "Build a multi-layer VPN infrastructure using WireGuard for site-to-site links, Tailscale for developer access, and OpenVPN for contractor onboarding."
skills:
  - wireguard
  - tailscale
  - openvpn
category: devops
tags:
  - vpn
  - wireguard
  - tailscale
  - networking
  - remote-access
---

# Connect a Distributed Team with a VPN Mesh Network

## The Problem

A 50-person company has engineers in four countries, three office locations with on-premise servers, and a growing fleet of cloud servers on AWS and Hetzner. Internal services (staging environments, databases, admin panels, CI runners) are exposed to the internet with IP allowlists that break whenever someone changes networks. Contractors need temporary access to specific services without full network access. The current setup is a single OpenVPN server that routes all traffic through one datacenter, adding 120ms latency for the Asia-Pacific team.

## The Solution

Using the **wireguard** skill to establish fast site-to-site tunnels between office locations and cloud regions, the **tailscale** skill to give developers zero-config mesh access to internal services with identity-based ACLs, and the **openvpn** skill to provide contractors with scoped, time-limited access through a traditional VPN gateway.

## Step-by-Step Walkthrough

### 1. Set up WireGuard site-to-site tunnels

Create point-to-point WireGuard tunnels between offices and cloud regions.

> Set up WireGuard site-to-site tunnels connecting our three locations: New York office (10.1.0.0/16), Berlin office (10.2.0.0/16), and AWS us-east-1 (10.3.0.0/16). Each tunnel should use dedicated WireGuard interfaces with persistent keepalives. Configure routing so each site can reach the other two subnets. Use pre-shared keys for post-quantum protection.

The three WireGuard tunnels form a full mesh between sites. Traffic between Berlin and AWS goes direct instead of routing through New York. Each tunnel operates at near-wire speed with 1-2ms overhead. The kernel-level implementation means the site-to-site links handle 1 Gbps without breaking a sweat.

### 2. Deploy Tailscale for developer mesh access

Give every developer direct mesh access to internal services.

> Deploy Tailscale across our 50-person engineering team. Set up ACL policies so backend engineers can reach all staging databases and CI runners, frontend engineers can reach staging web servers only, and managers can reach the admin panel but nothing else. Enable MagicDNS so developers access services by name (staging-db.tailnet) instead of IP address. Advertise the WireGuard subnet routes through Tailscale exit nodes.

Tailscale creates direct peer-to-peer connections between developer laptops and internal services. The Asia-Pacific team's latency drops from 120ms (routing through a central VPN server) to 22ms (direct WireGuard connection to the nearest exit node). ACL policies enforce least-privilege access based on identity -- no more shared VPN credentials.

### 3. Configure OpenVPN for contractor access

Set up a separate OpenVPN gateway for time-limited contractor access.

> Set up an OpenVPN server for contractor access, separate from the Tailscale network. Contractors should only reach the staging API server (10.3.1.50) and the documentation wiki (10.1.0.30). Generate client certificates with 90-day expiration. Include a provisioning script that creates a contractor profile and a revocation script that kills access immediately.

Contractors get OpenVPN profiles with split tunneling that routes only the two allowed IP addresses through the VPN. They cannot reach production databases, CI runners, or any other internal service. When a contract ends, the revocation script invalidates the certificate and disconnects the active session within seconds.

### 4. Add network monitoring and access logging

Track all VPN connections and detect anomalies.

> Set up monitoring for the entire VPN infrastructure. Track WireGuard tunnel status and bandwidth between sites, Tailscale node connectivity and last-seen timestamps, and OpenVPN active sessions with data transfer. Alert when a site-to-site tunnel goes down, when a Tailscale node hasn't connected in 7 days (stale device), or when a contractor transfers more than 1 GB in a single session.

The monitoring dashboard shows all three VPN layers in one view. The stale device alert catches a former employee's laptop that was never deprovisioned from Tailscale -- a common oversight that the automated check now prevents. WireGuard tunnel health checks catch a network change at the Berlin office before it impacts cross-site service communication.

## Real-World Example

Maya manages infrastructure for a 50-person company across four countries. She replaces the single OpenVPN server bottleneck with a three-tier VPN architecture. WireGuard tunnels connect the three sites with 1ms overhead. Tailscale gives developers direct mesh access with identity-based ACLs, dropping the Asia-Pacific team's latency from 120ms to 22ms. Contractors get scoped OpenVPN access that expires automatically. When an engineer leaves the company, Tailscale device removal takes one click instead of rotating shared VPN credentials across the entire team.
