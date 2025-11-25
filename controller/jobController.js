import { PrismaClient } from '../generated/prisma/index.js';
import midtransClient from 'midtrans-client';

const prisma = new PrismaClient();

// Setup Midtrans
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

export const createJob = async (req, res) => {
  try {
    // 1. Ambil Data dari Body
    const { 
      title, description, location, 
      salary, jobType, maxApplicants, deadline 
    } = req.body;
    
    const userId = req.user.id;       // Dari verifyToken
    const employerId = req.employerId; // Dari verifyEmployer

    // 2. Validasi Input Dasar
    if (!title || !description || !salary || !location || !jobType) {
      return res.status(400).json({ message: "Mohon lengkapi data (Title, Desc, Salary, Location, Type)." });
    }

    // 3. Tentukan Biaya Iklan (Misal: Rp 50.000 per post)
    const POSTING_FEE = 50000;

    // 4. Mulai Transaksi Database (Agar Job & Payment terbuat bersamaan)
    const result = await prisma.$transaction(async (tx) => {
      
      // A. Buat Job Baru (Status UNPAID)
      const newJob = await tx.job.create({
        data: {
          title,
          description,
          location,
          salary: parseInt(salary), // Gaji untuk worker
          jobType,                  // FULL_TIME, FREELANCE, dll
          maxApplicants: maxApplicants ? parseInt(maxApplicants) : 50,
          deadline: deadline ? new Date(deadline) : null,
          status: 'UNPAID',
          employerId: employerId
        }
      });

      // B. Buat Payment Record (Status PENDING)
      const newPayment = await tx.payment.create({
        data: {
          userId: userId,
          amount: POSTING_FEE, // Biaya yang harus dibayar employer
          type: 'JOB_POST',
          status: 'PENDING',
          job: { connect: { id: newJob.id } } // Hubungkan ke Job tadi
        }
      });

      // C. Update Job untuk simpan ID Payment
      await tx.job.update({
        where: { id: newJob.id },
        data: { paymentId: newPayment.id }
      });

      return { job: newJob, payment: newPayment };
    });

    // 5. Generate Midtrans Token
    // Buat Order ID unik: JOBPOST-{PaymentID}-{Timestamp}
    const midtransOrderId = `JOBPOST-${result.payment.id}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: POSTING_FEE
      },
      customer_details: {
        first_name: req.user.name,
        email: req.user.email
      },
      item_details: [{
        id: "JOB-FEE-01",
        price: POSTING_FEE,
        quantity: 1,
        name: "Biaya Posting Job"
      }]
    };

    const transaction = await snap.createTransaction(parameter);

    // 6. Update Payment dengan URL Midtrans (Opsional, biar tersimpan di DB)
    await prisma.payment.update({
      where: { id: result.payment.id },
      data: {
        snapToken: transaction.token,
        paymentUrl: transaction.redirect_url
      }
    });

    // 7. Kirim Response ke Client
    return res.status(201).json({
      message: "Job berhasil dibuat. Silakan selesaikan pembayaran.",
      data: {
        jobId: result.job.id,
        title: result.job.title,
        status: result.job.status
      },
      payment: {
        amount: POSTING_FEE,
        redirect_url: transaction.redirect_url,
        token: transaction.token
      }
    });

  } catch (error) {
    console.error("Create Job Error:", error);
    // Handle error validasi Enum Prisma
    if (error.code === 'P2002') {
       return res.status(400).json({ message: "Data unik sudah ada." });
    }
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ... import yang sudah ada

export const getAllJobs = async (req, res) => {
  try {
    const { search, location, type, page = 1, limit = 10 } = req.query;

    // 1. Build Query 'Where'
    const whereClause = {
      status: 'OPEN' // Hanya tampilkan yang sudah dibayar & aktif
    };

    // Filter Search (Judul)
    if (search) {
      whereClause.title = {
        contains: search,
       
      };
    }

    // Filter Lokasi
    if (location) {
      whereClause.location = {
        contains: location,
       
      };
    }

    // Filter Tipe (FULL_TIME, FREELANCE, dll)
    if (type) {
      whereClause.jobType = type;
    }

    // 2. Hitung Skip untuk Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 3. Ambil Data
    const jobs = await prisma.job.findMany({
      where: whereClause,
      take: parseInt(limit),
      skip: skip,
      orderBy: { createdAt: 'desc' }, // Terlama di bawah
      include: {
        employer: {
          include: {
            user: { select: { name: true, email: true } } // Tampilkan nama perusahaan
          }
        },
        _count: { select: { applications: true } } // Tampilkan jumlah pelamar saat ini
      }
    });

    // Hitung total untuk info pagination
    const totalJobs = await prisma.job.count({ where: whereClause });

    return res.status(200).json({
      message: "Berhasil mengambil daftar pekerjaan.",
      meta: {
        page: parseInt(page),
        totalData: totalJobs,
        totalPage: Math.ceil(totalJobs / parseInt(limit))
      },
      data: jobs
    });

  } catch (error) {
    console.error("Get All Jobs Error:", error);
    res.status(500).json({ message: "Server Error." });
  }
};