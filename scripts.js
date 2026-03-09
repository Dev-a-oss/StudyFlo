/**
 * ================================================================
 *  StudyFlow — scripts.js
 *  Firestore User Doc Cleanup Tool
 * ================================================================
 *
 *  HOW TO USE (two ways):
 *
 *  OPTION A — Run directly from DevTools console:
 *    1. Open your app at 127.0.0.1:5500 or vibe-jolt.web.app
 *    2. Make sure you are signed in
 *    3. Open DevTools → Console tab
 *    4. Copy-paste the function you want and run it
 *
 *  OPTION B — Add a temporary admin page:
 *    1. Create admin.html in your project
 *    2. Add: <script type="module" src="scripts.js"></script>
 *    3. Open it in browser, check console for output
 *    4. Delete admin.html after you're done
 *
 *  ALWAYS run auditUsers() first (read-only, safe)
 *  Then run cleanDuplicates() dry-run to preview
 *  Then run cleanDuplicates(false) to actually delete
 * ================================================================
 */

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, doc,
  getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const FB_CONFIG = {
  apiKey:            "AIzaSyA-4YyVROZz-OIAGTWhpMMpuJe2Xag9Fig",
  authDomain:        "vibe-jolt.firebaseapp.com",
  projectId:         "vibe-jolt",
  storageBucket:     "vibe-jolt.appspot.com",
  messagingSenderId: "386156754842",
  appId:             "1:386156754842:web:8b5e45a3c7f20ac9616c23"
};

const app  = initializeApp(FB_CONFIG, "scripts-tool");
const auth = getAuth(app);
const db   = getFirestore(app);

// ================================================================
//  HELPER
// ================================================================
function fmtDate(ms) {
  if (!ms) return "never";
  return new Date(ms).toLocaleString();
}

// ================================================================
//  1. AUDIT — read-only, shows every user doc and flags problems
// ================================================================
window.auditUsers = async function () {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📋  StudyFlow — User Doc Audit");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const snap = await getDocs(collection(db, "users"));
  const emailMap = {};   // email → array of {uid, name, msgs, ms}
  const noEmail  = [];

  snap.forEach(d => {
    const u     = d.data();
    const email = (u.email || "").toLowerCase().trim();
    const name  = u.displayName || u.name || "(unnamed)";
    const msgs  = u.messagesSent || 0;
    const ms    = u.lastActive?.seconds
                    ? u.lastActive.seconds * 1000
                    : (u.lastActive?.toDate ? u.lastActive.toDate().getTime() : 0);

    console.log(`%c UID: ${d.id}`, "font-weight:bold");
    console.log(`   Name:     ${name}`);
    console.log(`   Email:    ${email || "❌ MISSING"}`);
    console.log(`   Photo:    ${u.photoURL ? "✅ yes" : "❌ none"}`);
    console.log(`   Messages: ${msgs}`);
    console.log(`   Online:   ${u.isOnline ? "🟢 yes" : "⚫ no"}`);
    console.log(`   LastSeen: ${fmtDate(ms)}`);
    console.log(`   Premium:  ${u.isPremium ? "👑 yes" : "no"}`);
    console.log("");

    if (!email) { noEmail.push({ uid: d.id, name }); return; }

    if (!emailMap[email]) emailMap[email] = [];
    emailMap[email].push({ uid: d.id, name, msgs, ms });
  });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🔍  PROBLEMS FOUND");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let problems = 0;

  if (noEmail.length) {
    console.log(`❌ ${noEmail.length} doc(s) with NO email (ghost docs):`);
    noEmail.forEach(g => console.log(`   • ${g.uid}  "${g.name}"`));
    console.log("");
    problems += noEmail.length;
  }

  Object.entries(emailMap).forEach(([email, accounts]) => {
    if (accounts.length > 1) {
      console.log(`⚠️  Duplicate email: ${email} (${accounts.length} docs)`);
      accounts.forEach(a =>
        console.log(`   • ${a.uid}  "${a.name}"  msgs:${a.msgs}  last:${fmtDate(a.ms)}`)
      );
      console.log("");
      problems += accounts.length - 1;
    }
  });

  if (!problems) {
    console.log("✅ No problems found! All user docs look clean.");
  } else {
    console.log(`\n🚨 Total docs to clean: ${problems}`);
    console.log("Run cleanDuplicates() for a dry-run preview.");
    console.log("Run cleanDuplicates(false) to actually delete them.");
  }

  console.log(`\n📊 Total docs in Firestore: ${snap.size}`);
  return emailMap;
};

