import { PrismaClient } from "../generated/prisma/index.js"; // Sesuaikan path jika perlu

const prisma = new PrismaClient();

export const createQuest = async (req, res) => {
  try {
    const { 
      title, description, tier, 
      maxSubmissions, deadline, 
      quotaType // "SUBSCRIPTION" atau "ONE_TIME"
    } = req.body;
    
    const employerId = req.employerId;

    if (!title || !description || !tier || !quotaType) {
      return res.status(400).json({ message: "Data tidak lengkap." });
    }

    const result = await prisma.$transaction(async (tx) => {
      
      let usedSubId = null;
      let usedQuotaId = null;

      // ==========================================
      // OPSI A: SUBSCRIPTION (LANGGANAN)
      // ==========================================
      if (quotaType === 'SUBSCRIPTION') {
        const activeSub = await tx.subscriptionQuota.findFirst({
          where: { employerId: employerId, isActive: true }
        });

        if (!activeSub) throw new Error("Anda tidak memiliki langganan aktif.");
        if (new Date() > activeSub.renewsAt) {
          await tx.subscriptionQuota.update({
            where: { id: activeSub.id }, data: { isActive: false }
          });
          throw new Error("Langganan Anda sudah berakhir.");
        }
        if (activeSub.remaining <= 0) throw new Error("Kuota mingguan habis.");

        await tx.subscriptionQuota.update({
          where: { id: activeSub.id },
          data: { remaining: { decrement: 1 } }
        });
        usedSubId = activeSub.id;
      } 
      
      // ==========================================
      // OPSI B: ONE TIME QUOTA (Via Table Employer)
      // ==========================================
      else if (quotaType === 'ONE_TIME') {
        
        // 1. Cari Employer DAN Include data OneTimeQuota miliknya
        // Kita filter langsung di dalam include agar yang terambil hanya yang ada isinya
        const employerData = await tx.employer.findUnique({
          where: { id: employerId }, // Cari Employer berdasarkan ID
         
        });

        // 2. Validasi:
        // Cek apakah employer ada, dan apakah array oneTimeQuotas ada isinya
        if (!employerData || employerData.onetimeQuota <= 0) {
          throw new Error("Anda tidak memiliki saldo Kuota Satuan. Silakan beli dulu.");
        }

        

        // 3. Kurangi saldo kuota tersebut
        await tx.employer.update({
          where: { id: employerId },
          data: { onetimeQuota: { decrement: 1 } }
        });

        usedQuotaId = null;
      } else {
        throw new Error("Tipe kuota tidak valid.");
      }

      // ==========================================
      // 3. BUAT QUEST
      // ==========================================
      const newQuest = await tx.quest.create({
        data: {
          title, description, tier,
          maxSubmissions: maxSubmissions ? parseInt(maxSubmissions) : 10,
          deadline: deadline ? new Date(deadline) : null,
          employerId: employerId,
          usedSubscriptionQuotaId: usedSubId,
          usedOneTimeQuotaId: usedQuotaId
        }
      });

      return newQuest;
    });

    return res.status(201).json({
      message: "Quest berhasil diposting!",
      data: result
    });

  } catch (error) {
    console.error("Create Quest Error:", error);
    return res.status(400).json({ message: error.message || "Gagal membuat quest." });
  }
};

// ... import yang sudah ada

export const getAllQuests = async (req, res) => {
  try {
    const { search, tier, page = 1, limit = 10 } = req.query;

    // 1. Build Query
    const whereClause = {
      // Hanya tampilkan quest yang deadlinenya MASA DEPAN (atau tidak ada deadline)
      OR: [
        { deadline: { gt: new Date() } },
        { deadline: null }
      ]
    };

    if (search) {
      whereClause.title = {
        contains: search,
        
      };
    }

    if (tier) {
      whereClause.tier = tier; // ENTRY, MID, HIGH
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 2. Ambil Data
    const quests = await prisma.quest.findMany({
      where: whereClause,
      take: parseInt(limit),
      skip: skip,
      orderBy: { createdAt: 'desc' },
      include: {
        employer: {
          include: {
            user: { select: { name: true } } // Nama Pemberi Quest
          }
        },
        _count: { select: { submissions: true } } // Lihat berapa yang sudah submit
      }
    });

    const totalQuests = await prisma.quest.count({ where: whereClause });
console.log({ totalQuests, page, limit, quests });
    return res.status(200).json({
      message: "Berhasil mengambil daftar quest.",
      meta: {
        page: parseInt(page),
        totalData: totalQuests,
        totalPage: Math.ceil(totalQuests / parseInt(limit))
      },
      data: quests
    });

  } catch (error) {
    console.error("Get All Quests Error:", error);
    res.status(500).json({ message: "Server Error." });
  }
};