import { PrismaClient } from '../generated/prisma/index.js';


const prisma = new PrismaClient();

// ========================================================
// BAGIAN 1: WORKER MELAMAR KERJA
// ========================================================
export const applyJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const workerId = req.workerId; 
    
    // (Tidak ada req.body lagi karena resume pakai portfolio internal)

    // 1. Validasi Job (Cek Payment, Deadline, Kuota)
    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: { 
        payment: true, 
        _count: { select: { applications: true } }
      }
    });

    if (!job) return res.status(404).json({ message: "Lowongan tidak ditemukan." });
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ message: "Lowongan belum dibuka." });
    }

    if (job.deadline && new Date() > new Date(job.deadline)) {
      return res.status(400).json({ message: "Pendaftaran ditutup." });
    }

    if (job.maxApplicants && job._count.applications >= job.maxApplicants) {
      return res.status(400).json({ message: "Kuota penuh." });
    }

    // 2. Cek Duplikasi
    const existing = await prisma.jobApplication.findUnique({
      where: { jobId_workerId: { jobId: parseInt(jobId), workerId: workerId } }
    });
    if (existing) return res.status(400).json({ message: "Sudah melamar." });

    // 3. Simpan Lamaran
    const application = await prisma.jobApplication.create({
      data: {
        jobId: parseInt(jobId),
        workerId: workerId,
        status: 'PENDING'
      }
    });

    return res.status(201).json({
      message: "Berhasil melamar! Profil & Portfolio Anda sudah terkirim ke Employer.",
      data: application
    });

  } catch (error) {
    console.error("Apply Error:", error);
    res.status(500).json({ message: "Server Error." });
  }
};

// ========================================================
// 2. EMPLOYER LIHAT PELAMAR (+ PORTFOLIO BAWAAN)
// ========================================================
export const getJobApplicants = async (req, res) => {
  try {
    const { jobId } = req.params;
    const employerId = req.employerId;

    const job = await prisma.job.findUnique({ where: { id: parseInt(jobId) } });
    if (!job || job.employerId !== employerId) {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    const applicants = await prisma.jobApplication.findMany({
      where: { jobId: parseInt(jobId) },
      include: {
        worker: {
          include: {
            user: { select: { name: true, email: true } },
            
            // [PENTING] Ambil Portfolio Bawaan App
            // Kita ambil portfolio yang poinnya paling tinggi / terbaru
            portfolios: {
              include: {
                quest: true, // Supaya Employer tahu ini portfolio dari Quest apa
                submission: { select: { fileUrl: true, rating: true } } // Lihat hasil kerjanya
              },
              orderBy: { points: 'desc' } // Tampilkan portfolio terbaik di atas
            }
          }
        }
      },
      orderBy: { appliedAt: 'desc' }
    });

    return res.status(200).json({
      message: "Data pelamar berhasil diambil.",
      data: applicants
    });

  } catch (error) {
    console.error("Get Applicants Error:", error);
    res.status(500).json({ message: "Server Error." });
  }
};

// ========================================================
// 3. EMPLOYER UPDATE STATUS (TERIMA / TOLAK)
// ========================================================
export const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params; // ID Lamaran (bukan ID Job)
    const { status } = req.body;          // "ACCEPTED" atau "REJECTED"
    const employerId = req.employerId;    // Dari Middleware

    // 1. Validasi Input Status
    // Harus sesuai dengan Enum ApplicationStatus di Prisma
    const validStatuses = ['PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Status tidak valid. Pilih salah satu: ${validStatuses.join(', ')}` 
      });
    }

    // 2. Cari Lamaran + Include Job (untuk cek pemilik)
    const application = await prisma.jobApplication.findUnique({
      where: { id: parseInt(applicationId) },
      include: { 
        job: true // Kita butuh data job untuk cek employerId
      }
    });

    if (!application) {
      return res.status(404).json({ message: "Data lamaran tidak ditemukan." });
    }

    // 3. Security Check (Validasi Kepemilikan)
    // Pastikan yang mengubah status adalah pemilik lowongan tersebut
    if (application.job.employerId !== employerId) {
      return res.status(403).json({ message: "Anda tidak memiliki hak akses untuk lamaran ini." });
    }

    // 4. Lakukan Update
    const updatedApplication = await prisma.jobApplication.update({
      where: { id: parseInt(applicationId) },
      data: { status: status }
    });

    // (Opsional) Di sini nanti bisa tambahkan notifikasi email ke Worker
    // sendEmailToWorker(workerEmail, "Selamat! Lamaran Anda diterima.");

    return res.status(200).json({
      message: `Status lamaran berhasil diubah menjadi ${status}`,
      data: updatedApplication
    });

  } catch (error) {
    console.error("Update App Status Error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};