// ================================================================
//  2. CLEAN DUPLICATES
//     dryRun=true  → just shows what would be deleted (default)
//     dryRun=false → actually deletes ghost + duplicate docs
//
//  Logic:
//    • Docs with no email → DELETE (always ghost)
//    • Multiple docs for same email → keep the one with the
//      most messages (the real active account), DELETE the rest
//    • If tied on messages → keep most recently active
// ================================================================
window.cleanDuplicates = async function (dryRun = true) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (dryRun) {
    console.log("  🔍  DRY RUN — no changes will be made");
    console.log("  Call cleanDuplicates(false) to apply.");
  } else {
    console.log("  🚨  LIVE RUN — deleting docs now!");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const snap     = await getDocs(collection(db, "users"));
  const emailMap = {};
  const noEmail  = [];

  snap.forEach(d => {
    const u     = d.data();
    const email = (u.email || "").toLowerCase().trim();
    const name  = u.displayName || u.name || "(unnamed)";
    const msgs  = u.messagesSent || 0;
    const ms    = u.lastActive?.seconds
                    ? u.lastActive.seconds * 1000
                    : (u.lastActive?.toDate ? u.lastActive.toDate().getTime() : 0);
    const isPremium = u.isPremium === true;

    if (!email) { noEmail.push({ uid: d.id, name }); return; }

    if (!emailMap[email]) emailMap[email] = [];
    emailMap[email].push({ uid: d.id, name, msgs, ms, isPremium });
  });

  let deleteCount = 0;

  // ── Delete no-email ghost docs ──
  if (noEmail.length) {
    console.log(`🗑  Ghost docs (no email) — ${noEmail.length} found:`);
    for (const ghost of noEmail) {
      console.log(`   DELETE: ${ghost.uid}  "${ghost.name}"`);
      if (!dryRun) {
        await deleteDoc(doc(db, "users", ghost.uid));
        console.log(`   ✅ Deleted`);
      }
      deleteCount++;
    }
    console.log("");
  }

  // ── Deduplicate by email ──
  for (const [email, accounts] of Object.entries(emailMap)) {
    if (accounts.length <= 1) continue;

    // Sort: most messages first, then most recent, then premium first
    accounts.sort((a, b) => {
      if (b.msgs !== a.msgs) return b.msgs - a.msgs;
      if (b.ms   !== a.ms)   return b.ms   - a.ms;
      if (b.isPremium !== a.isPremium) return b.isPremium ? 1 : -1;
      return 0;
    });

    const keep    = accounts[0];
    const discard = accounts.slice(1);

    console.log(`⚠️  Duplicate: ${email}`);
    console.log(`   KEEP:   ${keep.uid}  "${keep.name}"  msgs:${keep.msgs}`);

    for (const dup of discard) {
      console.log(`   DELETE: ${dup.uid}  "${dup.name}"  msgs:${dup.msgs}`);
      if (!dryRun) {
        await deleteDoc(doc(db, "users", dup.uid));
        console.log(`   ✅ Deleted`);
      }
      deleteCount++;
    }
    console.log("");
  }

  if (deleteCount === 0) {
    console.log("✅ Nothing to clean — all docs look good!");
  } else {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (dryRun) {
      console.log(`🔍 Would delete ${deleteCount} doc(s). Run cleanDuplicates(false) to apply.`);
    } else {
      console.log(`✅ Deleted ${deleteCount} doc(s). Reload community.html to verify.`);
    }
  }
};

