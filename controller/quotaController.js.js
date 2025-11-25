import { PrismaClient } from '../generated/prisma/index.js';
import midtransClient from 'midtrans-client';

const prisma = new PrismaClient();

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

// Konfigurasi Harga per 1 Kuota Quest
const PRICE_PER_QUOTA = 15000; // Misal Rp 15.000 per quest

export const buyOneTimeQuota = async (req, res) => {
  try {
    const { quantity } = req.body; // User mau beli berapa biji?
    const userId = req.user.id;
    const employerId = req.employerId;

    // 1. Validasi Input
    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: "Minimal pembelian adalah 1 kuota." });
    }

    // 2. Hitung Total Harga
    const totalAmount = quantity * PRICE_PER_QUOTA;

    // 3. Transaksi Database (Create Quota + Payment)
    const result = await prisma.$transaction(async (tx) => {
      
      const newQuota = await tx.oneTimeQuota.create({
        data: {
          employer: { connect: { id: employerId } },
          remaining: parseInt(quantity), // Isi saldo kuota
          isActive: false,
          // Nested Write: Buat Payment sekalian
          payment: {
            create: {
              userId: userId,
              amount: totalAmount,
              type: 'QUEST_QUOTA', // Enum PaymentType
              status: 'PENDING'
            }
          }
        },
        include: { payment: true }
      });

      

      return { quota: newQuota, payment: newQuota.payment };
    });

    // 4. Request ke Midtrans
    const midtransOrderId = `QUOTA-${result.payment.id}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: totalAmount
      },
      customer_details: {
        first_name: req.user.name,
        email: req.user.email
      },
      item_details: [{
        id: "QUOTA-SATUAN",
        price: PRICE_PER_QUOTA,
        quantity: parseInt(quantity),
        name: `Beli ${quantity} Slot Quest`
      }]
    };

    const transaction = await snap.createTransaction(parameter);
     await prisma.payment.update({
      where: { id: result.payment.id },
      data: {
        snapToken: transaction.token,
        paymentUrl: transaction.redirect_url
      }
    });

    return res.status(201).json({
      message: "Order kuota berhasil dibuat.",
      data: {
        quantity: result.quota.remaining,
        totalPrice: totalAmount
      },
      payment: {
        redirect_url: transaction.redirect_url,
        token: transaction.token
      }
    });

  } catch (error) {
    console.error("Buy Quota Error:", error);
    res.status(500).json({ message: "Gagal memproses pembelian kuota." });
  }
};