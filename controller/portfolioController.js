import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

// Get All Portfolios for a specific User
export const getUserPortfolios = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const whereClause = {
            worker: { userId: parseInt(userId) }
        };

        const portfolios = await prisma.portfolio.findMany({
            where: whereClause,
            take: parseInt(limit),
            skip: skip,
            include: {
                worker: {
                    include: {
                        user: { select: { name: true, email: true } }
                    }
                },
                quest: { select: { title: true, tier: true } },
                submission: { select: { fileUrl: true, rating: true, feedback: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const total = await prisma.portfolio.count({ where: whereClause });

        res.status(200).json({
            message: "Berhasil mengambil portfolio user.",
            meta: {
                page: parseInt(page),
                totalData: total,
                totalPage: Math.ceil(total / parseInt(limit))
            },
            data: portfolios
        });
    } catch (error) {
        console.error("Get User Portfolios Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get Specific Portfolio Item for a User
export const getUserPortfolioById = async (req, res) => {
    try {
        const { userId, id } = req.params;

        const portfolio = await prisma.portfolio.findUnique({
            where: { id: parseInt(id) },
            include: {
                worker: {
                    include: {
                        user: { select: { name: true, email: true } }
                    }
                },
                quest: { select: { title: true, description: true, tier: true } },
                submission: { select: { fileUrl: true, rating: true, feedback: true, submittedAt: true } }
            }
        });

        if (!portfolio) {
            return res.status(404).json({ message: "Portfolio tidak ditemukan." });
        }

        // Verify it belongs to the requested User
        if (portfolio.worker.userId !== parseInt(userId)) {
            return res.status(404).json({ message: "Portfolio tidak ditemukan untuk user ini." });
        }

        res.status(200).json({
            message: "Detail Portfolio",
            data: portfolio
        });
    } catch (error) {
        console.error("Get Portfolio By ID Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
