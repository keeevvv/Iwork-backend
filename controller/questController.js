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

// ============================================
// 1. START QUEST (Menandai status IN_PROGRESS)
// ============================================
export const startQuest = async (req, res) => {
  try {
    const { questId } = req.params;
    const workerId = req.workerId; // Dari middleware verifyWorker

    // Cek apakah quest ada
    const quest = await prisma.quest.findUnique({
      where: { id: parseInt(questId) }
    });

    if (!quest) {
      return res.status(404).json({ message: "Quest tidak ditemukan." });
    }

    // Cek apakah sudah pernah ambil
    const existingSubmission = await prisma.questSubmission.findFirst({
      where: {
        questId: parseInt(questId),
        workerId: workerId
      }
    });

    if (existingSubmission) {
      return res.status(400).json({ message: "Anda sudah mengambil quest ini." });
    }

    // Cek apakah kuota submission sudah penuh
    if (quest.maxSubmissions) {
      const submissionCount = await prisma.questSubmission.count({
        where: { questId: parseInt(questId) }
      });

      if (submissionCount >= quest.maxSubmissions) {
        return res.status(400).json({ message: "Kuota submission untuk quest ini sudah penuh." });
      }
    }

    // Create submission dengan status IN_PROGRESS
    const submission = await prisma.questSubmission.create({
      data: {
        questId: parseInt(questId),
        workerId: workerId,
        status: 'IN_PROGRESS',
        fileUrl: null,
        isApproved: null
      }
    });

    return res.status(201).json({
      message: "Quest berhasil diambil! Status: IN PROGRESS.",
      data: submission
    });

  } catch (error) {
    console.error("Start Quest Error:", error);
    return res.status(500).json({ message: "Gagal mengambil quest." });
  }
};

// ============================================
// 2. SUBMIT QUEST (Upload File)
// ============================================
export const submitQuest = async (req, res) => {
  try {
    const { questId } = req.params;
    const workerId = req.workerId;
    const file = req.file; // Dari multer

    if (!file) {
      return res.status(400).json({ message: "File bukti pengerjaan harus diupload." });
    }

    const submission = await prisma.questSubmission.findFirst({
      where: {
        questId: parseInt(questId),
        workerId: workerId
      },
      include: { quest: true }
    });

    if (!submission) {
      return res.status(404).json({ message: "Anda belum mengambil quest ini." });
    }

    // Cek Deadline
    const now = new Date();
    const deadline = submission.quest.deadline;
    let finalStatus = 'COMPLETED';

    if (deadline && now > deadline) {
      finalStatus = 'OVERDUE';
    }

    // Construct File URL (Assuming public folder served statically, or full URL)
    // Di sini kita simpan relativa path saja atau full url jika ada domain config
    const fileUrl = `/public/${file.filename}`;

    const updatedSubmission = await prisma.questSubmission.update({
      where: { id: submission.id },
      data: {
        status: finalStatus,
        fileUrl: fileUrl,
        submittedAt: now
      }
    });

    return res.status(200).json({
      message: `Quest berhasil disubmit! Status: ${finalStatus}`,
      data: updatedSubmission
    });

  } catch (error) {
    console.error("Submit Quest Error:", error);
    return res.status(500).json({ message: "Gagal submit quest." });
  }
};

// ============================================
// 3. ASSESS SUBMISSION (Employer Menilai)
// ============================================
export const assessSubmission = async (req, res) => {
  try {
    const { id } = req.params; // Submission ID
    const employerId = req.employerId;
    const { isApproved, rating, feedback } = req.body; // isApproved: true/false

    if (typeof isApproved !== 'boolean') {
      return res.status(400).json({ message: "Status approval harus boolean." });
    }

    // Cek submission & hak akses employer (apakah quest ini milik employer ini?)
    const submission = await prisma.questSubmission.findUnique({
      where: { id: parseInt(id) },
      include: {
        quest: true
      }
    });

    if (!submission) {
      return res.status(404).json({ message: "Submission tidak ditemukan." });
    }

    if (submission.quest.employerId !== employerId) {
      return res.status(403).json({ message: "Anda tidak berhak menilai submission ini." });
    }

    // Update Submission
    // Jika Approved: true -> Wajib rating & feedback
    if (isApproved) {
      if (!rating || !feedback) {
        return res.status(400).json({ message: "Rating dan Feedback wajib diisi jika menerima quest." });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.questSubmission.update({
        where: { id: parseInt(id) },
        data: {
          isApproved: isApproved,
          rating: isApproved ? rating : null,
          feedback: isApproved ? feedback : null
        }
      });

      // Jika Approved, Masukkan ke Portfolio
      // Cek dulu udah ada portfolio belum (untuk mencegah duplikat jika dinilai ulang)
      if (isApproved) {
        const existingPortfolio = await tx.portfolio.findFirst({
          where: { submissionId: updated.id }
        });

        if (!existingPortfolio) {
          await tx.portfolio.create({
            data: {
              workerId: submission.workerId,
              questId: submission.questId,
              submissionId: submission.id,
              points: 10 // Poin default, atau hitung berdasarkan rating
            }
          });
        }
      }

      return updated;
    });

    return res.status(200).json({
      message: isApproved ? "Pekerjaan diterima!" : "Pekerjaan ditolak.",
      data: result
    });

  } catch (error) {
    console.error("Assess Submission Error:", error);
    return res.status(500).json({ message: "Gagal menilai submission." });
  }
};