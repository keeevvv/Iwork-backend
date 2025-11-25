import { PrismaClient } from "../generated/prisma/index.js"; // Sesuaikan path jika perlu
import midtransClient from "midtrans-client";

const prisma = new PrismaClient();

// Konfigurasi Core API
const apiClient = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

export const midtransNotification = async (req, res) => {
  try {
    const statusResponse = await apiClient.transaction.notification(req.body);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(
      `Notifikasi Midtrans: ${orderId} | Status: ${transactionStatus}`
    );

    // Parsing ID dari Order ID (Format: TYPE-ID-TIMESTAMP)
    const paymentIdStr = orderId.split("-")[1];
    const paymentId = parseInt(paymentIdStr);

    if (isNaN(paymentId)) {
      return res.status(400).json({ message: "Invalid Payment ID" });
    }

    // Tentukan Status Baru
    let newStatus = "PENDING";
    if (transactionStatus == "capture" || transactionStatus == "settlement") {
      if (fraudStatus == "accept" || !fraudStatus) newStatus = "SUCCESS";
    } else if (
      transactionStatus == "cancel" ||
      transactionStatus == "deny" ||
      transactionStatus == "expire"
    ) {
      newStatus = "FAILED";
    }

    // --- MULAI TRANSAKSI DATABASE ---
    await prisma.$transaction(async (tx) => {
      // 1. Update Status Payment & Ambil Relasi
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: newStatus },
        include: {
          job: true,
          subscription: true,
          oneTimeQuota: true,
        },
      });

      // -----------------------------------------------------
      // 2. LOGIKA JIKA SUKSES (Uang Masuk)
      // -----------------------------------------------------
      if (newStatus === "SUCCESS") {
        // A. Job Posting: Status jadi OPEN
        if (updatedPayment.type === "JOB_POST" && updatedPayment.job) {
          await tx.job.update({
            where: { id: updatedPayment.job.id },
            data: { status: "OPEN" },
          });
          console.log(
            `[SUCCESS] Job ID ${updatedPayment.job.id} sekarang OPEN.`
          );
        }

        // B. Subscription: Aktifkan & Set Tanggal Renew
        if (
          updatedPayment.type === "QUEST_SUBSCRIPTION" &&
          updatedPayment.subscription
        ) {
          const now = new Date();

          // 1. Set Reset Kuota Mingguan (7 Hari dari sekarang)
          const nextResetDate = new Date(now);
          nextResetDate.setDate(now.getDate() + 7);

          // 2. Set Expired Langganan (28 Hari dari sekarang)
          // Sesuai request: renewsAt dipakai sebagai tanggal expired
          const expirationDate = new Date(now);
          expirationDate.setDate(now.getDate() + 28);

          await tx.subscriptionQuota.update({
            where: { id: updatedPayment.subscription.id },
            data: {
              isActive: true,
              resetAt: nextResetDate, // Jadwal reset kuota
              renewsAt: expirationDate, // Jadwal langganan mati
            },
          });

          console.log(
            `[SUCCESS] Sub ID ${updatedPayment.subscription.id} AKTIF. Expired: ${expirationDate}`
          );
        }

        // C. Quota Satuan: Tidak perlu update DB (karena saldo sudah diisi saat create)
        if (
          updatedPayment.type === "QUEST_QUOTA" &&
          updatedPayment.oneTimeQuota
        ) {
          await tx.oneTimeQuota.update({
            where: { id: updatedPayment.oneTimeQuota.id },
            data: { isActive: true },
          });

          await tx.employer.update({
            where: { id: updatedPayment.oneTimeQuota.employerId },
            data: {
              onetimeQuota: {
                increment: updatedPayment.oneTimeQuota.remaining, // Menambah saldo sesuai jumlah yang dibeli
              },
            },
          });

          console.log(
            `[SUCCESS] Quota ID ${updatedPayment.oneTimeQuota.id} BERHASIL dibeli.`
          );
        }
      }

      // -----------------------------------------------------
      // 3. LOGIKA JIKA GAGAL / EXPIRED (Uang Tidak Masuk)
      // -----------------------------------------------------
      if (newStatus === "FAILED") {
        // A. Job Posting: Status jadi CLOSED (atau biarkan UNPAID)
        if (updatedPayment.type === "JOB_POST" && updatedPayment.job) {
          await tx.job.update({
            where: { id: updatedPayment.job.id },
            data: { status: "CLOSED" }, // Tutup lowongan agar tidak muncul
          });
          console.log(
            `[FAILED] Job ID ${updatedPayment.job.id} ditutup (Gagal Bayar).`
          );
        }

        // B. Subscription: Pastikan Tetap Non-Aktif
        if (
          updatedPayment.type === "QUEST_SUBSCRIPTION" &&
          updatedPayment.subscription
        ) {
          await tx.subscriptionQuota.update({
            where: { id: updatedPayment.subscription.id },
            data: { isActive: false },
          });
          console.log(
            `[FAILED] Subscription ID ${updatedPayment.subscription.id} Gagal.`
          );
        }

        // C. Quota Satuan: WAJIB NOL-KAN SALDO (HANGUSKAN)
        // Karena saat create kita sudah isi saldo (misal: 5), kalau gagal harus di-reset jadi 0
        if (
          updatedPayment.type === "QUEST_QUOTA" &&
          updatedPayment.oneTimeQuota
        ) {
          await tx.oneTimeQuota.update({
            where: { id: updatedPayment.oneTimeQuota.id },
            data: { remaining: 0 },
          });
          console.log(
            `[FAILED] Quota ID ${updatedPayment.oneTimeQuota.id} dihapus saldonya (Gagal Bayar).`
          );
        }
      }
    });

    return res.status(200).json({ message: "Notification processed" });
  } catch (error) {
    console.error("Webhook Error:", error);
    // Selalu return 200 ke Midtrans agar tidak dikirim ulang terus menerus
    res.status(200).json({ message: "Error received but handled" });
  }
};
