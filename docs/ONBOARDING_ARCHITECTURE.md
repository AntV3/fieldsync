# FieldSync Company Onboarding & Subscription Architecture

**Document Type:** Principal Architecture Specification
**Version:** 1.0
**Date:** December 2024
**Status:** Design Phase

---

## Executive Summary

This document defines the architecture for FieldSync's company onboarding and subscription system. The design addresses scalability from 10 to 10,000+ companies while maintaining strict tenant isolation, supporting future billing integrations, and providing a frictionless user experience.

**Core Principle:** Company onboarding is infrastructure, not a feature. It must be explicit, recoverable, and observable.

---

## Table of Contents

0. [Onboarding Experience Design](#0-onboarding-experience-design) *(UX & Cross-Platform)*
1. [Current State Analysis](#1-current-state-analysis)
2. [Entry Point Architecture](#2-entry-point-architecture)
3. [Company Creation Flow](#3-company-creation-flow)
4. [Subscription & Tier Model](#4-subscription--tier-model)
5. [Admin & Access Bootstrapping](#5-admin--access-bootstrapping)
6. [Joining Existing Companies](#6-joining-existing-companies)
7. [Data Model Extensions](#7-data-model-extensions)
8. [Risk & Edge Case Analysis](#8-risk--edge-case-analysis)
9. [Admin Billing Portal](#9-admin-billing-portal)
10. [Payment Processing & Stripe Integration](#10-payment-processing--stripe-integration)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 0. Onboarding Experience Design

### Design Philosophy

```
┌─────────────────────────────────────────────────────────────────┐
│                   ONBOARDING PRINCIPLES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SHOW, DON'T TELL                                             │
│     • Interactive demo before signup                            │
│     • See real screens, not marketing fluff                     │
│     • "Try it now" beats "Learn more"                           │
│                                                                  │
│  2. PROGRESSIVE DISCLOSURE                                       │
│     • Start simple: "What do you want to do?"                   │
│     • Add complexity only when needed                           │
│     • Never show 10 options when 3 will do                      │
│                                                                  │
│  3. ZERO FRICTION START                                          │
│     • See value before creating account                         │
│     • No credit card required for trial                         │
│     • Under 60 seconds to first "aha" moment                    │
│                                                                  │
│  4. CONTEXT-AWARE                                                │
│     • Foreman on phone → simplified flow                        │
│     • Office on desktop → full dashboard                        │
│     • New company → guided setup                                │
│     • Returning user → straight to work                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Current vs Proposed Entry Screen

```
┌─────────────────────────────────────────────────────────────────┐
│                   CURRENT ENTRY SCREEN                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        ┌─────────────┐                          │
│                        │  FieldSync  │                          │
│                        └─────────────┘                          │
│                                                                  │
│              ┌──────────┐      ┌──────────┐                     │
│              │  Field   │      │  Office  │                     │
│              └──────────┘      └──────────┘                     │
│                                                                  │
│   Problem: No path for new companies                            │
│   Problem: No way to understand the product first               │
│   Problem: "Field" vs "Office" unclear to new users             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PROPOSED ENTRY SCREEN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │              ┌─────────────────────┐                     │   │
│   │              │     FieldSync       │                     │   │
│   │              │  ────────────────── │                     │   │
│   │              │  Construction       │                     │
│   │              │  Documentation      │                     │   │
│   │              │  Made Simple        │                     │   │
│   │              └─────────────────────┘                     │   │
│   │                                                          │   │
│   │   ┌────────────────────────────────────────────────┐    │   │
│   │   │                                                 │    │   │
│   │   │    👷 I'm a Field Worker                       │    │   │
│   │   │       Enter time, materials, photos            │    │   │
│   │   │                                                 │    │   │
│   │   └────────────────────────────────────────────────┘    │   │
│   │                                                          │   │
│   │   ┌────────────────────────────────────────────────┐    │   │
│   │   │                                                 │    │   │
│   │   │    🏢 I'm Office Staff                         │    │   │
│   │   │       Review tickets, manage projects          │    │   │
│   │   │                                                 │    │   │
│   │   └────────────────────────────────────────────────┘    │   │
│   │                                                          │   │
│   │   ┌────────────────────────────────────────────────┐    │   │
│   │   │                                                 │    │   │
│   │   │    🚀 Start a Free Trial                       │    │   │
│   │   │       Set up your company in 2 minutes         │    │   │
│   │   │                                                 │    │   │
│   │   └────────────────────────────────────────────────┘    │   │
│   │                                                          │   │
│   │   ─────────────────────────────────────────────────     │   │
│   │                                                          │   │
│   │         [▶ Watch Demo]     [See How It Works]           │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Interactive Demo Experience

```
┌─────────────────────────────────────────────────────────────────┐
│                   DEMO / PRODUCT TOUR                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Interactive Sandbox (Recommended)                     │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  User clicks "See How It Works" →                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │   Welcome to FieldSync                                    │   │
│  │   ─────────────────────                                   │   │
│  │                                                           │   │
│  │   You're viewing a demo project with sample data.         │   │
│  │   Click around freely - nothing you do here is saved.     │   │
│  │                                                           │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │ Demo: Sunrise Office Tower                       │    │   │
│  │   │ Sample T&M tickets, CORs, and photos            │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │                                                           │   │
│  │   [Try the Office View]    [Try the Foreman View]        │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Benefits:                                                       │
│  • No signup required                                           │
│  • Pre-populated with realistic data                            │
│  • User sees REAL interface, not screenshots                    │
│  • Guided tooltips highlight key features                       │
│  • "Ready to start? [Create Your Company]" always visible       │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Option B: Video Walkthrough                                     │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  2-3 minute video showing:                                       │
│  • Foreman entering a T&M ticket on phone                       │
│  • Office reviewing and approving                               │
│  • Creating a COR with backup documentation                     │
│  • Exporting reports for clients                                │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Option C: Guided Tour (Tooltips)                                │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  After signup, first-time users see:                            │
│                                                                  │
│  Step 1/5: "This is your Projects list..."     [Next] [Skip]   │
│  Step 2/5: "Click here to create a T&M..."     [Next] [Skip]   │
│  etc.                                                           │
│                                                                  │
│  Recommendation: Combine A + C                                   │
│  • Interactive demo BEFORE signup (no commitment)               │
│  • Guided tour AFTER signup (with their real data)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### "Start Free Trial" Flow (New Company)

```
┌─────────────────────────────────────────────────────────────────┐
│                   NEW COMPANY ONBOARDING                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 1 of 3                              ● ○ ○          │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                           │   │
│  │  What's your company name?                                │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Acme Construction                                    │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │                                         [Continue →]     │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 2 of 3                              ● ● ○          │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                           │   │
│  │  Create your admin account                                │   │
│  │                                                           │   │
│  │  Your name                                                │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ John Smith                                           │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │  Email                                                    │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ john@acmeconstruction.com                            │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │  Password                                                 │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ ••••••••••••                                         │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │                           [← Back]    [Create Account →] │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 3 of 3 - You're In!                 ● ● ●          │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                           │   │
│  │  ┌───────────────────────────────────────────────────┐   │   │
│  │  │                                                    │   │   │
│  │  │   ✓  Acme Construction is ready!                  │   │   │
│  │  │                                                    │   │   │
│  │  │   Your 14-day free trial has started.             │   │   │
│  │  │   No credit card required.                        │   │   │
│  │  │                                                    │   │   │
│  │  │   ─────────────────────────────────────────────   │   │   │
│  │  │                                                    │   │   │
│  │  │   Share these codes with your team:               │   │   │
│  │  │                                                    │   │   │
│  │  │   Company Code:  A1B2C3  (for joining)            │   │   │
│  │  │   Office Code:   X7Y8Z9  (keep secret)            │   │   │
│  │  │                                                    │   │   │
│  │  │   [Copy Codes]                                    │   │   │
│  │  │                                                    │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  │                                                           │   │
│  │  What would you like to do first?                        │   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐               │   │
│  │  │ Create First    │  │ Invite Team     │               │   │
│  │  │ Project         │  │ Members         │               │   │
│  │  └─────────────────┘  └─────────────────┘               │   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐               │   │
│  │  │ Take a Quick    │  │ Go to           │               │   │
│  │  │ Tour            │  │ Dashboard       │               │   │
│  │  └─────────────────┘  └─────────────────┘               │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Total time: ~60 seconds                                         │
│  Total fields: 4 (company name, name, email, password)          │
│  Credit card: Not required                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cross-Platform Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   WEB → DESKTOP → MOBILE TRANSITION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CURRENT: Web App Only                                                       │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  • Single entry point: app.fieldsync.com                                    │
│  • Responsive design (works on mobile browsers)                             │
│  • PWA capability (can "install" to home screen)                            │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  FUTURE: Desktop App (Electron or Tauri)                                     │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  Download from: fieldsync.com/download                                       │
│                                                                              │
│  First Launch Experience:                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │   ┌─────────────────────────────────────────────────────────────┐    │   │
│  │   │                                                              │    │   │
│  │   │                      FieldSync                               │    │   │
│  │   │                                                              │    │   │
│  │   │   ┌────────────────────────────────────────────────────┐    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   │    [  Sign In  ]                                   │    │    │   │
│  │   │   │    Already have an account                          │    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   └────────────────────────────────────────────────────┘    │    │   │
│  │   │                                                              │    │   │
│  │   │   ┌────────────────────────────────────────────────────┐    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   │    [  Start Free Trial  ]                          │    │    │   │
│  │   │   │    Set up a new company                             │    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   └────────────────────────────────────────────────────┘    │    │   │
│  │   │                                                              │    │   │
│  │   │   ┌────────────────────────────────────────────────────┐    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   │    [  Join My Company  ]                           │    │    │   │
│  │   │   │    I have a company code                            │    │    │   │
│  │   │   │                                                     │    │    │   │
│  │   │   └────────────────────────────────────────────────────┘    │    │   │
│  │   │                                                              │    │   │
│  │   │               ───────────────────────────                   │    │   │
│  │   │                                                              │    │   │
│  │   │                    [▶ See Demo]                             │    │   │
│  │   │                                                              │    │   │
│  │   └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  After Sign In (returning user):                                             │
│  • Remember last company                                                    │
│  • Skip entry screen, go straight to dashboard                              │
│  • Company switcher in sidebar                                              │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  FUTURE: Mobile Apps (iOS / Android)                                         │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  Status: PARKED — not published. Mobile path today is the installed PWA.    │
│                                                                              │
│  Key Difference: Mobile has TWO distinct user types                         │
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐         │
│  │  FOREMAN APP (Simplified)   │    │  OFFICE APP (Full)          │         │
│  ├─────────────────────────────┤    ├─────────────────────────────┤         │
│  │                             │    │                             │         │
│  │  • T&M ticket entry         │    │  • Full dashboard           │         │
│  │  • Photo capture            │    │  • Review/approve tickets   │         │
│  │  • Offline support          │    │  • Team management          │         │
│  │  • PIN-based login          │    │  • Reports                  │         │
│  │                             │    │  • Billing (admin)          │         │
│  │  First launch:              │    │                             │         │
│  │  "Enter company code"       │    │  First launch:              │         │
│  │                             │    │  Same as desktop app        │         │
│  └─────────────────────────────┘    └─────────────────────────────┘         │
│                                                                              │
│  Option A: Single app, mode selector at launch                              │
│  Option B: Two separate apps (FieldSync Field, FieldSync Office)            │
│                                                                              │
│  Recommendation: Single app with mode detection                             │
│  • If user logs in with email → Office mode                                 │
│  • If user enters company code + PIN → Foreman mode                         │
│  • Can switch modes in settings                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Where Does "New Company" Live?

```
┌─────────────────────────────────────────────────────────────────┐
│                   NEW COMPANY ENTRY POINTS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Entry Point 1: Initial App Launch (Primary)                    │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  When user is NOT logged in:                                     │
│  • "Start Free Trial" is prominently displayed                  │
│  • Equal visual weight with "Sign In"                           │
│  • This is where most new companies will come from              │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Entry Point 2: Company Switcher (Secondary)                     │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  When user IS logged in and belongs to 1+ companies:            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Switch Company                                           │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                           │   │
│  │  ✓ Acme Construction     (current)                       │   │
│  │    Miller Builders                                        │   │
│  │    GGG Contractors                                        │   │
│  │                                                           │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                           │   │
│  │  + Create New Company                                    │   │
│  │  + Join Another Company                                  │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  This allows existing users to:                                  │
│  • Start a new company (maybe their own side business)          │
│  • Join another company (consultant working for multiple)       │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Entry Point 3: Marketing Website (External)                     │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  fieldsync.com (marketing site) has prominent CTA:              │
│  [Start Free Trial] → opens app with company creation flow     │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Entry Point 4: Referral / Invite Link (Future)                  │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  fieldsync.com/invite/abc123                                    │
│  • Pre-fills company to join                                    │
│  • "John from Acme invited you"                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Guided First-Run Experience

```
┌─────────────────────────────────────────────────────────────────┐
│                   FIRST-RUN GUIDED SETUP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  After company creation, new admin sees:                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │   🎉 Welcome to FieldSync, John!                         │   │
│  │                                                           │   │
│  │   Let's get Acme Construction set up.                    │   │
│  │   This takes about 5 minutes.                            │   │
│  │                                                           │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │  ✓  Company created                             │    │   │
│  │   │  ○  Create your first project                   │    │   │
│  │   │  ○  Add team members (optional)                 │    │   │
│  │   │  ○  Customize materials list (optional)         │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │                                                           │   │
│  │   [Let's Go]                    [Skip Setup]             │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Step: Create First Project                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │   Create Your First Project                               │   │
│  │   ─────────────────────────────                          │   │
│  │                                                           │   │
│  │   Project Name                                            │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │ Sunrise Office Tower                             │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │                                                           │   │
│  │   Contract Value (optional)                               │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │ $                                                │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │                                                           │   │
│  │   A 4-digit PIN will be generated for field workers      │   │
│  │   to access this project.                                │   │
│  │                                                           │   │
│  │                              [Create Project]            │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Step: Add Team (Optional)                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │   Invite Your Team                                        │   │
│  │   ─────────────────                                      │   │
│  │                                                           │   │
│  │   Share these codes with your team:                      │   │
│  │                                                           │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │  Company Code: A1B2C3                            │    │   │
│  │   │  Office Code: X7Y8Z9 (keep private)              │    │   │
│  │   │                                                   │    │   │
│  │   │  [Copy]  [Share via Email]  [Print]              │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │                                                           │   │
│  │   Or invite specific people:                             │   │
│  │   ┌─────────────────────────────────────────────────┐    │   │
│  │   │ mike@acme.com, sarah@acme.com                    │    │   │
│  │   └─────────────────────────────────────────────────┘    │   │
│  │   [Send Invites]                                         │   │
│  │                                                           │   │
│  │                    [Skip for Now]    [Continue]          │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Completion:                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │   ✓ You're All Set!                                      │   │
│  │                                                           │   │
│  │   Acme Construction is ready to use.                     │   │
│  │                                                           │   │
│  │   Quick tips:                                             │   │
│  │   • Share the Project PIN with your foreman              │   │
│  │   • T&M tickets will appear here for review              │   │
│  │   • Create CORs to bundle tickets for billing            │   │
│  │                                                           │   │
│  │   [Go to Dashboard]           [Watch Tutorial]           │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Contextual Help & Documentation

```
┌─────────────────────────────────────────────────────────────────┐
│                   IN-APP HELP SYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Help Access Points:                                             │
│                                                                  │
│  1. Persistent Help Button (bottom-right)                       │
│     ┌───┐                                                       │
│     │ ? │  → Opens help panel                                   │
│     └───┘                                                       │
│                                                                  │
│  2. Contextual Tooltips (on hover/tap)                          │
│     [Create COR] ⓘ  → "Bundle T&M tickets for client billing"  │
│                                                                  │
│  3. Empty State Guidance                                         │
│     When no tickets exist:                                       │
│     ┌──────────────────────────────────────────────────────┐    │
│     │  No T&M tickets yet                                   │    │
│     │                                                        │    │
│     │  T&M tickets are created by field workers using      │    │
│     │  the project PIN. Share the PIN to get started.      │    │
│     │                                                        │    │
│     │  [View Project PIN]    [Learn More]                  │    │
│     └──────────────────────────────────────────────────────┘    │
│                                                                  │
│  4. Help Panel Content                                           │
│     ┌──────────────────────────────────────────────────────┐    │
│     │  Help                                          [X]    │    │
│     │  ────────────────────────────────────────────────    │    │
│     │                                                        │    │
│     │  📚 Getting Started Guide                             │    │
│     │  📖 How T&M Tickets Work                              │    │
│     │  📖 Creating Change Orders (CORs)                     │    │
│     │  📖 Managing Your Team                                │    │
│     │  📖 Billing & Subscription                            │    │
│     │                                                        │    │
│     │  ────────────────────────────────────────────────    │    │
│     │                                                        │    │
│     │  🎬 Video Tutorials                                   │    │
│     │  💬 Contact Support                                   │    │
│     │                                                        │    │
│     └──────────────────────────────────────────────────────┘    │
│                                                                  │
│  5. Keyboard Shortcut (Desktop)                                  │
│     Press ? to open help                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Summary: Entry Screen Across Platforms

```
┌─────────────────────────────────────────────────────────────────┐
│                   UNIFIED ENTRY EXPERIENCE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  The entry screen should be CONSISTENT across all platforms:    │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │                       FieldSync                            │  │
│  │              Construction Documentation                    │  │
│  │                     Made Simple                            │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │  👷  I'm a Field Worker                            │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │  🏢  I'm Office Staff                              │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │  🚀  Start Free Trial                              │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │           [▶ Demo]              [How It Works]            │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Platform Variations:                                            │
│                                                                  │
│  Web:     Exactly as above                                      │
│  Desktop: Same, but app remembers last login                    │
│  Mobile:  Same, but touch-optimized (larger buttons)            │
│                                                                  │
│  Key Principles:                                                 │
│  ✓ Same visual language everywhere                              │
│  ✓ Demo available on all platforms                              │
│  ✓ "Start Free Trial" always visible for new companies         │
│  ✓ Returning users can sign in and skip                        │
│  ✓ Field workers have their own simplified path                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Current State Analysis

### What Exists

| Component | Status | Quality |
|-----------|--------|---------|
| Multi-tenant isolation (RLS) | Complete | Strong |
| Membership states (pending/active/removed) | Complete | Strong |
| Admin approval workflow | Complete | Strong |
| Office code verification | Complete | Strong |
| Multi-company user support | Complete | Adequate |
| Company creation flow | Missing | - |
| Subscription management | Stub only | Weak |
| Self-service onboarding | Missing | - |

### Current User Paths

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT: AppEntry.jsx                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────┐          │
│   │ Foreman  │    │  Office  │    │  Join Company    │          │
│   │  (PIN)   │    │ (Login)  │    │ (Code + Signup)  │          │
│   └────┬─────┘    └────┬─────┘    └────────┬─────────┘          │
│        │               │                    │                    │
│        ▼               ▼                    ▼                    │
│   Project View    Dashboard           Pending State              │
│                                       (await approval)           │
│                                                                  │
│   ⚠️  NO PATH FOR: "Create New Company"                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Gap

There is no self-service path for company founders to:
1. Create a new company
2. Select a subscription tier
3. Bootstrap themselves as administrator
4. Begin using the platform

---

## 2. Entry Point Architecture

### Decision: Hybrid Approach (Recommended)

After evaluating dedicated vs embedded onboarding, I recommend a **hybrid approach** that uses a unified entry point with progressive branching.

#### Option Analysis

| Approach | Pros | Cons |
|----------|------|------|
| **Dedicated onboarding site** | Clean separation, can be marketing-focused | Fragmented experience, requires redirect, duplicate auth |
| **Embedded in main app** | Single codebase, consistent UX | More complex routing, harder to A/B test |
| **Hybrid (unified entry)** | Best of both: single entry, progressive branching | Slightly more initial routing logic |

#### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROPOSED: Unified Entry                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌───────────────────┐                         │
│                    │   AppEntry.jsx    │                         │
│                    │   (Enhanced)      │                         │
│                    └─────────┬─────────┘                         │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐              │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│   ┌──────────┐        ┌──────────┐        ┌──────────────┐      │
│   │ Foreman  │        │  Office  │        │ Get Started  │      │
│   │  Access  │        │  Login   │        │              │      │
│   └──────────┘        └──────────┘        └──────┬───────┘      │
│                                                  │               │
│                              ┌───────────────────┼───────────┐   │
│                              │                   │           │   │
│                              ▼                   ▼           ▼   │
│                       ┌───────────┐      ┌────────────┐  ┌─────┐ │
│                       │  Create   │      │    Join    │  │Demo │ │
│                       │  Company  │      │  Company   │  │Tour │ │
│                       └───────────┘      └────────────┘  └─────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Entry Point Decision Tree

```javascript
// Route determination logic
function determineUserPath(user, memberships) {
  if (!user) {
    return 'ENTRY_SCREEN' // Show Foreman | Office | Get Started
  }

  const active = memberships.filter(m => m.status === 'active')
  const pending = memberships.filter(m => m.status === 'pending')

  if (active.length > 0) {
    return 'DASHBOARD' // Has active companies → main app
  }

  if (pending.length > 0) {
    return 'PENDING_SCREEN' // Awaiting approval
  }

  // Authenticated but no memberships
  return 'COMPANY_SELECTOR' // Create or Join
}
```

#### Mobile + Desktop Considerations

| Factor | Mobile | Desktop |
|--------|--------|---------|
| Touch targets | 48px minimum | 36px acceptable |
| Form length | Minimize steps, use modals | Can show more fields |
| Company creation | Wizard with progress | Single-page form viable |
| Typing burden | Minimize, use presets | Full forms acceptable |

**Recommendation:** Single responsive flow, not separate mobile/desktop paths.

---

## 3. Company Creation Flow

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  COMPANY CREATION WORKFLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Identity                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Name                                                    │   │
│  │ • Email                                                   │   │
│  │ • Password                                                │   │
│  │                                                           │   │
│  │ [Continue] ───────────────────────────────────────────────┼──►│
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  STEP 2: Company Details                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Company Name                                            │   │
│  │ • Industry (optional, for templates)                      │   │
│  │                                                           │   │
│  │ [Create Company] ─────────────────────────────────────────┼──►│
│  └──────────────────────────────────────────────────────────┘   │
│       │                                                          │
│       │ ┌────────────────────────────────────────────┐          │
│       └►│ ATOMIC TRANSACTION:                        │          │
│         │ 1. Create auth user (if new)               │          │
│         │ 2. Create company (status: 'provisioning') │          │
│         │ 3. Create users record                     │          │
│         │ 4. Create subscription (tier: 'trial')     │          │
│         │ 5. Create membership (admin, active)       │          │
│         │ 6. Generate company_code + office_code     │          │
│         │ 7. Update company (status: 'active')       │          │
│         └────────────────────────────────────────────┘          │
│                                                                  │
│  STEP 3: Plan Selection (Deferred)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ "You're on the Free Trial - 14 days"                      │   │
│  │                                                           │   │
│  │ [View Plans] (optional)    [Start Using FieldSync]        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  STEP 4: First Project (Optional Quick-Start)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ "Create your first project?"                              │   │
│  │                                                           │   │
│  │ [Create Project]         [Skip for Now]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Company Lifecycle States

```
┌─────────────────────────────────────────────────────────────────┐
│                   COMPANY LIFECYCLE STATES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐                                               │
│   │ provisioning │ ◄── Company created, setup in progress        │
│   └──────┬───────┘                                               │
│          │                                                       │
│          │ (all setup steps complete)                            │
│          ▼                                                       │
│   ┌──────────────┐                                               │
│   │    active    │ ◄── Normal operational state                  │
│   └──────┬───────┘                                               │
│          │                                                       │
│          ├─────────────────────┐                                 │
│          │                     │                                 │
│          │ (billing failed)    │ (admin archived)                │
│          ▼                     ▼                                 │
│   ┌──────────────┐      ┌──────────────┐                        │
│   │  suspended   │      │   archived   │                        │
│   └──────┬───────┘      └──────────────┘                        │
│          │                     ▲                                 │
│          │ (payment resolved)  │ (90 days suspended)             │
│          └─────────────────────┘                                 │
│                                                                  │
│   State Behaviors:                                               │
│   ┌────────────────┬─────────┬──────────┬───────────┐           │
│   │ State          │ Read    │ Write    │ Billing   │           │
│   ├────────────────┼─────────┼──────────┼───────────┤           │
│   │ provisioning   │ Yes     │ Yes      │ Deferred  │           │
│   │ active         │ Yes     │ Yes      │ Active    │           │
│   │ suspended      │ Yes     │ No       │ Past Due  │           │
│   │ archived       │ Export  │ No       │ Inactive  │           │
│   └────────────────┴─────────┴──────────┴───────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Company Record Ownership

```javascript
// Company ownership rules
const COMPANY_OWNERSHIP = {
  // Who creates it
  creator: 'The authenticated user who initiated company creation',

  // When it's created
  timing: 'Immediately upon Step 2 completion (atomic transaction)',

  // Initial state
  initialState: 'provisioning',

  // Becomes active when
  activationCriteria: [
    'Creator email verified (or OAuth provider)',
    'Company name provided',
    'Subscription record attached',
    'Admin membership created'
  ],

  // If abandoned mid-flow
  abandonmentHandling: {
    detection: 'company.status = "provisioning" AND created_at < NOW() - 24h',
    action: 'Cleanup job deletes incomplete companies + orphaned records',
    userRecovery: 'User can restart, new company created'
  }
}
```

### Atomic Company Creation Transaction

```javascript
// Pseudocode for company creation - MUST be atomic
async function createCompany(founderEmail, founderName, companyName, password) {
  const supabase = getServiceRoleClient() // Bypass RLS for creation

  return await supabase.rpc('create_company_atomic', {
    p_founder_email: founderEmail,
    p_founder_name: founderName,
    p_founder_password: password,
    p_company_name: companyName
  })
}

// PostgreSQL function (simplified)
/*
CREATE OR REPLACE FUNCTION create_company_atomic(
  p_founder_email TEXT,
  p_founder_name TEXT,
  p_founder_password TEXT,
  p_company_name TEXT
) RETURNS JSON AS $$
DECLARE
  v_auth_user_id UUID;
  v_company_id UUID;
  v_user_id UUID;
BEGIN
  -- 1. Create auth user (or get existing)
  INSERT INTO auth.users (email, password_hash, ...)
  VALUES (p_founder_email, crypt(p_founder_password, gen_salt('bf')), ...)
  ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_auth_user_id;

  -- 2. Create company in provisioning state
  INSERT INTO companies (name, status, code, office_code)
  VALUES (
    p_company_name,
    'provisioning',
    generate_company_code(),
    generate_office_code()
  )
  RETURNING id INTO v_company_id;

  -- 3. Create users record
  INSERT INTO users (id, email, name, company_id)
  VALUES (v_auth_user_id, p_founder_email, p_founder_name, v_company_id)
  RETURNING id INTO v_user_id;

  -- 4. Create subscription (14-day trial)
  INSERT INTO subscriptions (company_id, tier, status, trial_ends_at)
  VALUES (v_company_id, 'trial', 'active', NOW() + INTERVAL '14 days');

  -- 5. Create admin membership
  INSERT INTO user_companies (user_id, company_id, status, access_level)
  VALUES (v_user_id, v_company_id, 'active', 'administrator');

  -- 6. Activate company
  UPDATE companies SET status = 'active' WHERE id = v_company_id;

  RETURN json_build_object(
    'company_id', v_company_id,
    'company_code', (SELECT code FROM companies WHERE id = v_company_id),
    'user_id', v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/
```

---

## 4. Subscription & Tier Model

### Design Principles

1. **Decoupled from Core Data:** Subscription state stored separately from company data
2. **Progressive Commitment:** Allow exploration before payment
3. **Graceful Degradation:** Features disable, data remains accessible
4. **Future-Proof:** Support add-ons, enterprise features, custom pricing

### Subscription Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   SUBSCRIPTION DATA MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  companies (1) ◄────────► (1) subscriptions                     │
│      │                          │                                │
│      │                          ├── tier: trial|free|pro|...    │
│      │                          ├── status: active|past_due|... │
│      │                          ├── trial_ends_at               │
│      │                          ├── current_period_start        │
│      │                          ├── current_period_end          │
│      │                          └── stripe_customer_id (future) │
│      │                                                          │
│      │                                                          │
│  subscription_tiers (reference table)                           │
│      │                                                          │
│      ├── name: 'free'                                           │
│      │   ├── max_projects: 2                                    │
│      │   ├── max_users: 5                                       │
│      │   ├── max_storage_mb: 500                                │
│      │   └── features: ['basic_tm', 'basic_cor']                │
│      │                                                          │
│      ├── name: 'pro'                                            │
│      │   ├── max_projects: 10                                   │
│      │   ├── max_users: 25                                      │
│      │   ├── max_storage_mb: 5000                               │
│      │   └── features: ['all_tm', 'all_cor', 'reports']         │
│      │                                                          │
│      └── name: 'enterprise'                                     │
│          ├── max_projects: null (unlimited)                     │
│          ├── max_users: null                                    │
│          ├── max_storage_mb: null                               │
│          └── features: ['*', 'sso', 'api_access']               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Billing Enforcement Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│              BILLING ENFORCEMENT TIMELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TRIAL PERIOD (14 days)                                          │
│  ├── Full access to all Pro features                            │
│  ├── No payment required                                        │
│  ├── Reminder at day 7, day 12, day 14                          │
│  └── Converts to Free tier if no payment                        │
│                                                                  │
│  ACTIVE SUBSCRIPTION                                             │
│  ├── Features enabled per tier                                  │
│  ├── Usage tracked but not hard-blocked                         │
│  └── Overage warnings (soft limits)                             │
│                                                                  │
│  PAYMENT FAILURE                                                 │
│  ├── Day 0: Payment fails → status: 'past_due'                  │
│  ├── Day 0-7: Full access, warning banners                      │
│  ├── Day 7-14: Read-only mode, no new data                      │
│  ├── Day 14-30: Access blocked, data preserved                  │
│  └── Day 30+: Company suspended, export only                    │
│                                                                  │
│  VOLUNTARY DOWNGRADE                                             │
│  ├── Takes effect at period end                                 │
│  ├── Excess data preserved but read-only                        │
│  └── Must reduce to limits before adding more                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Feature Gating Implementation

```javascript
// Feature access check (runs in app, backed by RLS)
function canAccess(feature, company) {
  const subscription = company.subscription
  const tier = subscription.tier
  const limits = TIER_LIMITS[tier]

  // Check feature availability
  if (!limits.features.includes(feature) && !limits.features.includes('*')) {
    return { allowed: false, reason: 'upgrade_required', tier: tier }
  }

  // Check usage limits
  if (feature === 'create_project') {
    const currentProjects = company.active_project_count
    if (limits.max_projects && currentProjects >= limits.max_projects) {
      return { allowed: false, reason: 'limit_reached', limit: limits.max_projects }
    }
  }

  // Check subscription status
  if (subscription.status === 'past_due') {
    if (['create_project', 'create_ticket', 'upload_photo'].includes(feature)) {
      return { allowed: false, reason: 'payment_required' }
    }
  }

  return { allowed: true }
}
```

### Subscription State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                SUBSCRIPTION STATE MACHINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│              ┌─────────┐                                         │
│              │  trial  │                                         │
│              └────┬────┘                                         │
│                   │                                              │
│     ┌─────────────┼─────────────┐                                │
│     │ (paid)      │ (expired)   │                                │
│     ▼             ▼             │                                │
│  ┌──────┐    ┌───────┐          │                                │
│  │active│◄───│ free  │◄─────────┘                                │
│  └──┬───┘    └───────┘                                           │
│     │             ▲                                              │
│     │             │ (downgrade)                                  │
│     │             │                                              │
│     │ (payment    │                                              │
│     │  failed)    │                                              │
│     ▼             │                                              │
│  ┌─────────┐      │                                              │
│  │past_due │──────┴─── (payment resolved) ───► active            │
│  └────┬────┘                                                     │
│       │                                                          │
│       │ (30 days)                                                │
│       ▼                                                          │
│  ┌───────────┐                                                   │
│  │ suspended │ ───── (payment + reactivation) ───► active        │
│  └─────┬─────┘                                                   │
│        │                                                         │
│        │ (90 days)                                               │
│        ▼                                                         │
│  ┌───────────┐                                                   │
│  │ cancelled │ ◄── Data retained 1 year, then purged            │
│  └───────────┘                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Admin & Access Bootstrapping

### First Admin Assignment Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                 ADMIN BOOTSTRAP RULES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RULE 1: Company Creator is Automatic Administrator             │
│  ────────────────────────────────────────────────────────────── │
│  • The user who creates a company is immediately granted        │
│    'administrator' access_level                                  │
│  • This is ATOMIC - part of company creation transaction        │
│  • No approval required (self-approved)                         │
│                                                                  │
│  RULE 2: No Admin-less Companies                                 │
│  ────────────────────────────────────────────────────────────── │
│  • RLS prevents last admin from demoting themselves             │
│  • RLS prevents last admin from being removed                   │
│  • Trigger enforces: COUNT(administrators) >= 1 always          │
│                                                                  │
│  RULE 3: Admin Privileges                                        │
│  ────────────────────────────────────────────────────────────── │
│  Administrators can:                                             │
│  ✓ Approve/reject membership requests                           │
│  ✓ Remove members (except themselves)                           │
│  ✓ Grant/revoke administrator access                            │
│  ✓ View subscription & billing                                  │
│  ✓ Update company settings                                      │
│  ✓ Manage projects (create, archive, delete)                    │
│  ✓ View all company data                                        │
│                                                                  │
│  RULE 4: Privilege Escalation Prevention                        │
│  ────────────────────────────────────────────────────────────── │
│  • Only administrators can grant administrator access           │
│  • Members cannot self-promote                                  │
│  • Database enforces via RLS policy:                            │
│                                                                  │
│    CREATE POLICY admin_grant_policy ON user_companies           │
│    FOR UPDATE USING (                                           │
│      -- Updater must be admin of same company                   │
│      EXISTS (                                                   │
│        SELECT 1 FROM user_companies uc                          │
│        WHERE uc.user_id = auth.uid()                            │
│        AND uc.company_id = user_companies.company_id            │
│        AND uc.access_level = 'administrator'                    │
│        AND uc.status = 'active'                                 │
│      )                                                          │
│    );                                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Admin Management Capabilities

```javascript
// Admin capabilities matrix
const ADMIN_CAPABILITIES = {
  users: {
    approve_pending: true,
    reject_pending: true,
    remove_member: true,     // except self
    grant_admin: true,
    revoke_admin: true,      // except self if last admin
    change_role: true
  },

  subscription: {
    view_plan: true,
    upgrade: true,
    downgrade: true,
    update_payment: true,
    view_invoices: true
  },

  company: {
    update_name: true,
    regenerate_codes: true,
    view_codes: true,
    archive_company: true    // requires confirmation
  },

  projects: {
    create: true,
    archive: true,
    delete: true,           // soft delete only
    transfer_ownership: true
  }
}

// Member capabilities (non-admin)
const MEMBER_CAPABILITIES = {
  users: {
    view_team: true
  },

  subscription: {
    view_plan: true         // but not billing details
  },

  company: {},              // no company management

  projects: {
    create: true,           // if tier allows
    view_assigned: true,
    edit_assigned: true
  }
}
```

### Orphan Prevention

```sql
-- Trigger to prevent orphaned companies (no admins)
CREATE OR REPLACE FUNCTION prevent_orphan_company()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_count INT;
BEGIN
  -- Only check on updates that change admin status or removals
  IF (TG_OP = 'UPDATE' AND
      (OLD.access_level = 'administrator' AND NEW.access_level != 'administrator')
      OR (OLD.status = 'active' AND NEW.status = 'removed')) THEN

    SELECT COUNT(*) INTO v_admin_count
    FROM user_companies
    WHERE company_id = NEW.company_id
      AND status = 'active'
      AND access_level = 'administrator'
      AND id != NEW.id;  -- Exclude the record being modified

    IF v_admin_count < 1 THEN
      RAISE EXCEPTION 'Cannot remove last administrator from company';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_admin_presence
BEFORE UPDATE ON user_companies
FOR EACH ROW EXECUTE FUNCTION prevent_orphan_company();
```

---

## 6. Joining Existing Companies

### Join Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   JOIN COMPANY FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  METHOD 1: Company Code + Office Code (Current)                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│   User                    System                    Admin        │
│   ────                    ──────                    ─────        │
│     │                                                            │
│     │──► Enter company code                                      │
│     │    (public, 6 chars)                                       │
│     │                         │                                  │
│     │──► Enter office code    │                                  │
│     │    (secret, 6 chars)    │                                  │
│     │                         │                                  │
│     │                    ┌────┴────┐                             │
│     │                    │ verify  │                             │
│     │                    │ RPC     │                             │
│     │                    └────┬────┘                             │
│     │                         │                                  │
│     │◄── "Verified, create account" ──┘                         │
│     │                                                            │
│     │──► Create account                                          │
│     │    (name, email, password)                                 │
│     │                         │                                  │
│     │                    ┌────┴────┐                             │
│     │                    │ create  │                             │
│     │                    │ pending │                             │
│     │                    │ member  │                             │
│     │                    └────┬────┘                             │
│     │                         │                                  │
│     │◄── "Awaiting approval" ─┘                                  │
│     │                                                            │
│     │                                        ┌───────────────┐   │
│     │                                        │ Notification  │   │
│     │                                        │ to admin      │   │
│     │                                        └───────┬───────┘   │
│     │                                                │           │
│     │                                                ▼           │
│     │                                        Admin reviews       │
│     │                                        pending request     │
│     │                                                │           │
│     │                                                ▼           │
│     │                                        Approves with       │
│     │                                        role + level        │
│     │                                                │           │
│     │◄── Email: "You've been approved" ──────────────┘           │
│     │                                                            │
│     │──► Login ──► Dashboard                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Method 2: Admin Invite (Recommended Addition)

```
┌─────────────────────────────────────────────────────────────────┐
│                   ADMIN INVITE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Admin                   System                    User         │
│   ─────                   ──────                    ────         │
│     │                                                            │
│     │──► "Invite Team Member"                                    │
│     │    Enter: email, role, access level                        │
│     │                         │                                  │
│     │                    ┌────┴────┐                             │
│     │                    │ create  │                             │
│     │                    │ invite  │                             │
│     │                    │ token   │                             │
│     │                    └────┬────┘                             │
│     │                         │                                  │
│     │◄── "Invite sent" ───────┘                                  │
│     │                                                            │
│     │                         │──► Email with invite link        │
│     │                         │                                  │
│     │                                                ▼           │
│     │                                        User clicks link    │
│     │                                                │           │
│     │                                                ▼           │
│     │                                        Creates account     │
│     │                                        (name, password)    │
│     │                                                │           │
│     │                    ┌───────────────────────────┘           │
│     │                    │                                       │
│     │                    ▼                                       │
│     │              ┌─────────────┐                               │
│     │              │ Auto-approve│                               │
│     │              │ with preset │                               │
│     │              │ role/level  │                               │
│     │              └─────────────┘                               │
│     │                    │                                       │
│     │◄── Notified ───────┘──────────────────────► Dashboard      │
│                                                                  │
│   Benefits:                                                      │
│   • No pending state for invited users                          │
│   • Admin pre-approves role/level                               │
│   • More controlled onboarding                                  │
│   • Works for new + existing users                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pending Membership Management

```javascript
// Pending membership states and transitions
const MEMBERSHIP_STATES = {
  // User requests to join
  pending: {
    userCan: ['view_status', 'cancel_request'],
    adminCan: ['approve', 'reject'],
    dataAccess: 'none',
    expiresAfter: '30 days'  // Auto-reject stale requests
  },

  // Invited by admin (new state)
  invited: {
    userCan: ['accept', 'decline'],
    adminCan: ['revoke_invite'],
    dataAccess: 'none',
    expiresAfter: '7 days'
  },

  // Approved and active
  active: {
    userCan: ['leave_company'],
    adminCan: ['change_role', 'change_level', 'remove'],
    dataAccess: 'full'
  },

  // Removed by admin
  removed: {
    userCan: ['request_rejoin'],  // Creates new pending
    adminCan: ['reinstate'],
    dataAccess: 'none',
    auditRetention: 'indefinite'
  }
}
```

### Security Considerations

```
┌─────────────────────────────────────────────────────────────────┐
│                 JOIN SECURITY MEASURES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OFFICE CODE PROTECTION                                          │
│  ────────────────────────────────────────────────────────────── │
│  • Never returned to client (verified via RPC only)             │
│  • Rate-limited: 5 attempts per IP per hour                     │
│  • Regeneratable by admin at any time                           │
│  • Logged: all verification attempts recorded                   │
│                                                                  │
│  INVITE TOKEN PROTECTION                                         │
│  ────────────────────────────────────────────────────────────── │
│  • Single-use, expires in 7 days                                │
│  • Cryptographically random (32 bytes)                          │
│  • Tied to specific email address                               │
│  • Revocable by admin before use                                │
│                                                                  │
│  ABUSE PREVENTION                                                │
│  ────────────────────────────────────────────────────────────── │
│  • Max 10 pending requests per user globally                    │
│  • Max 50 pending requests per company                          │
│  • Auto-cleanup of expired requests                             │
│  • Admin notifications for unusual join patterns                │
│                                                                  │
│  MULTI-COMPANY SAFETY                                            │
│  ────────────────────────────────────────────────────────────── │
│  • Each company membership is independent                       │
│  • Removal from one doesn't affect others                       │
│  • Company-scoped roles, not global                             │
│  • Clear UI showing which company is active                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Data Model Extensions

### New Tables Required

```sql
-- Company lifecycle states
ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'active'
  CHECK (status IN ('provisioning', 'active', 'suspended', 'archived'));

-- Subscriptions table (if not exists)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'suspended', 'cancelled')),

  -- Trial tracking
  trial_ends_at TIMESTAMPTZ,

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Future: Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id)
);

-- Subscription tier definitions
CREATE TABLE subscription_tiers (
  name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  price_monthly_cents INT,
  max_projects INT,      -- NULL = unlimited
  max_users INT,
  max_storage_mb INT,
  features JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN DEFAULT true,  -- false for enterprise/custom
  sort_order INT DEFAULT 0
);

-- Insert tier definitions
INSERT INTO subscription_tiers VALUES
  ('trial', 'Trial', 0, 10, 25, 5000, '["all"]', false, 0),
  ('free', 'Free', 0, 2, 5, 500, '["basic"]', true, 1),
  ('pro', 'Pro', 9900, 10, 25, 5000, '["all"]', true, 2),
  ('business', 'Business', 29900, 50, 100, 25000, '["all", "api"]', true, 3),
  ('enterprise', 'Enterprise', NULL, NULL, NULL, NULL, '["all", "api", "sso", "custom"]', false, 4);

-- Invite tokens
CREATE TABLE company_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  access_level TEXT NOT NULL DEFAULT 'member',
  company_role TEXT,

  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',

  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id),

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- Membership status additions
ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS invite_id UUID REFERENCES company_invites(id);
```

### Enhanced Company Table

```sql
-- Full company table with new fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS
  owner_user_id UUID REFERENCES users(id);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS
  office_code_regenerated_at TIMESTAMPTZ;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS
  settings JSONB DEFAULT '{}';

-- Settings structure:
-- {
--   "branding": { "logo_url": null, "primary_color": "#2563eb" },
--   "defaults": { "time_preset": "8hr", "overtime_threshold": 8 },
--   "notifications": { "pending_members": true, "weekly_digest": false }
-- }
```

---

## 8. Risk & Edge Case Analysis

### Edge Cases Matrix

| Scenario | Risk Level | Mitigation |
|----------|------------|------------|
| User abandons signup mid-flow | Low | Cleanup job removes stale `provisioning` companies after 24h |
| Payment fails during company creation | Medium | Subscription creation is deferred; company still activates |
| Admin removes themselves | High | RLS + trigger prevents if they're last admin |
| User joins same company twice | Low | Unique constraint on (user_id, company_id) |
| Invite link leaked | Medium | Single-use, email-bound, short expiry |
| Company code guessed | Medium | Office code verification required; rate limiting |
| Pending request sits forever | Low | Auto-expire after 30 days; admin notifications |
| Subscription expires mid-project | Medium | Graceful degradation: read-only, then suspended |
| Admin leaves, forgets to assign new admin | High | Prevented by trigger; cannot remove self if last admin |
| Email already exists (join vs create) | Medium | Check existence first; offer login or recovery |

### Failure Recovery Procedures

```javascript
// Recovery procedures for common failures

const RECOVERY_PROCEDURES = {
  // Company creation failed midway
  incomplete_company: {
    detection: "SELECT * FROM companies WHERE status = 'provisioning' AND created_at < NOW() - INTERVAL '24 hours'",
    action: 'Delete company and all related orphan records',
    userImpact: 'User can retry signup; no data loss (nothing was created yet)',
    frequency: 'Run cleanup job every hour'
  },

  // User in pending state, admin never approves
  stale_pending: {
    detection: "SELECT * FROM user_companies WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 days'",
    action: 'Auto-reject and notify user',
    userImpact: 'User can request again or contact company directly',
    frequency: 'Run daily'
  },

  // Invite never used
  expired_invite: {
    detection: "SELECT * FROM company_invites WHERE status = 'pending' AND expires_at < NOW()",
    action: "Update status to 'expired'",
    userImpact: 'Admin can resend invite',
    frequency: 'Run hourly'
  },

  // Admin-less company (should be impossible)
  orphan_company: {
    detection: `
      SELECT c.id FROM companies c
      WHERE NOT EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.company_id = c.id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
      )
      AND c.status = 'active'
    `,
    action: 'Alert system admin; promote oldest active member or contact owner',
    userImpact: 'Temporary inability to manage company',
    frequency: 'Monitor continuously; should never trigger'
  }
}
```

### Security Threat Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                   SECURITY THREATS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  THREAT: Brute-force company/office codes                        │
│  ─────────────────────────────────────────────────────────────── │
│  Attack: Enumerate company codes, try common office codes        │
│  Mitigation:                                                     │
│    • 6-char alphanumeric = 2.1B combinations                    │
│    • Rate limit: 5 attempts/hour/IP                             │
│    • CAPTCHA after 3 failures                                   │
│    • Log all attempts for anomaly detection                     │
│                                                                  │
│  THREAT: Privilege escalation via membership manipulation        │
│  ─────────────────────────────────────────────────────────────── │
│  Attack: User modifies their own access_level                   │
│  Mitigation:                                                     │
│    • RLS enforces only admins can modify access_level           │
│    • API validates caller is admin before any role change       │
│    • Audit log tracks all membership changes                    │
│                                                                  │
│  THREAT: Cross-tenant data access                                │
│  ─────────────────────────────────────────────────────────────── │
│  Attack: Manipulate company_id in requests                      │
│  Mitigation:                                                     │
│    • RLS on ALL tables with company_id                          │
│    • Server validates company membership before any operation   │
│    • No client-side company_id trust                            │
│                                                                  │
│  THREAT: Subscription bypass                                     │
│  ─────────────────────────────────────────────────────────────── │
│  Attack: Access premium features without paying                 │
│  Mitigation:                                                     │
│    • Feature checks in both frontend and RLS                    │
│    • Database triggers enforce limits                           │
│    • Soft limits allow slight overage, hard limits block        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Admin Billing Portal

### Portal Overview

The Admin Billing Portal is where company owners/administrators manage their subscription, payment methods, team billing, and invoices. Only users with `access_level = 'administrator'` can access billing features.

### Portal Location & Access

```
┌─────────────────────────────────────────────────────────────────┐
│                   BILLING PORTAL ACCESS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Dashboard Navigation:                                          │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Projects  │  Team  │  CORs  │  Reports  │  ⚙ Settings  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                            │                     │
│                                            ▼                     │
│                              ┌─────────────────────────┐        │
│                              │     Settings Page       │        │
│                              ├─────────────────────────┤        │
│                              │  • Company Info         │        │
│                              │  • Team Codes           │        │
│                              │  • Billing & Plan  ◄────┼─ NEW   │
│                              │  • Notifications        │        │
│                              └─────────────────────────┘        │
│                                                                  │
│   Access Control:                                                │
│   ├── Administrator: Full access to all billing features       │
│   └── Member: Can see current plan, but NOT billing details    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Billing Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BILLING & SUBSCRIPTION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  CURRENT PLAN                                                        │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │   ┌──────────┐                                                       │    │
│  │   │   PRO    │   $99/month                                          │    │
│  │   └──────────┘                                                       │    │
│  │                                                                      │    │
│  │   Status: ✓ Active           Next billing: January 15, 2025         │    │
│  │                                                                      │    │
│  │   Usage this period:                                                 │    │
│  │   ├── Projects: 7 of 10                    ████████░░ 70%           │    │
│  │   ├── Team members: 12 of 25               █████░░░░░ 48%           │    │
│  │   └── Storage: 2.1 GB of 5 GB              ████░░░░░░ 42%           │    │
│  │                                                                      │    │
│  │   [Change Plan]    [Cancel Subscription]                            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PAYMENT METHOD                                                      │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │   💳  Visa ending in 4242                    Expires 12/2026        │    │
│  │                                                                      │    │
│  │   [Update Payment Method]                                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  BILLING HISTORY                                                     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │   Date           Description              Amount      Status        │    │
│  │   ─────────────────────────────────────────────────────────────     │    │
│  │   Dec 15, 2024   Pro Plan - Monthly       $99.00      ✓ Paid       │    │
│  │   Nov 15, 2024   Pro Plan - Monthly       $99.00      ✓ Paid       │    │
│  │   Oct 15, 2024   Pro Plan - Monthly       $99.00      ✓ Paid       │    │
│  │   Sep 15, 2024   Pro Plan - Monthly       $99.00      ✓ Paid       │    │
│  │                                                                      │    │
│  │   [View All Invoices]    [Download All]                             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Plan Selection Modal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHANGE YOUR PLAN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│   │      FREE       │  │   PRO ✓ Current │  │    BUSINESS     │            │
│   ├─────────────────┤  ├─────────────────┤  ├─────────────────┤            │
│   │                 │  │                 │  │                 │            │
│   │   $0/month      │  │   $99/month     │  │   $299/month    │            │
│   │                 │  │                 │  │                 │            │
│   │   2 projects    │  │   10 projects   │  │   50 projects   │            │
│   │   5 users       │  │   25 users      │  │   100 users     │            │
│   │   500 MB        │  │   5 GB          │  │   25 GB         │            │
│   │                 │  │                 │  │                 │            │
│   │   Basic T&M     │  │   All features  │  │   All features  │            │
│   │                 │  │   Photo uploads │  │   API access    │            │
│   │                 │  │   Reports       │  │   Priority      │            │
│   │                 │  │                 │  │   support       │            │
│   │                 │  │                 │  │                 │            │
│   │   [Downgrade]   │  │   Current Plan  │  │   [Upgrade]     │            │
│   │                 │  │                 │  │                 │            │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                              │
│   Need more? [Contact us for Enterprise pricing]                            │
│                                                                              │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                              │
│   Upgrade: Takes effect immediately, prorated for current period            │
│   Downgrade: Takes effect at end of current billing period                  │
│                                                                              │
│                                                   [Cancel]                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Admin Billing Capabilities

```javascript
// What administrators can do in the billing portal
const BILLING_CAPABILITIES = {
  // View capabilities
  view: {
    current_plan: true,           // Plan name, price, features
    usage_metrics: true,          // Projects, users, storage used
    billing_period: true,         // Current period dates
    payment_method: true,         // Last 4 digits, expiry (NOT full card)
    invoice_history: true,        // All past invoices
    invoice_download: true        // Download PDF invoices
  },

  // Modify capabilities
  modify: {
    upgrade_plan: true,           // Immediately with proration
    downgrade_plan: true,         // Effective end of period
    cancel_subscription: true,    // With confirmation + grace period
    update_payment_method: true,  // Replace card via Stripe
    update_billing_email: true,   // Where invoices are sent
    enable_auto_renew: true       // Toggle auto-renewal
  },

  // Cannot do (requires FieldSync support)
  restricted: {
    custom_pricing: false,        // Contact sales
    enterprise_tier: false,       // Contact sales
    refund_request: false,        // Contact support
    transfer_ownership: false     // Contact support
  }
}
```

### Cancellation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   CANCELLATION FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: Initiate                                                │
│  ────────────────────────────────────────────────────────────── │
│  Admin clicks "Cancel Subscription"                             │
│                                                                  │
│  STEP 2: Retention Offer (Optional)                              │
│  ────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Before you go...                                         │   │
│  │                                                           │   │
│  │  We'd hate to see you leave! Here are some options:      │   │
│  │                                                           │   │
│  │  • Downgrade to Free (keep your data, limited features)  │   │
│  │  • Pause for 1 month (keep plan, skip next payment)      │   │
│  │  • Talk to support (we can help with issues)             │   │
│  │                                                           │   │
│  │  [Continue Cancellation]    [I'll Stay]                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  STEP 3: Confirm Cancellation                                    │
│  ────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Confirm Cancellation                                     │   │
│  │                                                           │   │
│  │  Your subscription will remain active until:              │   │
│  │  January 15, 2025 (end of billing period)                │   │
│  │                                                           │   │
│  │  After that date:                                         │   │
│  │  • Your account will convert to Free tier                │   │
│  │  • Data over Free limits becomes read-only               │   │
│  │  • You can reactivate anytime                            │   │
│  │                                                           │   │
│  │  Type "CANCEL" to confirm: [____________]                │   │
│  │                                                           │   │
│  │  [Cancel Subscription]                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  STEP 4: Post-Cancellation                                       │
│  ────────────────────────────────────────────────────────────── │
│  • Email confirmation sent                                      │
│  • Access continues until period end                            │
│  • Subscription status: "cancelling"                            │
│  • At period end: auto-convert to Free tier                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Member View (Non-Admin)

```
┌─────────────────────────────────────────────────────────────────┐
│                   MEMBER VIEW (LIMITED)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Members can see:                                               │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  YOUR COMPANY'S PLAN                                      │  │
│   │                                                           │  │
│   │  Plan: Pro                                                │  │
│   │  Status: Active                                           │  │
│   │                                                           │  │
│   │  Usage:                                                   │  │
│   │  ├── Projects: 7 of 10                                   │  │
│   │  ├── Team members: 12 of 25                              │  │
│   │  └── Storage: 2.1 GB of 5 GB                             │  │
│   │                                                           │  │
│   │  ℹ Contact an administrator to manage billing            │  │
│   │                                                           │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   Members CANNOT see:                                            │
│   ✗ Payment method details                                      │
│   ✗ Invoice history                                             │
│   ✗ Billing amounts                                             │
│   ✗ Change/cancel subscription                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Payment Processing & Stripe Integration

### Why Stripe?

| Factor | Stripe | Alternatives |
|--------|--------|--------------|
| PCI Compliance | Handled by Stripe | Must manage ourselves |
| Supabase Integration | Native Edge Functions support | Varies |
| Subscription Management | Built-in | Must build |
| Global Payments | 135+ currencies | Limited |
| Developer Experience | Excellent docs, webhooks | Varies |
| Pricing | 2.9% + $0.30 per transaction | Comparable |

**Decision:** Use Stripe for all payment processing.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT PROCESSING ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │
│   │  FieldSync  │         │   Supabase  │         │   Stripe    │          │
│   │   Client    │         │   Backend   │         │   (Vault)   │          │
│   └──────┬──────┘         └──────┬──────┘         └──────┬──────┘          │
│          │                       │                       │                  │
│          │  1. User clicks       │                       │                  │
│          │     "Add Payment"     │                       │                  │
│          │ ─────────────────────►│                       │                  │
│          │                       │  2. Create Checkout   │                  │
│          │                       │     Session           │                  │
│          │                       │ ─────────────────────►│                  │
│          │                       │                       │                  │
│          │                       │◄──────────────────────│                  │
│          │◄──────────────────────│  3. Return Session URL│                  │
│          │  Redirect to Stripe   │                       │                  │
│          │                       │                       │                  │
│          │ ════════════════════════════════════════════►│                  │
│          │  4. User enters card on Stripe-hosted page    │                  │
│          │                       │                       │                  │
│          │◄════════════════════════════════════════════ │                  │
│          │  5. Redirect back to FieldSync               │                  │
│          │                       │                       │                  │
│          │                       │◄──────────────────────│                  │
│          │                       │  6. Webhook: payment  │                  │
│          │                       │     successful        │                  │
│          │                       │                       │                  │
│          │                       │  7. Update subscription                  │
│          │                       │     in database       │                  │
│          │                       │                       │                  │
│                                                                              │
│   KEY POINT: Card details NEVER touch FieldSync servers                     │
│   Stripe handles all PCI compliance                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model for Payments

```sql
-- Extended subscriptions table with Stripe fields
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS
  stripe_customer_id TEXT UNIQUE;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS
  stripe_subscription_id TEXT UNIQUE;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS
  stripe_price_id TEXT;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS
  cancel_at_period_end BOOLEAN DEFAULT FALSE;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS
  cancelled_at TIMESTAMPTZ;

-- Payment methods (reference only - Stripe is source of truth)
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,

  -- Display info only (never store full card)
  card_brand TEXT,           -- 'visa', 'mastercard', etc.
  card_last_four TEXT,       -- '4242'
  card_exp_month INT,
  card_exp_year INT,

  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, stripe_payment_method_id)
);

-- Invoice records (synced from Stripe webhooks)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE NOT NULL,

  amount_cents INT NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,        -- 'paid', 'open', 'void', 'uncollectible'

  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription events log (audit trail)
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,    -- 'created', 'upgraded', 'downgraded', 'cancelled', 'renewed', 'payment_failed'
  from_tier TEXT,
  to_tier TEXT,

  stripe_event_id TEXT,        -- Stripe webhook event ID
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Stripe Products & Prices Setup

```javascript
// Stripe product/price structure (set up in Stripe Dashboard or via API)
const STRIPE_PRODUCTS = {
  // Each tier is a Stripe Product
  pro: {
    product_id: 'prod_Pro123',
    name: 'FieldSync Pro',
    prices: {
      monthly: {
        price_id: 'price_ProMonthly123',
        amount: 9900,  // $99.00
        interval: 'month'
      },
      yearly: {
        price_id: 'price_ProYearly123',
        amount: 99000,  // $990.00 (2 months free)
        interval: 'year'
      }
    }
  },
  business: {
    product_id: 'prod_Business123',
    name: 'FieldSync Business',
    prices: {
      monthly: {
        price_id: 'price_BusinessMonthly123',
        amount: 29900,  // $299.00
        interval: 'month'
      },
      yearly: {
        price_id: 'price_BusinessYearly123',
        amount: 299000,  // $2,990.00 (2 months free)
        interval: 'year'
      }
    }
  }
}
```

### Monthly Billing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MONTHLY BILLING CYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAY 0: Subscription Created                                     │
│  ────────────────────────────────────────────────────────────── │
│  1. User completes checkout on Stripe                           │
│  2. Stripe creates subscription + first invoice                 │
│  3. Stripe charges payment method                               │
│  4. Webhook: customer.subscription.created                      │
│  5. FieldSync updates subscription record                       │
│                                                                  │
│  DAY 30: Renewal (Automated by Stripe)                           │
│  ────────────────────────────────────────────────────────────── │
│  1. Stripe generates invoice for next period                    │
│  2. Stripe attempts to charge payment method                    │
│  3. If SUCCESS:                                                 │
│     • Webhook: invoice.paid                                     │
│     • FieldSync logs successful payment                         │
│     • Update current_period_end                                 │
│  4. If FAILED:                                                  │
│     • Webhook: invoice.payment_failed                           │
│     • FieldSync marks subscription "past_due"                   │
│     • Email sent to admin                                       │
│     • Stripe retries (Smart Retries)                            │
│                                                                  │
│  RETRY SCHEDULE (Stripe Smart Retries):                          │
│  ────────────────────────────────────────────────────────────── │
│  • Day 0: First attempt fails                                   │
│  • Day 3: Retry #1                                              │
│  • Day 5: Retry #2                                              │
│  • Day 7: Retry #3                                              │
│  • Day 7+: Final failure → subscription suspended               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Webhook Handlers

```javascript
// Supabase Edge Function: stripe-webhooks
// File: supabase/functions/stripe-webhooks/index.ts

const WEBHOOK_HANDLERS = {
  // New subscription created
  'customer.subscription.created': async (event) => {
    const subscription = event.data.object
    const companyId = subscription.metadata.company_id

    await supabase.from('subscriptions').upsert({
      company_id: companyId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      tier: mapPriceToTier(subscription.items.data[0].price.id),
      status: 'active',
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000)
    })

    await logSubscriptionEvent(companyId, 'created', null, subscription.metadata.tier)
  },

  // Subscription updated (upgrade/downgrade)
  'customer.subscription.updated': async (event) => {
    const subscription = event.data.object
    const previous = event.data.previous_attributes
    const companyId = await getCompanyByStripeCustomer(subscription.customer)

    await supabase.from('subscriptions').update({
      tier: mapPriceToTier(subscription.items.data[0].price.id),
      status: mapStripeStatus(subscription.status),
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end
    }).eq('company_id', companyId)

    // Log tier change if applicable
    if (previous.items) {
      const oldTier = mapPriceToTier(previous.items.data[0].price.id)
      const newTier = mapPriceToTier(subscription.items.data[0].price.id)
      if (oldTier !== newTier) {
        const eventType = tierRank(newTier) > tierRank(oldTier) ? 'upgraded' : 'downgraded'
        await logSubscriptionEvent(companyId, eventType, oldTier, newTier)
      }
    }
  },

  // Payment succeeded
  'invoice.paid': async (event) => {
    const invoice = event.data.object
    const companyId = await getCompanyByStripeCustomer(invoice.customer)

    // Store invoice record
    await supabase.from('invoices').upsert({
      company_id: companyId,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_paid,
      status: 'paid',
      period_start: new Date(invoice.period_start * 1000),
      period_end: new Date(invoice.period_end * 1000),
      paid_at: new Date(),
      invoice_pdf_url: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url
    })

    // Ensure subscription is active
    await supabase.from('subscriptions').update({
      status: 'active'
    }).eq('company_id', companyId)

    await logSubscriptionEvent(companyId, 'renewed')
  },

  // Payment failed
  'invoice.payment_failed': async (event) => {
    const invoice = event.data.object
    const companyId = await getCompanyByStripeCustomer(invoice.customer)

    // Mark as past due
    await supabase.from('subscriptions').update({
      status: 'past_due'
    }).eq('company_id', companyId)

    await logSubscriptionEvent(companyId, 'payment_failed', null, null, {
      attempt_count: invoice.attempt_count,
      next_attempt: invoice.next_payment_attempt
    })

    // Send email to company admins
    await sendPaymentFailedEmail(companyId, invoice)
  },

  // Subscription cancelled
  'customer.subscription.deleted': async (event) => {
    const subscription = event.data.object
    const companyId = await getCompanyByStripeCustomer(subscription.customer)

    // Downgrade to free tier
    await supabase.from('subscriptions').update({
      tier: 'free',
      status: 'active',  // Back to active, just on free
      stripe_subscription_id: null,
      cancelled_at: new Date()
    }).eq('company_id', companyId)

    await logSubscriptionEvent(companyId, 'cancelled')
    await sendCancellationConfirmationEmail(companyId)
  }
}
```

### Checkout Flow Implementation

```javascript
// Client-side: Initiate checkout
async function initiateCheckout(companyId, priceId) {
  // Call Supabase Edge Function
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { companyId, priceId }
  })

  if (error) throw error

  // Redirect to Stripe Checkout
  window.location.href = data.checkout_url
}

// Edge Function: create-checkout
// supabase/functions/create-checkout/index.ts
async function createCheckout(req) {
  const { companyId, priceId } = await req.json()

  // Verify user is admin of company
  const user = await getAuthUser(req)
  const isAdmin = await verifyCompanyAdmin(user.id, companyId)
  if (!isAdmin) throw new Error('Unauthorized')

  // Get or create Stripe customer
  const company = await getCompany(companyId)
  let customerId = company.subscription?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: company.name,
      metadata: { company_id: companyId }
    })
    customerId = customer.id
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/settings/billing?success=true`,
    cancel_url: `${SITE_URL}/settings/billing?cancelled=true`,
    subscription_data: {
      metadata: { company_id: companyId }
    }
  })

  return { checkout_url: session.url }
}
```

### Update Payment Method Flow

```javascript
// Client-side: Update payment method
async function updatePaymentMethod(companyId) {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: { companyId }
  })

  if (error) throw error

  // Redirect to Stripe Customer Portal
  window.location.href = data.portal_url
}

// Edge Function: create-portal-session
async function createPortalSession(req) {
  const { companyId } = await req.json()

  // Verify admin
  const user = await getAuthUser(req)
  const isAdmin = await verifyCompanyAdmin(user.id, companyId)
  if (!isAdmin) throw new Error('Unauthorized')

  const subscription = await getSubscription(companyId)

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${SITE_URL}/settings/billing`
  })

  return { portal_url: session.url }
}
```

### Proration for Upgrades/Downgrades

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRORATION STRATEGY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  UPGRADE (Pro → Business mid-cycle)                              │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Day 15 of 30-day billing period                                │
│  Pro: $99/month = $3.30/day                                     │
│  Business: $299/month = $9.97/day                               │
│                                                                  │
│  Calculation:                                                    │
│  - Credit for unused Pro: 15 days × $3.30 = $49.50             │
│  - Charge for Business: 15 days × $9.97 = $149.55              │
│  - Net charge today: $149.55 - $49.50 = $100.05                │
│  - Next month: Full $299                                        │
│                                                                  │
│  Stripe handles this automatically with proration_behavior:     │
│  'create_prorations'                                            │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  DOWNGRADE (Business → Pro mid-cycle)                            │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Strategy: Schedule change for end of period                    │
│  - User keeps Business features until period ends               │
│  - No refund issued                                             │
│  - New rate applies at renewal                                  │
│                                                                  │
│  Stripe: schedule subscription update                           │
│  stripe.subscriptions.update(subId, {                           │
│    proration_behavior: 'none',                                  │
│    items: [{ price: newPriceId }],                              │
│    billing_cycle_anchor: 'unchanged'                            │
│  })                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Free Tier Handling

```
┌─────────────────────────────────────────────────────────────────┐
│               FREE TIER - NO PAYMENT REQUIRED                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Companies on Free tier:                                         │
│  • No Stripe customer created until they upgrade                │
│  • No payment method required                                   │
│  • subscription.status = 'active', tier = 'free'                │
│  • stripe_customer_id = NULL                                    │
│  • stripe_subscription_id = NULL                                │
│                                                                  │
│  Upgrade from Free:                                              │
│  1. User selects paid plan                                      │
│  2. Stripe customer created                                     │
│  3. Checkout session initiated                                  │
│  4. On success: tier updated, subscription created              │
│                                                                  │
│  Trial Expiration → Free:                                        │
│  • Automatic at trial_ends_at                                   │
│  • No payment attempted                                         │
│  • Tier changes from 'trial' to 'free'                          │
│  • Email notification sent                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Enterprise / Custom Pricing

```
┌─────────────────────────────────────────────────────────────────┐
│               ENTERPRISE TIER HANDLING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Enterprise subscriptions are NOT self-service:                  │
│                                                                  │
│  1. Company contacts sales (via form or email)                  │
│  2. Sales discusses needs, negotiates pricing                   │
│  3. Sales creates custom Stripe Price (one-time or recurring)   │
│  4. Sales manually:                                              │
│     - Creates Stripe customer                                   │
│     - Creates subscription with custom price                    │
│     - Updates FieldSync subscription record                     │
│       • tier = 'enterprise'                                     │
│       • Sets custom limits in metadata                          │
│                                                                  │
│  Enterprise features:                                            │
│  • Custom user/project/storage limits                           │
│  • SSO/SAML integration                                         │
│  • Dedicated support                                            │
│  • Custom contract terms                                        │
│  • Annual billing (typically)                                   │
│                                                                  │
│  In Billing Portal, Enterprise users see:                       │
│  "Enterprise Plan - Contact support for changes"                │
│  (No self-service downgrade)                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Required First)

**Scope:** Core infrastructure for company creation and subscription tracking

| Task | Priority | Complexity |
|------|----------|------------|
| Add `subscriptions` table | P0 | Low |
| Add `subscription_tiers` table | P0 | Low |
| Add `status` column to companies | P0 | Low |
| Create `create_company_atomic` RPC | P0 | Medium |
| Add orphan prevention trigger | P0 | Low |
| Add "Create Company" to AppEntry | P0 | Medium |
| Build company creation wizard UI | P0 | Medium |

### Phase 2: Admin Settings & Subscription View

**Scope:** Admin can view subscription status and company settings

| Task | Priority | Complexity |
|------|----------|------------|
| Add Settings page to dashboard navigation | P1 | Low |
| Build Company Info settings section | P1 | Low |
| Build Team Codes section (view/regenerate) | P1 | Medium |
| Build Billing & Plan section (view only) | P1 | Medium |
| Show current tier, usage metrics, period dates | P1 | Low |
| Feature gating hooks (check tier on actions) | P1 | Medium |
| Tier limit enforcement (soft warnings) | P1 | Medium |

### Phase 3: Admin Billing Portal (Pre-Stripe)

**Scope:** Full billing portal UI ready for Stripe integration

| Task | Priority | Complexity |
|------|----------|------------|
| Plan comparison modal (Free/Pro/Business) | P2 | Medium |
| Upgrade request flow (form, not payment yet) | P2 | Low |
| Cancellation flow UI (confirmation, retention) | P2 | Medium |
| Invoice history UI (empty state for now) | P2 | Low |
| Payment method display area (placeholder) | P2 | Low |
| Add `payment_methods` table | P2 | Low |
| Add `invoices` table | P2 | Low |
| Add `subscription_events` table (audit log) | P2 | Low |

### Phase 4: Stripe Integration (Monetization)

**Scope:** Full payment processing with Stripe

| Task | Priority | Complexity |
|------|----------|------------|
| Create Stripe account and configure products | P3 | Low |
| Set up Stripe products/prices for each tier | P3 | Low |
| Deploy `create-checkout` Edge Function | P3 | Medium |
| Deploy `create-portal-session` Edge Function | P3 | Medium |
| Deploy `stripe-webhooks` Edge Function | P3 | High |
| Handle `customer.subscription.created` webhook | P3 | Medium |
| Handle `customer.subscription.updated` webhook | P3 | Medium |
| Handle `invoice.paid` webhook | P3 | Medium |
| Handle `invoice.payment_failed` webhook | P3 | Medium |
| Handle `customer.subscription.deleted` webhook | P3 | Medium |
| Connect checkout button to Stripe | P3 | Medium |
| Connect "Update Payment Method" to Stripe Portal | P3 | Low |
| Sync invoices from Stripe to database | P3 | Medium |
| Test upgrade/downgrade proration | P3 | Medium |
| Test payment failure → past_due → suspended flow | P3 | Medium |
| Email notifications for billing events | P3 | Medium |

### Phase 5: Invites & Team Management

**Scope:** Streamlined team onboarding

| Task | Priority | Complexity |
|------|----------|------------|
| Add `company_invites` table | P4 | Low |
| Admin invite UI (send invite by email) | P4 | Medium |
| Invite email templates (SendGrid/Resend) | P4 | Low |
| Invite acceptance flow (token validation) | P4 | Medium |
| Pending request notifications (in-app) | P4 | Medium |
| Email notifications for pending requests | P4 | Low |

### Phase 6: Enterprise Features (Scale)

**Scope:** Features for larger customers

| Task | Priority | Complexity |
|------|----------|------------|
| SSO integration (SAML/OIDC) | P5 | High |
| API key management | P5 | Medium |
| Custom tier pricing (manual setup) | P5 | Medium |
| Audit log export | P5 | Medium |
| Multi-region support | P5 | Very High |

### Implementation Notes

```
┌─────────────────────────────────────────────────────────────────┐
│                   IMPLEMENTATION ORDER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1-2: Can ship without payment processing                 │
│  ────────────────────────────────────────────────────────────── │
│  • Companies on "free" or "trial" tier                          │
│  • Admin can see plan but not change it                         │
│  • Manual upgrades (you set tier in database)                   │
│                                                                  │
│  Phase 3: UI ready, no real payments                             │
│  ────────────────────────────────────────────────────────────── │
│  • Billing portal looks complete                                │
│  • "Upgrade" sends email to you instead of charging            │
│  • Good for beta testing with real companies                   │
│                                                                  │
│  Phase 4: Real payments enabled                                  │
│  ────────────────────────────────────────────────────────────── │
│  • Stripe connected                                             │
│  • Automated monthly billing                                    │
│  • Self-service upgrades/downgrades                             │
│  • Invoice history populated                                    │
│                                                                  │
│  Recommendation: Complete Phase 1-3 first, then decide on      │
│  Phase 4 timing based on customer demand                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Estimate (Stripe)

```
┌─────────────────────────────────────────────────────────────────┐
│                   STRIPE COSTS                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Per Transaction:                                                │
│  • 2.9% + $0.30 per successful charge                           │
│                                                                  │
│  Example at 10 paying companies ($99/mo Pro):                   │
│  • Monthly revenue: $990                                        │
│  • Stripe fees: $990 × 2.9% + ($0.30 × 10) = $31.71            │
│  • Net: $958.29                                                 │
│                                                                  │
│  Example at 100 paying companies:                                │
│  • Monthly revenue: $9,900                                      │
│  • Stripe fees: ~$320                                           │
│  • Net: ~$9,580                                                 │
│                                                                  │
│  No monthly Stripe fees (pay-as-you-go)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Full Flow Diagrams

### Complete User Journey Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE USER JOURNEY MAP                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                           ┌─────────────┐                                    │
│                           │   Landing   │                                    │
│                           │   Screen    │                                    │
│                           └──────┬──────┘                                    │
│                                  │                                           │
│           ┌──────────────────────┼──────────────────────┐                    │
│           │                      │                      │                    │
│           ▼                      ▼                      ▼                    │
│    ┌────────────┐         ┌────────────┐         ┌────────────┐             │
│    │  Foreman   │         │   Office   │         │Get Started │             │
│    │  Access    │         │   Login    │         │            │             │
│    └─────┬──────┘         └─────┬──────┘         └─────┬──────┘             │
│          │                      │                      │                     │
│          ▼                      │            ┌─────────┴─────────┐          │
│    Company Code                 │            │                   │          │
│    + Project PIN                │            ▼                   ▼          │
│          │                      │     ┌────────────┐      ┌────────────┐    │
│          ▼                      │     │  Create    │      │   Join     │    │
│    Field App                    │     │  Company   │      │  Company   │    │
│    (T&M Entry)                  │     └─────┬──────┘      └─────┬──────┘    │
│                                 │           │                   │           │
│                                 │           ▼                   ▼           │
│                                 │     Your Info           Company Code      │
│                                 │     + Company Name      + Office Code     │
│                                 │           │                   │           │
│                                 │           ▼                   ▼           │
│                                 │     Select Plan         Your Info         │
│                                 │     (or Trial)               │           │
│                                 │           │                   ▼           │
│                                 │           │            ┌──────────────┐   │
│                                 │           │            │   Pending    │   │
│                                 │           │            │   Approval   │   │
│                                 │           │            └──────┬───────┘   │
│                                 │           │                   │           │
│                                 │           │         ┌─────────┴──────┐    │
│                                 │           │         │                │    │
│                                 │           │    (approved)       (rejected)│
│                                 │           │         │                │    │
│                                 │           ▼         ▼                ▼    │
│                                 │     ┌───────────────────┐     Try Again   │
│                                 └────►│                   │                 │
│                                       │    Dashboard      │◄────────────────┘
│                                       │                   │                  │
│                                       └─────────┬─────────┘                  │
│                                                 │                            │
│                      ┌──────────────────────────┴──────────────────────┐     │
│                      │                          │                      │     │
│                      ▼                          ▼                      ▼     │
│               ┌──────────┐              ┌──────────────┐        ┌──────────┐ │
│               │ Projects │              │     Team     │        │ Settings │ │
│               └──────────┘              │  Management  │        └──────────┘ │
│                                         └──────────────┘                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix B: Decision Summary

### Recommendation: Entry Point Architecture

**Decision:** Hybrid approach with unified entry screen

**Rationale:**
1. Single codebase, consistent experience
2. Clear progressive disclosure
3. Works for all user types
4. Mobile-friendly
5. No authentication fragmentation

### Recommendation: Company Creation

**Decision:** 2-step wizard with deferred plan selection

**Rationale:**
1. Minimal friction to start
2. Trial allows full exploration
3. Atomic transaction prevents orphans
4. Progressive commitment model

### Recommendation: Subscription Model

**Decision:** Trial-first with soft limits

**Rationale:**
1. Let users experience value before paying
2. Soft limits encourage upgrade without frustration
3. Decoupled billing doesn't block core functionality
4. Easy to integrate Stripe later

### Recommendation: Join Flow

**Decision:** Keep code-based + add admin invites

**Rationale:**
1. Current flow is secure and working
2. Invites provide better UX for known hires
3. Both methods serve different use cases
4. Invites auto-approve, reducing admin burden

---

**Document End**

*This architecture is designed to support FieldSync from 10 to 10,000+ companies without redesign. Implementation should proceed in phases, with Phase 1 being the minimum viable infrastructure.*
