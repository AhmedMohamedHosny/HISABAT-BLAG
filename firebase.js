import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwHPCjzdAo3KlpccOtOv4g3L6HyW1sxG8",
  authDomain: "hisabat-omar.firebaseapp.com",
  projectId: "hisabat-omar",
  storageBucket: "hisabat-omar.firebasestorage.app",
  messagingSenderId: "552440987524",
  appId: "1:552440987524:web:bfb5cac95d0b616093e7d1",
  measurementId: "G-XY1GJP41X0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// أسماء المستخدمين الخاصة بالمالك (يمكنك إضافة أكثر من اسم هنا)
export const ADMIN_USERNAMES = ["admin", "omar"];
const EMAIL_DOMAIN = "hisabat-omar.app";

export function usernameToEmail(username) {
  const clean = username.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return `${clean}@${EMAIL_DOMAIN}`;
}

export function emailToUsername(email) {
  if (!email) return "";
  return email.split("@")[0].toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,25}$/.test(username.trim());
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("ar-EG").format(num) + " ج.م";
}

export function formatDate(dateStr) {
  if (!dateStr) return "غير محدد";
  const date = typeof dateStr?.toDate === "function" ? dateStr.toDate() : new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ضغط صورة الإيصال قبل الحفظ لتكون سريعة وخفيفة وواضحة
export function compressImage(file, maxWidth = 900, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// إشعارات بسيطة وسريعة (Toast)
let toastTimer = null;
export function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// عرض صورة الإيصال بحجم كامل
export function openReceiptModal(src, caption = "") {
  const modal = document.getElementById("receipt-modal");
  const img = document.getElementById("receipt-modal-img");
  const cap = document.getElementById("receipt-modal-caption");
  if (!modal || !img) return;
  img.src = src;
  cap.textContent = caption;
  modal.classList.remove("hidden");
}
