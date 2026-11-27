import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  auth,
  db,
isAdminEmail,
  formatCurrency,
  formatDate,
  compressImage,
  escapeHtml,
  showToast,
  openReceiptModal
} from "./firebase.js";

import { initAdminDashboard, cleanupAdminDashboard } from "./dashboard.js";

let currentUserProfile = null;
let unsubscribeUserDoc = null;
let unsubscribeMyPayments = null;
let selectedReceiptBase64 = "";

// عناصر الواجهات الرئيسية
const loader = document.getElementById("app-loader");
const authView = document.getElementById("auth-view");
const clientView = document.getElementById("client-view");
const adminView = document.getElementById("admin-view");

function showOnlyView(viewEl) {
  authView.classList.add("hidden");
  clientView.classList.add("hidden");
  adminView.classList.add("hidden");
  viewEl.classList.remove("hidden");
  loader.classList.add("hidden");
}

function cleanupClientListeners() {
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc();
    unsubscribeUserDoc = null;
  }
  if (unsubscribeMyPayments) {
    unsubscribeMyPayments();
    unsubscribeMyPayments = null;
  }
}

// ==================== التبديل بين تسجيل الدخول وإنشاء الحساب ====================
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    document.getElementById("login-form").classList.toggle("hidden", !isLogin);
    document.getElementById("register-form").classList.toggle("hidden", isLogin);
  });
});
// ==================== إظهار / إخفاء كلمة المرور ====================
document.querySelectorAll(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "إخفاء" : "عرض";
  });
});
// ==================== تسجيل الدخول ====================
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("login-btn");

  btn.disabled = true;
  btn.textContent = "جارٍ الدخول...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("تم تسجيل الدخول بنجاح", "success");
  } catch (err) {
    console.error(err);
    showToast("البريد الإلكتروني أو كلمة المرور غير صحيحة", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "دخول";
  }
});

// ==================== إنشاء حساب عميل جديد ====================
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = document.getElementById("reg-name").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const unitName = document.getElementById("reg-unit").value.trim();
  const email = document.getElementById("reg-email").value.trim().toLowerCase();
  const password = document.getElementById("reg-password").value;
  const btn = document.getElementById("register-btn");

  if (isAdminEmail(email)) {
    showToast("هذا البريد مخصص للإدارة، استخدم تسجيل الدخول", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "جارٍ إنشاء الحساب...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      fullName,
      phone,
      unitName: unitName || "قيد التحديد من المالك",
      email,
      role: "client",
      totalAmount: 0,
      paidAmount: 0,
      nextPaymentAmount: 0,
      nextPaymentDate: "",
      createdAt: serverTimestamp()
    });
    showToast("تم إنشاء حسابك بنجاح", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/email-already-in-use") {
      showToast("هذا البريد الإلكتروني مسجل بالفعل", "error");
    } else if (err.code === "auth/invalid-email") {
      showToast("صيغة البريد الإلكتروني غير صحيحة", "error");
    } else if (err.code === "auth/weak-password") {
      showToast("كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل", "error");
    } else {
      showToast("تعذر إنشاء الحساب، حاول مرة أخرى", "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "إنشاء الحساب";
  }
});

// ==================== تسجيل الخروج ====================
document.querySelectorAll(".logout-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    cleanupClientListeners();
    cleanupAdminDashboard();
    await signOut(auth);
    showToast("تم تسجيل الخروج", "info");
  });
});

// ==================== مراقبة حالة المستخدم ====================
onAuthStateChanged(auth, async (user) => {
  cleanupClientListeners();
  cleanupAdminDashboard();

  if (!user) {
    currentUserProfile = null;
    showOnlyView(authView);
    return;
  }

  let userDocData = null;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) userDocData = snap.data();
  } catch (err) {
    console.error(err);
  }

const isAdmin = isAdminEmail(user.email) || userDocData?.role === "admin";
  if (isAdmin) {
    showOnlyView(adminView);
    initAdminDashboard();
  } else {
    showOnlyView(clientView);
    initClientPortal(user.uid);
  }
});

