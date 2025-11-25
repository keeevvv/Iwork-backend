import { PrismaClient } from '../generated/prisma/index.js';
import midtransClient from 'midtrans-client';

const prisma = new PrismaClient();

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

// KONFIGURASI PAKET LANGGANAN
const SUBSCRIPTION_PLANS = {
  ENTRY: { price: 100000, quota: 5,  name: "Entry Tier (5 Quest/Week)" },
  MID:   { price: 250000, quota: 20, name: "Mid Tier (20 Quest/Week)" },
  HIGH:  { price: 750000, quota: 100,name: "High Tier (100 Quest/Week)" }
};

export const buySubscription = async (req, res) => {
  try {
    const { tier } = req.body; // ENTRY, MID, atau HIGH
    const userId = req.user.id;
    const employerId = req.employerId;

    // 1. Validasi Tier
    const selectedPlan = SUBSCRIPTION_PLANS[tier];
    if (!selectedPlan) {
      return res.status(400).json({ 
        message: "Paket tidak valid. Pilih: ENTRY, MID, atau HIGH" 
      });
    }

    // 2. Cek apakah sudah punya langganan aktif? (Opsional)
    // Untuk simpelnya, kita tolak jika masih ada yang aktif
    const activeSub = await prisma.subscriptionQuota.findFirst({
      where: { employerId: employerId, isActive: true }
    });

    if (activeSub) {
      return res.status(400).json({ message: "Anda masih memiliki langganan aktif." });
    }

    // 3. Transaksi Database (Create Sub + Payment)
    const result = await prisma.$transaction(async (tx) => {
      
      const newSub = await tx.subscriptionQuota.create({
        data: {
          // 1. Data Subscription
          tier: tier,
          weeklyQuota: selectedPlan.quota,
          remaining: selectedPlan.quota,
          isActive: false,
          renewsAt: new Date(),
          
          // 2. Hubungkan ke Employer
          employer: {
            connect: { id: employerId }
          },

          // 3. BUAT PAYMENT SEKALIGUS DI SINI (Nested Create)
          // Karena Subscription WAJIB punya Payment, kita create payment-nya di sini
          payment: {
            create: {
              userId: userId,
              amount: selectedPlan.price,
              type: 'QUEST_SUBSCRIPTION',
              status: 'PENDING'
            }
          }
        },
        // Include Payment agar kita bisa dapat ID Payment untuk Midtrans
        include: {
          payment: true
        }
      });

      // Return format yang sama supaya kode di bawahnya tidak error
      return { sub: newSub, payment: newSub.payment };
    });

    // 4. Midtrans Request
    const midtransOrderId = `SUBS-${result.payment.id}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: selectedPlan.price
      },
      customer_details: {
        first_name: req.user.name,
        email: req.user.email
      },
      item_details: [{
        id: `SUB-${tier}`,
        price: selectedPlan.price,
        quantity: 1,
        name: selectedPlan.name
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
      message: "Order langganan dibuat. Silakan bayar.",
      data: {
        plan: selectedPlan.name,
        amount: selectedPlan.price
      },
      payment: {
        redirect_url: transaction.redirect_url,
        token: transaction.token
      }
    });

  } catch (error) {
    console.error("Buy Sub Error:", error);
    res.status(500).json({ message: "Gagal memproses langganan." });
  }
};