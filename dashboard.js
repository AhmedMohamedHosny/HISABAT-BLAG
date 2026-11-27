import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  db,
  formatCurrency,
  formatDate,
  escapeHtml,
  showToast,
  openReceiptModal
} from "./firebase.js";

let unsubscribeClients = null;
let unsubscribePayments = null;
let clientsData = [];
let paymentsData = [];
let listenersBound = false;

export function initAdminDashboard() {
  cleanupAdminDashboard();
  bindAdminUIEvents();

  // متابعة العملاء لحظياً
  unsubscribeClients = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      clientsData = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.role !== "admin");
      renderStats();
      renderClientsTable();
    },
    (err) => {
      console.error(err);
      showToast("تعذر تحميل قائمة العملاء", "error");
    }
  );

  // متابعة الإيصالات والدفعات لحظياً
  unsubscribePayments = onSnapshot(
    collection(db, "payments"),
    (snapshot) => {
      paymentsData = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() || 0;
          const tB = b.createdAt?.toMillis?.() || 0;
          return tB - tA;
        });
      renderStats();
      renderAdminPayments();
    },
    (err) => {
      console.error(err);
      showToast("تعذر تحميل طلبات الدفع", "error");
    }
  );
}

export function cleanupAdminDashboard() {
  if (unsubscribeClients) {
    unsubscribeClients();
    unsubscribeClients = null;
  }
  if (unsubscribePayments) {
    unsubscribePayments();
    unsubscribePayments = null;
  }
}

function bindAdminUIEvents() {
  if (listenersBound) return;
  listenersBound = true;

  // التنقل بين تبويبات لوحة التحكم
  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.adminTab;
      document.querySelectorAll("[data-admin-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.getElementById("admin-payments-section").classList.toggle("hidden", target !== "payments");
      document.getElementById("admin-clients-section").classList.toggle("hidden", target !== "clients");
    });
  });

  // فلتر الدفعات
  document.getElementById("payment-filter").addEventListener("change", renderAdminPayments);

  // البحث في العملاء
  document.getElementById("client-search").addEventListener("input", renderClientsTable);

  // حفظ تعديلات بيانات العميل
  document.getElementById("edit-client-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const uid = document.getElementById("edit-client-uid").value;
    const btn = document.getElementById("save-client-btn");
    btn.disabled = true;
    btn.textContent = "جارٍ الحفظ...";

    try {
      await updateDoc(doc(db, "users", uid), {
        unitName: document.getElementById("edit-unit").value.trim(),
        totalAmount: Number(document.getElementById("edit-total").value) || 0,
        paidAmount: Number(document.getElementById("edit-paid").value) || 0,
        nextPaymentAmount: Number(document.getElementById("edit-next-amount").value) || 0,
        nextPaymentDate: document.getElementById("edit-next-date").value || ""
      });
      document.getElementById("edit-client-modal").classList.add("hidden");
      showToast("تم تحديث بيانات العميل بنجاح", "success");
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء حفظ البيانات", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "حفظ التعديلات";
    }
  });
}

function renderStats() {
  const totalClients = clientsData.length;
  const totalCollected = clientsData.reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);
  const totalRemaining = clientsData.reduce((sum, c) => {
    const rem = Math.max(0, (Number(c.totalAmount) || 0) - (Number(c.paidAmount) || 0));
    return sum + rem;
  }, 0);
  const pendingCount = paymentsData.filter((p) => p.status === "pending").length;

  document.getElementById("admin-clients-count").textContent = totalClients;
  document.getElementById("admin-total-collected").textContent = formatCurrency(totalCollected);
  document.getElementById("admin-total-remaining").textContent = formatCurrency(totalRemaining);
  document.getElementById("admin-pending-count").textContent = pendingCount;

  const pill = document.getElementById("pending-pill");
  pill.textContent = pendingCount;
  pill.classList.toggle("hidden", pendingCount === 0);
}