// ==================== واجهة العميل ====================
function initClientPortal(uid) {
  // متابعة بيانات حساب العميل لحظياً
  unsubscribeUserDoc = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    currentUserProfile = { id: snap.id, ...snap.data() };

    const total = Number(currentUserProfile.totalAmount) || 0;
    const paid = Number(currentUserProfile.paidAmount) || 0;
    const remaining = Math.max(0, total - paid);
    const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

    document.getElementById("client-greeting").textContent = `أهلاً، ${currentUserProfile.fullName || currentUserProfile.email}`;
    document.getElementById("client-unit-label").textContent = currentUserProfile.unitName || "";

    document.getElementById("client-next-amount").textContent = formatCurrency(currentUserProfile.nextPaymentAmount || 0);
    document.getElementById("client-next-date").textContent = formatDate(currentUserProfile.nextPaymentDate);

    document.getElementById("client-total").textContent = formatCurrency(total);
    document.getElementById("client-paid").textContent = formatCurrency(paid);
    document.getElementById("client-remaining").textContent = formatCurrency(remaining);

    document.getElementById("client-progress-text").textContent = `${percent}%`;
    document.getElementById("client-progress-bar").style.width = `${percent}%`;
  });

  // متابعة دفعات العميل لحظياً
  const q = query(collection(db, "payments"), where("userId", "==", uid));
  unsubscribeMyPayments = onSnapshot(q, (snapshot) => {
    const list = document.getElementById("client-payments-list");
    const payments = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    if (payments.length === 0) {
      list.innerHTML = `<p class="empty-state">لا توجد دفعات مسجلة حتى الآن.</p>`;
      return;
    }

    const statusBadge = {
      pending: `<span class="badge badge-pending">قيد المراجعة</span>`,
      approved: `<span class="badge badge-approved">تم التأكيد</span>`,
      rejected: `<span class="badge badge-rejected">مرفوض</span>`
    };

    list.innerHTML = payments.map((p) => `
      <div class="payment-item">
        <div class="payment-meta">
          <span class="payment-amount">${formatCurrency(p.amount)}</span>
          <span class="muted-text">
            ${escapeHtml(p.method || "")} • ${formatDate(p.createdAt)}
            ${p.note ? `• ${escapeHtml(p.note)}` : ""}
          </span>
        </div>
        <div class="payment-actions">
          ${statusBadge[p.status] || ""}
          ${p.receiptImage ? `<img src="${p.receiptImage}" class="receipt-thumb my-receipt-thumb" data-caption="${formatCurrency(p.amount)} - ${formatDate(p.createdAt)}" alt="إيصال" />` : ""}
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".my-receipt-thumb").forEach((img) => {
      img.addEventListener("click", () => openReceiptModal(img.src, img.dataset.caption));
    });
  });
}

// ==================== نافذة رفع الإيصال للعميل ====================
document.getElementById("open-payment-modal-btn").addEventListener("click", () => {
  const form = document.getElementById("payment-form");
  form.reset();
  selectedReceiptBase64 = "";
  document.getElementById("receipt-preview").classList.add("hidden");
  document.getElementById("upload-text").classList.remove("hidden");

  if (currentUserProfile?.nextPaymentAmount) {
    document.getElementById("pay-amount").value = currentUserProfile.nextPaymentAmount;
  }
  document.getElementById("payment-modal").classList.remove("hidden");
});

document.getElementById("pay-receipt").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    selectedReceiptBase64 = await compressImage(file);
    const preview = document.getElementById("receipt-preview");
    preview.src = selectedReceiptBase64;
    preview.classList.remove("hidden");
    document.getElementById("upload-text").classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("تعذر قراءة الصورة، جرب صورة أخرى", "error");
  }
});

document.getElementById("payment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedReceiptBase64) {
    showToast("يرجى إرفاق صورة إيصال الدفع", "error");
    return;
  }

  const amount = Number(document.getElementById("pay-amount").value);
  const method = document.getElementById("pay-method").value;
  const note = document.getElementById("pay-note").value.trim();
  const btn = document.getElementById("submit-payment-btn");

  btn.disabled = true;
  btn.textContent = "جارٍ الإرسال...";

  try {
    await addDoc(collection(db, "payments"), {
      userId: auth.currentUser.uid,
userName: currentUserProfile?.fullName || currentUserProfile?.email || "عميل",
      unitName: currentUserProfile?.unitName || "",
      amount,
      method,
      note,
      receiptImage: selectedReceiptBase64,
      status: "pending",
      createdAt: serverTimestamp()
    });

    document.getElementById("payment-modal").classList.add("hidden");
    showToast("تم إرسال الإيصال للمالك بنجاح", "success");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء إرسال الدفعة", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "إرسال الإيصال للمالك";
  }
});

// ==================== إغلاق جميع النوافذ المنبثقة ====================
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.closeModal).classList.add("hidden");
  });
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.add("hidden");
  });
});
