import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

// Get Employer Dashboard Stats
export const getEmployerStats = async (req, res) => {
    try {
        const employerId = req.employerId;

        // 1. Get employer data with onetimeQuota and active subscription
        const employer = await prisma.employer.findUnique({
            where: { id: employerId },
            select: {
                onetimeQuota: true,
                quests: {
                    select: {
                        _count: {
                            select: { submissions: true }
                        }
                    }
                },
                subscriptionPlans: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        tier: true,
                        weeklyQuota: true,
                        remaining: true,
                        renewsAt: true,
                        resetAt: true,
                        isActive: true
                    }
                }
            }
        });

        if (!employer) {
            return res.status(404).json({ message: "Employer tidak ditemukan." });
        }

        // 2. Calculate total submissions
        const totalSubmissions = employer.quests.reduce((sum, quest) => {
            return sum + quest._count.submissions;
        }, 0);

        // 3. Get active subscription (first one if exists)
        const activeSubscription = employer.subscriptionPlans.length > 0
            ? employer.subscriptionPlans[0]
            : null;

        return res.status(200).json({
            message: "Berhasil mengambil statistik.",
            data: {
                onetimeQuota: employer.onetimeQuota,
                totalSubmissions: totalSubmissions,
                subscription: activeSubscription
            }
        });

    } catch (error) {
        console.error("Get Employer Stats Error:", error);
        return res.status(500).json({ message: "Gagal mengambil statistik." });
    }
};