// ================================================================
//  3. FIX MY DOC
//     Repairs your own user doc if it has missing fields.
//     Safe to run any time — never touches isPremium.
// ================================================================
window.fixMyDoc = async function () {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        console.log("❌ Not signed in. Sign in first and try again.");
        return;
      }

      const ref      = doc(db, "users", user.uid);
      const existing = await getDoc(ref);
      const data     = existing.exists() ? existing.data() : {};

      const updates = {
        uid:         user.uid,
        email:       user.email || data.email || "",
        displayName: user.displayName || data.displayName || user.email?.split("@")[0] || "User",
        name:        user.displayName || data.name        || user.email?.split("@")[0] || "User",
        photoURL:    user.photoURL    || data.photoURL    || "",
        isOnline:    true,
        lastActive:  serverTimestamp(),
        // Only add these if completely missing — never overwrite premium
        ...(!data.messagesSent && data.messagesSent !== 0 && { messagesSent: 0 }),
        ...(!data.streak       && data.streak       !== 0 && { streak: 0 }),
        ...(!data.createdAt    && { createdAt: serverTimestamp() }),
      };

      await setDoc(ref, updates, { merge: true });

      console.log("✅ Your user doc has been repaired:");
      console.log(`   UID:     ${user.uid}`);
      console.log(`   Name:    ${updates.displayName}`);
      console.log(`   Email:   ${updates.email}`);
      console.log(`   Photo:   ${updates.photoURL ? "✅" : "❌ still missing (set in Google Account)"}`);
      resolve();
    });
  });
};

// ================================================================
//  4. RESET PRESENCE
//     Force all users to isOnline:false — useful if users are
//     stuck showing "Online" long after they've left.
//     dryRun=true (default) just shows who would be reset.
// ================================================================
window.resetAllPresence = async function (dryRun = true) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(dryRun
    ? "  🔍  DRY RUN — call resetAllPresence(false) to apply"
    : "  🚨  Resetting all online flags to false…"
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const snap = await getDocs(collection(db, "users"));
  let count = 0;

  for (const d of snap.docs) {
    const u = d.data();
    if (u.isOnline === true) {
      const name = u.displayName || u.name || d.id;
      console.log(`  ${dryRun ? "Would reset" : "Resetting"}: "${name}"  (${d.id})`);
      if (!dryRun) await updateDoc(doc(db, "users", d.id), { isOnline: false });
      count++;
    }
  }

  console.log(`\n${dryRun ? "Would reset" : "✅ Reset"} ${count} user(s) to offline.`);
  if (dryRun && count > 0) console.log("Run resetAllPresence(false) to apply.");
};

// ================================================================
//  5. NUKE USER DOC — delete ONE specific doc by UID
//     Use this when you know exactly which duplicate to remove.
//     Example: nukeUserDoc("abc123uid")
// ================================================================
window.nukeUserDoc = async function (uid) {
  if (!uid) { console.log("❌ Pass a UID. Example: nukeUserDoc('abc123')"); return; }
  const ref  = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) { console.log(`❌ No doc found for UID: ${uid}`); return; }
  const u = snap.data();
  console.log(`⚠️  About to delete:`);
  console.log(`   UID:   ${uid}`);
  console.log(`   Name:  ${u.displayName || u.name || "(unnamed)"}`);
  console.log(`   Email: ${u.email || "none"}`);
  const confirmed = window.confirm(`Delete user doc for "${u.displayName || uid}"? This cannot be undone.`);
  if (!confirmed) { console.log("❌ Cancelled."); return; }
  await deleteDoc(ref);
  console.log("✅ Deleted.");
};

// ================================================================
//  Ready
// ================================================================
console.log("%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "color:#818cf8");
console.log("%c  📦  StudyFlow scripts.js loaded", "color:#818cf8;font-weight:bold");
console.log("%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "color:#818cf8");
console.log("\nAvailable commands:\n");
console.log("  auditUsers()               → see all docs + flag problems (read-only)");
console.log("  cleanDuplicates()          → preview what would be deleted (dry run)");
console.log("  cleanDuplicates(false)     → delete duplicate + ghost docs");
console.log("  fixMyDoc()                 → repair your own user doc");
console.log("  resetAllPresence()         → preview online flag reset (dry run)");
console.log("  resetAllPresence(false)    → force all users to offline");
console.log("  nukeUserDoc('UID')         → delete one specific doc by UID");
console.log("\n👉 Start with: auditUsers()\n");