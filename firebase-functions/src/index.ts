// Firestore trigger: a new `notifications` doc (a bell entry) is pushed to
// every device its recipient registered under users/{uid}/pushDevices. Runs
// once per database the app writes to, so QA exercises the same path as prod.
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import webpush from "web-push";
import {
  dispatchNotification,
  type BellNotification,
  type DispatchDeps,
  type PushDevice,
  type RegisteredDevice,
} from "./dispatch";
import { expoSender, webPushSender } from "./transports";

initializeApp();

const EXPO_ACCESS_TOKEN = defineSecret("EXPO_ACCESS_TOKEN");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
// Public half of the Web Push (VAPID) pair — must match WEB_PUSH_PUBLIC_KEY in
// src/lib/webPush.ts; rotating one without the other breaks browser push. The
// private half is the VAPID_PRIVATE_KEY secret.
const VAPID_PUBLIC_KEY =
  "BESowlSRnYT2GRypWx6vPeMIyX0VaHY-UsgEDbwtBX_oN30MVpw1uXDrunyXnOdHmlh4PDnl5Mq-4iSrBV3E9IM";
const VAPID_SUBJECT = "https://cisa-campus-work-tracker.pages.dev";

/** Legacy single-token field native builds before per-device registration
 *  wrote; still read so those installs keep buzzing until they update. */
const LEGACY_DEVICE_ID = "legacy-pushToken";

function isPushDevice(d: FirebaseFirestore.DocumentData): d is PushDevice {
  if (d.kind === "expo") return typeof d.token === "string";
  if (d.kind === "web") return typeof d.endpoint === "string" && typeof d.keys?.p256dh === "string" && typeof d.keys?.auth === "string";
  return false;
}

function firestoreDeps(db: Firestore): Omit<DispatchDeps, "send"> {
  return {
    async fullTimerIds() {
      const snap = await db.collection("users").where("role", "==", "admin").get();
      return snap.docs.map((d) => d.id);
    },
    async devicesOf(uid) {
      const [userSnap, devicesSnap] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("users").doc(uid).collection("pushDevices").get(),
      ]);
      const devices: RegisteredDevice[] = [];
      for (const d of devicesSnap.docs) {
        const data = d.data();
        if (isPushDevice(data)) devices.push({ id: d.id, device: data });
      }
      const legacy = userSnap.data()?.pushToken;
      if (typeof legacy === "string" && legacy && !devices.some((d) => d.device.kind === "expo" && d.device.token === legacy)) {
        devices.push({ id: LEGACY_DEVICE_ID, device: { kind: "expo", token: legacy } });
      }
      return devices;
    },
    async claimCoalesce(uid, key, windowMs) {
      // A transaction, because two bell entries for one contact are often
      // written in the same instant (a stakeholder fan-out) and both would
      // otherwise read "not yet pushed".
      const ref = db.collection("pushThrottle").doc(uid);
      return db.runTransaction(async (tx) => {
        const last = (await tx.get(ref)).data()?.[key];
        const lastMs = typeof last === "string" ? Date.parse(last) : NaN;
        if (!Number.isNaN(lastMs) && Date.now() - lastMs < windowMs) return false;
        tx.set(ref, { [key]: new Date().toISOString() }, { merge: true });
        return true;
      });
    },
    async removeDevice(uid, deviceId) {
      if (deviceId === LEGACY_DEVICE_ID) {
        await db.collection("users").doc(uid).update({ pushToken: FieldValue.delete() });
      } else {
        await db.collection("users").doc(uid).collection("pushDevices").doc(deviceId).delete();
      }
    },
  };
}

function liveSender(): DispatchDeps["send"] {
  const expo = expoSender(fetch, EXPO_ACCESS_TOKEN.value() || undefined);
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
  const web = webPushSender(webpush);
  return (_uid, device, payload) => (device.kind === "expo" ? expo(device.token, payload) : web(device, payload));
}

/** Under the emulator nothing leaves the machine: each push is recorded in
 *  `pushSink` instead, which is what the e2e suite asserts against. */
function sinkSender(db: Firestore): DispatchDeps["send"] {
  return async (uid, device, payload) => {
    await db.collection("pushSink").add({
      uid,
      kind: device.kind,
      address: device.kind === "expo" ? device.token : device.endpoint,
      ...payload,
      at: FieldValue.serverTimestamp(),
    });
    return "ok";
  };
}

function triggerFor(database: string) {
  return onDocumentCreated(
    {
      document: "notifications/{notificationId}",
      database,
      region: "us-east1",
      secrets: [EXPO_ACCESS_TOKEN, VAPID_PRIVATE_KEY],
    },
    async (event) => {
      const data = event.data?.data();
      if (!data || typeof data.userId !== "string" || typeof data.title !== "string") return;
      const db = getFirestore(database);
      const deps: DispatchDeps = {
        ...firestoreDeps(db),
        send: process.env.FUNCTIONS_EMULATOR === "true" ? sinkSender(db) : liveSender(),
      };
      const notification: BellNotification = {
        id: event.params.notificationId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
        targetId: data.targetId,
        coalesceKey: data.coalesceKey,
      };
      const result = await dispatchNotification(notification, deps);
      console.log(`notification ${notification.id} pushed`, result);
    },
  );
}

export const pushBellProd = triggerFor("prod");
export const pushBellQa = triggerFor("qa-db");
// The web app talks to the emulator's (default) database (src/lib/firebase.ts).
// The live project has no (default) database, so this exists only there.
export const pushBellEmulator = process.env.FUNCTIONS_EMULATOR === "true" ? triggerFor("(default)") : undefined;
