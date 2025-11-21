import { PrismaClient } from '../generated/prisma/index.js';
import midtransClient from 'midtrans-client';

const prisma = new PrismaClient();

// Konfigurasi Core API (Bukan Snap) untuk verifikasi notifikasi
const apiClient = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

export const midtransNotification = async (req, res) => {
  try {
    // 1. Terima notifikasi JSON dari Midtrans
    const statusResponse = await apiClient.transaction.notification(req.body);
    
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Menerima Notifikasi untuk Order ID: ${orderId} | Status: ${transactionStatus}`);

    // 2. Ekstrak Payment ID dari Order ID
    // Format orderId kita sebelumnya: "JOBPOST-{id}-{timestamp}" atau "PAY-{id}-{timestamp}"
    // Kita ambil angka di tengah (index 1)
    const paymentIdStr = orderId.split('-')[1];
    const paymentId = parseInt(paymentIdStr);

    if (!paymentId) {
      return res.status(400).json({ message: "Invalid Order ID Format" });
    }

    // 3. Tentukan Status Akhir berdasarkan Respon Midtrans
    let newStatus = 'PENDING'; // Default

    if (transactionStatus == 'capture') {
      if (fraudStatus == 'challenge') {
        newStatus = 'PENDING'; // Masih ditinjau
      } else if (fraudStatus == 'accept') {
        newStatus = 'SUCCESS';
      }
    } else if (transactionStatus == 'settlement') {
      newStatus = 'SUCCESS'; // Uang sudah masuk
    } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
      newStatus = 'FAILED';
    } else if (transactionStatus == 'pending') {
      newStatus = 'PENDING';
    }

    // 4. Update Database Menggunakan Transaksi
    await prisma.$transaction(async (tx) => {
      
      // A. Update Tabel Payment
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: newStatus },
        include: { job: true } // Include Job untuk dicek nanti
      });

      // B. LOGIKA TAMBAHAN (Side Effects)
      // Jika Sukses & Tipe Payment adalah JOB_POST, ubah status Job jadi OPEN
      if (newStatus === 'SUCCESS') {
        
        if (updatedPayment.type === 'JOB_POST' && updatedPayment.job) {
          await tx.job.update({
            where: { id: updatedPayment.job.id },
            data: { status: 'OPEN' } // Lowongan Tayang!
          });
          console.log(`Job ID ${updatedPayment.job.id} sekarang OPEN.`);
        }

        // Jika nanti ada Subscription / Quota, tambahkan logikanya di sini
        // if (updatedPayment.type === 'QUEST_SUBSCRIPTION') { ... }
      }
      
      // Jika Gagal / Expired
      if (newStatus === 'FAILED' && updatedPayment.job) {
        await tx.job.update({
            where: { id: updatedPayment.job.id },
            data: { status: 'CLOSED' } // Atau tetap UNPAID
          });
      }
    });

    // 5. Response OK ke Midtrans (Wajib return 200 agar Midtrans tidak kirim ulang terus)
    return res.status(200).json({ message: "Notification processed" });

  } catch (error) {
    console.error("Midtrans Webhook Error:", error);
    // Tetap return 200 agar Midtrans tidak spam notifikasi jika errornya di sisi kita
    res.status(200).json({ message: "Error processing notification, but received." });
  }
};