function renderAdminPayments() {
  const container = document.getElementById("admin-payments-list");
  const filter = document.getElementById("payment-filter").value;

  const filtered = filter === "all"
    ? paymentsData
    : paymentsData.filter((p) => p.status === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state">لا توجد دفعات مطابقة لهذا التصنيف.</p>`;
    return;
  }

  container.innerHTML = filtered.map((p) => {
    const statusMap = {
      pending: `<span class="badge badge-pending">قيد المراجعة</span>`,
      approved: `<span class="badge badge-approved">تم التأكيد</span>`,
      rejected: `<span class="badge badge-rejected">مرفوض</span>`
    };

    const actionButtons = p.status === "pending"
      ? `
        <button class="btn btn-success btn-sm approve-pay-btn" data-id="${p.id}" data-uid="${p.userId}" data-amount="${p.amount}">تأكيد</button>
        <button class="btn btn-danger-outline btn-sm reject-pay-btn" data-id="${p.id}">رفض</button>
      `
      : "";

    return `
      <div class="payment-item">
        <div class="payment-meta">
          <div>
            <strong>${escapeHtml(p.userName || "عميل")}</strong>
            <span class="muted-text">• ${escapeHtml(p.unitName || "بدون وحدة")}</span>
          </div>
          <span class="payment-amount">${formatCurrency(p.amount)}</span>
          <span class="muted-text">
            ${escapeHtml(p.method || "")} • ${formatDate(p.createdAt)}
            ${p.note ? `• ${escapeHtml(p.note)}` : ""}
          </span>
        </div>

        <div class="payment-actions">
          ${statusMap[p.status] || ""}
          ${p.receiptImage ? `<img src="${p.receiptImage}" class="receipt-thumb view-receipt-btn" data-caption="إيصال ${escapeHtml(p.userName || "")} - ${formatCurrency(p.amount)}" alt="إيصال" />` : ""}
          ${actionButtons}
        </div>
      </div>
    `;
  }).join("");

  // ربط أزرار المعاينة والقبول والرفض
  container.querySelectorAll(".view-receipt-btn").forEach((img) => {
    img.addEventListener("click", () => openReceiptModal(img.src, img.dataset.caption));
  });

  container.querySelectorAll(".approve-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => approvePayment(btn.dataset.id, btn.dataset.uid, Number(btn.dataset.amount), btn));
  });

  container.querySelectorAll(".reject-pay-btn").forEach((btn) => {
    btn.addEventListener("click", () => rejectPayment(btn.dataset.id, btn));
  });
}

async function approvePayment(paymentId, userId, amount, btn) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "payments", paymentId), {
      status: "approved",
      reviewedAt: serverTimestamp()
    });
    await updateDoc(doc(db, "users", userId), {
      paidAmount: increment(amount)
    });
    showToast("تم تأكيد الدفعة وإضافتها لحساب العميل", "success");
  } catch (err) {
    console.error(err);
    showToast("تعذر تأكيد الدفعة", "error");
    btn.disabled = false;
  }
}

async function rejectPayment(paymentId, btn) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "payments", paymentId), {
      status: "rejected",
      reviewedAt: serverTimestamp()
    });
    showToast("تم رفض الإيصال", "info");
  } catch (err) {
    console.error(err);
    showToast("تعذر تنفيذ العملية", "error");
    btn.disabled = false;
  }
}

function renderClientsTable() {
  const tbody = document.getElementById("admin-clients-tbody");
  const queryText = document.getElementById("client-search").value.trim().toLowerCase();

  const filtered = clientsData.filter((c) => {
    if (!queryText) return true;
    return (
      (c.fullName || "").toLowerCase().includes(queryText) ||
      (c.unitName || "").toLowerCase().includes(queryText) ||
      (c.phone || "").toLowerCase().includes(queryText) ||
      (c.username || "").toLowerCase().includes(queryText)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">لا يوجد عملاء لعرضهم.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((c) => {
    const total = Number(c.totalAmount) || 0;
    const paid = Number(c.paidAmount) || 0;
    const remaining = Math.max(0, total - paid);

    return `
      <tr>
        <td>
          <strong>${escapeHtml(c.fullName || c.username)}</strong><br />
          <small class="muted-text">${escapeHtml(c.phone || "")} (${escapeHtml(c.username || "")})</small>
        </td>
        <td>${escapeHtml(c.unitName || "غير محددة")}</td>
        <td>${formatCurrency(total)}</td>
        <td class="text-success"><strong>${formatCurrency(paid)}</strong></td>
        <td class="text-danger">${formatCurrency(remaining)}</td>
        <td>
          ${c.nextPaymentAmount ? formatCurrency(c.nextPaymentAmount) : "-"}<br />
          <small class="muted-text">${formatDate(c.nextPaymentDate)}</small>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm edit-client-btn" data-uid="${c.id}">تعديل</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".edit-client-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditClientModal(btn.dataset.uid));
  });
}

function openEditClientModal(uid) {
  const client = clientsData.find((c) => c.id === uid);
  if (!client) return;

  document.getElementById("edit-client-uid").value = client.id;
  document.getElementById("edit-client-title").textContent = client.fullName || client.username;
  document.getElementById("edit-unit").value = client.unitName || "";
  document.getElementById("edit-total").value = client.totalAmount || 0;
  document.getElementById("edit-paid").value = client.paidAmount || 0;
  document.getElementById("edit-next-amount").value = client.nextPaymentAmount || "";
  document.getElementById("edit-next-date").value = client.nextPaymentDate || "";

  document.getElementById("edit-client-modal").classList.remove("hidden");
}
