import jwt from 'jsonwebtoken';
import { PrismaClient } from '../generated/prisma/index.js';
import "dotenv/config";

const prisma = new PrismaClient();

// 1. Cek apakah Token Valid?
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <TOKEN>"

  if (!token) return res.status(401).json({ message: "Akses ditolak. Token tidak ditemukan." });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Simpan data user (id, email, role) ke request
    next();
  } catch (error) {
    res.status(403).json({ message: "Token tidak valid atau kadaluwarsa." });
  }
};

// 2. Cek apakah User adalah Employer?
export const verifyEmployer = async (req, res, next) => {
  // Cek role dari token dulu biar cepat
  if (req.user.role !== 'EMPLOYER') {
    return res.status(403).json({ message: "Hanya Employer yang boleh posting pekerjaan." });
  }

  // Ambil ID Employer dari database berdasarkan User ID
  const employer = await prisma.employer.findUnique({
    where: { userId: req.user.id }
  });

  if (!employer) {
    return res.status(404).json({ message: "Profile Employer tidak ditemukan." });
  }

  // Simpan employerId agar bisa dipakai di Controller
  req.employerId = employer.id;
  next();
};

export const verifyWorker = async (req, res, next) => {
  // Cek role dari token dulu biar cepat
  if (req.user.role !== 'WORKER') {
    return res.status(403).json({ message: "Hanya Worker yang boleh melamar pekerjaan." });
  }

  // Ambil ID Employer dari database berdasarkan User ID
  const worker = await prisma.worker.findUnique({
    where: { userId: req.user.id }
  });

  if (!worker) {
    return res.status(404).json({ message: "Profile Worker tidak ditemukan." });
  }

  // Simpan workerId agar bisa dipakai di Controller
  req.workerId = worker.id;
  next();
};