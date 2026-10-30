// ════════════════════════════════════════════════════════════════════════
// ATPL 100% FREE REALTIME MULTI-BROWSER SYNC (Zero Cost, No Paid Limits)
// ════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // 100% Free Public WebSocket Broker (Lifelong Free, No API key needed)
  const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
  const SYNC_TOPIC = "atpl/aroratextiles/erp_sync_channel_v1";
  const CLIENT_ID = "atpl_" + Math.random().toString(36).substring(2, 10);

  let client = null;
  let isConnecting = false;

  function initMqttSync() {
    if (typeof mqtt === "undefined") {
      setTimeout(initMqttSync, 400);
      return;
    }
    if (isConnecting || (client && client.connected)) return;
    isConnecting = true;

    try {
      client = mqtt.connect(BROKER_URL, {
        clientId: CLIENT_ID,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2500,
        keepalive: 60
      });

      client.on("connect", function () {
        isConnecting = false;
        console.log("⚡ [ATPL Realtime] Connected to Free Multi-Browser Broker!");
        client.subscribe(SYNC_TOPIC, { qos: 1 });
        if (window.showToast) {
          window.showToast("🟢 Live Cross-Browser Sync Active!");
        }
      });

      client.on("message", function (topic, message) {
        if (topic !== SYNC_TOPIC) return;
        try {
          const payload = JSON.parse(message.toString());
          if (!payload || payload.sender === CLIENT_ID) return; // Khud ka event ignore karo

          // ── ACTION 1: JAB DUSRE BROWSER SE FILE DELETE HO ──
          if (payload.action === "DELETE_FILE") {
            const fileName = payload.name;
            console.log("⚡ [Remote Sync] File Deleted by another browser:", fileName);

            // Memory se remove karo
            if (Array.isArray(window.FILES)) {
              window.FILES = window.FILES.filter(f => f && f.name !== fileName);
            }

            // Local IndexedDB se delete karo
            if (typeof DB !== "undefined" && DB) {
              try {
                const tx = DB.transaction(DB_STORE, "readwrite");
                tx.objectStore(DB_STORE).delete(fileName);
              } catch (e) {}
            }

            // Screen ko live update karo
            refreshUI();
            if (window.showToast) {
              window.showToast("🗑️ Dusre browser ne delete kiya: <b>" + fileName + "</b>");
            }
          }

          // ── ACTION 2: JAB DUSRE BROWSER SE FILE UPLOAD HO ──
          if (payload.action === "UPLOAD_FILE") {
            const fileName = payload.name;
            const b64Data = payload.buf;
            console.log("⚡ [Remote Sync] File Uploaded by another browser:", fileName);

            if (b64Data && typeof atplB64ToBuf === "function" && typeof parseWB === "function") {
              const buf = atplB64ToBuf(b64Data);
              const wb = parseWB(buf);
              const sheets = typeof wbToSheets === "function" ? wbToSheets(wb) : {};

              window.FILES = (window.FILES || []).filter(f => f && f.name !== fileName);
              window.FILES.push({
                name: fileName,
                wb: wb,
                sheets: sheets,
                buf: buf,
                fromDB: true,
                savedAt: payload.saved || new Date().toISOString()
              });

              // IndexedDB me save karo
              if (typeof DB !== "undefined" && DB) {
                try {
                  const tx = DB.transaction(DB_STORE, "readwrite");
                  tx.objectStore(DB_STORE).put({
                    name: fileName,
                    buf: buf,
                    saved: payload.saved || new Date().toISOString()
                  });
                } catch (e) {}
              }

              // Screen refresh
              refreshUI();
              if (window.showToast) {
                window.showToast("⚡ Dusre browser se live file aayi: <b>" + fileName + "</b>");
              }
            }
          }

          // ── ACTION 3: CLEAR ALL ──
          if (payload.action === "CLEAR_ALL") {
            window.FILES = [];
            if (typeof DB !== "undefined" && DB) {
              try {
                DB.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).clear();
              } catch (e) {}
            }
            refreshUI();
            if (window.showToast) {
              window.showToast("🗑️ Dusre browser ne saari files clear kar di.");
            }
          }

        } catch (err) {
          console.warn("[Sync Message Error]", err);
        }
      });

      client.on("error", function (err) {
        console.warn("[Sync Warning]", err);
        isConnecting = false;
      });

    } catch (e) {
      console.warn("MQTT init error:", e);
      isConnecting = false;
    }
  }

  function refreshUI() {
    if (typeof renderFiles === "function") renderFiles();
    if (typeof renderSheets === "function") renderSheets();
    if (typeof updStats === "function") updStats();
    if (typeof renderAllFilesPage === "function") renderAllFilesPage();
    if (typeof populateNJSelects === "function") populateNJSelects();
  }

  // ── HOOK: Jab aap is browser me file UPLOAD karein ──
  const originalSaveFileToDB = window.saveFileToDB;
  window.saveFileToDB = function (name, arrayBuf, cb) {
    if (typeof originalSaveFileToDB === "function") {
      originalSaveFileToDB(name, arrayBuf, cb);
    } else if (cb) {
      cb();
    }

    // Dusre browser ko turant bhej do
    if (client && client.connected && typeof atplBufToB64 === "function") {
      try {
        const b64 = atplBufToB64(arrayBuf);
        // Standard Excel files (under 1.5MB) turant sync honge
        if (b64 && b64.length < 2000000) {
          client.publish(SYNC_TOPIC, JSON.stringify({
            sender: CLIENT_ID,
            action: "UPLOAD_FILE",
            name: name,
            buf: b64,
            saved: new Date().toISOString()
          }), { qos: 1 });
        }
      } catch (err) {
        console.warn("Broadcast upload error:", err);
      }
    }
  };

  // ── HOOK: Jab aap is browser me DELETE button dabayein ──
  const originalDeleteFromDB = window.deleteFromDB;
  window.deleteFromDB = function (name, cb) {
    if (typeof originalDeleteFromDB === "function") {
      originalDeleteFromDB(name, cb);
    } else if (cb) {
      cb();
    }

    // Dusre browser ko delete signal bhej do
    if (client && client.connected) {
      try {
        client.publish(SYNC_TOPIC, JSON.stringify({
          sender: CLIENT_ID,
          action: "DELETE_FILE",
          name: name
        }), { qos: 1 });
      } catch (err) {
        console.warn("Broadcast delete error:", err);
      }
    }
  };

  // ── HOOK: Clear All ──
  const originalClearDB = window.clearDB;
  window.clearDB = function (cb) {
    if (typeof originalClearDB === "function") {
      originalClearDB(cb);
    } else if (cb) {
      cb();
    }
    if (client && client.connected) {
      try {
        client.publish(SYNC_TOPIC, JSON.stringify({
          sender: CLIENT_ID,
          action: "CLEAR_ALL"
        }), { qos: 1 });
      } catch (e) {}
    }
  };

  // Auto-start on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMqttSync);
  } else {
    initMqttSync();
  }
})();
