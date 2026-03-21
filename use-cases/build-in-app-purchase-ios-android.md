---
title: "Build In-App Purchases for iOS and Android"
description: "Add subscriptions, one-time purchases, and consumables to your React Native app using RevenueCat — with paywall UI, entitlement gating, and receipt validation."
skills: [expo-router]
difficulty: intermediate
time_estimate: "8 hours"
tags: [mobile, ios, android, monetization, revenuecat, subscriptions, expo, react-native]
---

# Build In-App Purchases for iOS and Android

## The Problem

You've built a solid free app with 10,000 users. Time to monetize — but iOS StoreKit and Android Billing are notoriously complex, and you don't want to maintain separate receipt validation servers. RevenueCat handles the hard parts.

## What You'll Build

- RevenueCat SDK integrated into a React Native / Expo app
- Products: monthly subscription, annual (with discount), one-time lifetime, consumable credits
- Paywall UI with trial badge, featured plan highlight, and feature comparison
- Entitlement checks to gate premium screens
- Restore purchases and subscription status sync

## Persona

**Dmitri, indie developer** — has a meditation app with 12k downloads, 0 revenue. Wants to go from zero to subscription revenue in a weekend without touching App Store Connect more than necessary.

---

## Architecture

```
React Native App (Expo Router)
│
├── RevenueCat SDK (Purchases)
│   ├── iOS: StoreKit 2 (auto-handled)
│   └── Android: Billing v6 (auto-handled)
│
├── Entitlements defined in RC Dashboard
│   └── "premium" → unlocks all paid features
│
└── Paywall screen
    ├── Fetch offerings from RC
    └── Present purchase sheet
```

---

## Step 1: Install & Configure RevenueCat

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

```typescript
// app/_layout.tsx
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { useEffect } from "react";
import { Platform } from "react-native";

const RC_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY!,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY!,
})!;

export default function RootLayout() {
  useEffect(() => {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: RC_API_KEY });
  }, []);

  // ... rest of layout
}
```

---

## Step 2: Entitlement Check Hook

```typescript
// hooks/usePremium.ts
import Purchases, { CustomerInfo } from "react-native-purchases";
import { useState, useEffect } from "react";

export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const info: CustomerInfo = await Purchases.getCustomerInfo();
      setIsPremium(info.entitlements.active["premium"] !== undefined);
      setLoading(false);
    }
    check();

    // Listen for realtime updates (e.g. after purchase)
    Purchases.addCustomerInfoUpdateListener((info) => {
      setIsPremium(info.entitlements.active["premium"] !== undefined);
    });
  }, []);

  return { isPremium, loading };
}
```

---

## Step 3: Paywall Screen

```typescript
// app/paywall.tsx
import Purchases, { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function PaywallScreen() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    Purchases.getOfferings().then(({ current }) => setOffering(current));
  }, []);

  async function handlePurchase(pkg: PurchasesPackage) {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active["premium"]) {
        router.replace("/(app)/home");
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        alert("Purchase failed: " + e.message);
      }
    }
  }

  const monthly = offering?.monthly;
  const annual = offering?.annual;

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Go Premium</Text>
      <Text style={styles.subheadline}>Unlock all features. Cancel anytime.</Text>

      {/* Feature list */}
      {["Unlimited sessions", "Advanced analytics", "Priority support"].map(f => (
        <Text key={f} style={styles.feature}>✓ {f}</Text>
      ))}

      {/* Plan selector */}
      <View style={styles.plans}>
        {annual && (
          <TouchableOpacity
            style={[styles.plan, selected === "annual" && styles.planSelected]}
            onPress={() => setSelected("annual")}
          >
            <View style={styles.badge}><Text style={styles.badgeText}>BEST VALUE</Text></View>
            <Text style={styles.planTitle}>Annual</Text>
            <Text style={styles.planPrice}>{annual.product.priceString} / year</Text>
            <Text style={styles.planSub}>
              {annual.product.introPrice ? `${annual.product.introPrice.priceString} free trial` : ""}
            </Text>
          </TouchableOpacity>
        )}

        {monthly && (
          <TouchableOpacity
            style={[styles.plan, selected === "monthly" && styles.planSelected]}
            onPress={() => setSelected("monthly")}
          >
            <Text style={styles.planTitle}>Monthly</Text>
            <Text style={styles.planPrice}>{monthly.product.priceString} / month</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => handlePurchase(selected === "annual" ? annual! : monthly!)}
      >
        <Text style={styles.ctaText}>Start Free Trial</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => Purchases.restorePurchases()}>
        <Text style={styles.restore}>Restore purchases</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#0f0f0f" },
  headline: { fontSize: 28, fontWeight: "700", color: "#fff", textAlign: "center" },
  subheadline: { fontSize: 16, color: "#aaa", textAlign: "center", marginBottom: 24 },
  feature: { color: "#c9ffc9", fontSize: 16, marginVertical: 4 },
  plans: { flexDirection: "row", gap: 12, marginVertical: 24 },
  plan: { flex: 1, borderRadius: 12, borderWidth: 2, borderColor: "#333", padding: 16 },
  planSelected: { borderColor: "#6366f1" },
  badge: { backgroundColor: "#6366f1", borderRadius: 4, paddingHorizontal: 6, alignSelf: "flex-start" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  planTitle: { color: "#fff", fontWeight: "600", marginTop: 8 },
  planPrice: { color: "#fff", fontSize: 20, fontWeight: "700" },
  planSub: { color: "#aaa", fontSize: 12 },
  cta: { backgroundColor: "#6366f1", padding: 18, borderRadius: 12, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  restore: { color: "#666", textAlign: "center", marginTop: 16 },
});
```

---

## Step 4: Gate Premium Content

```typescript
// app/(app)/advanced-analytics.tsx
import { usePremium } from "@/hooks/usePremium";
import { router } from "expo-router";
import { useEffect } from "react";

export default function AdvancedAnalytics() {
  const { isPremium, loading } = usePremium();

  useEffect(() => {
    if (!loading && !isPremium) {
      router.replace("/paywall");
    }
  }, [isPremium, loading]);

  if (loading) return null;
  return <AnalyticsDashboard />;
}
```

---

## What's Next

- Add consumables (e.g., AI credits) with `purchaseProduct`
- Webhook from RevenueCat → your server to sync subscriber state
- A/B test paywall copy with RC Experiments
- Promotional offers for churned subscribers
