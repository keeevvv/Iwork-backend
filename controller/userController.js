
import { PrismaClient } from '../generated/prisma/index.js';
import "dotenv/config";

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 1. Validasi Input Dasar
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Semua field harus diisi!" });
    }

    // 2. Validasi Role (Harus sesuai ENUM di schema.prisma)
    const validRoles = ['EMPLOYER', 'WORKER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Role tidak valid. Gunakan 'EMPLOYER' atau 'WORKER'" });
    }

    // 3. Cek apakah email sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { email: email }
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    // 4. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Buat User + Profile (Employer/Worker) dalam satu Transaksi
    // Prisma 'Nested Write' akan otomatis membuat relasi di tabel Employer/Worker
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role, // Enum value
        
        // Jika Role EMPLOYER, buat entry di tabel Employer
        employer: role === 'EMPLOYER' ? {
          create: {} // Object kosong karena id & userId auto-generated/linked
        } : undefined,

        // Jika Role WORKER, buat entry di tabel Worker
        worker: role === 'WORKER' ? {
          create: {} 
        } : undefined,
      },
      // Pilih field apa yang mau dikembalikan (jangan kembalikan password)
      include: {
        employer: true,
        worker: true
      }
    });

    // 6. Response Sukses
    return res.status(201).json({
      message: "Registrasi berhasil!",
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        profileId: role === 'EMPLOYER' ? newUser.employer?.id : newUser.worker?.id
      }
    });

  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validasi Input
    if (!email || !password) {
      return res.status(400).json({ message: "Email dan Password wajib diisi!" });
    }

    // 2. Cari User berdasarkan Email
    // Kita include employer/worker supaya nanti bisa kirim ID profilnya
    const user = await prisma.user.findUnique({
      where: { email: email },
      include: {
        employer: true,
        worker: true
      }
    });

    // 3. Cek apakah user ada?
    if (!user) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // 4. Cek Password (Compare hash)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // 5. Buat JWT Token
    // Payload: data yang disimpan dalam token (jangan simpan password di sini!)
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d' // Token berlaku 1 hari
    });

    // 6. Tentukan profileId berdasarkan role
    // Supaya frontend tahu harus redirect ke dashboard Worker atau Employer
    const profileId = user.role === 'EMPLOYER' ? user.employer?.id : user.worker?.id;

    // 7. Response Sukses
    return res.status(200).json({
      message: "Login berhasil!",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileId: profileId
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};