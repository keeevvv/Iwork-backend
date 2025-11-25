import cron from 'node-cron';
import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

const checkSubscriptions = async () => {
  console.log('🔄 [CRON] Cek Langganan & Reset Kuota...');
  
  const now = new Date();

  try {
    // Ambil semua yang masih AKTIF
    const activeSubs = await prisma.subscriptionQuota.findMany({
      where: { isActive: true }
    });

    for (const sub of activeSubs) {
      
      // -----------------------------------------------------------
      // LOGIKA 1: CEK EXPIRED (Berdasarkan field 'renewsAt')
      // -----------------------------------------------------------
      // Jika hari ini sudah melewati renewsAt, berarti langganan mati.
      if (now > new Date(sub.renewsAt)) {
        
        await prisma.subscriptionQuota.update({
          where: { id: sub.id },
          data: { 
            isActive: false,
            remaining: 0 // Kosongkan kuota karena sudah mati
          }
        });
        console.log(`❌ [EXPIRED] Sub ID ${sub.id} masa aktif berakhir.`);
        
        // Skip ke user berikutnya (karena sudah mati, gak perlu reset kuota)
        continue; 
      }

      // -----------------------------------------------------------
      // LOGIKA 2: CEK RESET KUOTA (Berdasarkan field 'resetAt')
      // -----------------------------------------------------------
      // Cek apakah resetAt tidak null DAN hari ini sudah waktunya reset?
      if (sub.resetAt && now >= new Date(sub.resetAt)) {
        
        // Jadwalkan reset berikutnya (7 hari lagi)
        const nextReset = new Date(sub.resetAt);
        nextReset.setDate(nextReset.getDate() + 7);

        await prisma.subscriptionQuota.update({
          where: { id: sub.id },
          data: {
            remaining: sub.weeklyQuota, // Refill kuota jadi penuh
            resetAt: nextReset          // Update jadwal reset berikutnya
          }
        });

        console.log(`✅ [RESET] Sub ID ${sub.id} kuota di-refill kembali.`);
      }
    }

  } catch (error) {
    console.error('Error Cron Job:', error);
  }
};

export const initCronJob = () => {
  // Jalan setiap hari jam 00:01
  cron.schedule('1 0 * * *', async() => {
    await checkSubscriptions();
  });
  console.log('⏰ Cron Job Scheduler Berjalan.');
};